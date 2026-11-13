/**
 * Format-Aware Test Generation Service
 * Generates multi-section exams based on predefined formats
 */

import { supabase } from "@/integrations/supabase/client";
import { 
  ExamFormat, 
  ExamSection, 
  QuestionType, 
  getExamFormat, 
  getDefaultFormat,
  getEssayPromptGroup,
  scaledFormatSections 
} from "@/types/examFormats";
import type { TOSCriteria } from "./testGenerationService";
import { QuestionUniquenessStore, createQuestionFingerprint, extractConcept } from "./questionUniquenessChecker";
import { normalizeKnowledgeDimension, type AnswerType, type KnowledgeDimension } from "@/types/knowledge";
import {
  resolveGeneratedQuestionSubject,
  resolveSubjectMetadata,
} from "./subjectMetadataResolver";
import { shuffleExamChoices } from "@/utils/shuffleExamChoices";
import { assertTosLink } from "@/services/db/tosLink";
import { getDifficultyForBloom, type BloomLevel } from "@/utils/tosCalculator";

export interface FormatAwareTestConfig {
  format: ExamFormat;
  tosCriteria: TOSCriteria[];
  testTitle: string;
  testMetadata?: {
    subject?: string;
    subject_no?: string;
    subject_code?: string;
    academic_subject_id?: string;
    description?: string;
    subject_description?: string;
    category?: string;
    specialization?: string;
    course?: string;
    year_section?: string;
    exam_period?: string;
    school_year?: string;
    semester?: string;
    tos_id?: string;
  };
}

export interface SectionedQuestion {
  id: string;
  question_number: number;
  section_id: string;
  section_label: string;
  section_title: string;
  section_instruction?: string;
  question_text: string;
  question_type: QuestionType;
  choices?: Record<string, string> | string[];
  correct_answer: string;
  points: number;
  topic: string;
  bloom_level: string;
  difficulty: string;
  knowledge_dimension?: string;
  essay_prompt_group_id?: string;
  essay_prompt_number?: number;
  essay_prompt_start_number?: number;
  essay_prompt_end_number?: number;
}

export interface GenerationSlot {
  item_number: number;
  topic: string;
  bloom_level: string;
  difficulty: string;
  knowledge_dimension?: string;
  question_type?: string;
  section_id?: string;
  section_label?: string;
  section_title?: string;
  points_per_question?: number;
  essay_prompt_group_id?: string;
  essay_prompt_number?: number;
  essay_prompt_start_number?: number;
  essay_prompt_end_number?: number;
}

export interface QuestionCandidate {
  id?: string;
  question_text?: string;
  question_type?: string;
  choices?: unknown;
  correct_answer?: unknown;
  topic?: string;
  bloom_level?: string;
  difficulty?: string;
  knowledge_dimension?: string;
  metadata?: unknown;
}

function normalizeQuestionType(type?: string): QuestionType {
  if (!type) return 'mcq';
  const normalized = type.toLowerCase().replace(/[^a-z0-9]+/g, '_');
  if (['mcq', 'multiple_choice', 'multiple-choice', 'multiple choice'].includes(normalized)) return 'mcq';
  if (['true_false', 'true-false', 'true false', 'truefalse', 'true/false'].includes(normalized)) return 'true_false';
  if (['fill_blank', 'fill_in_the_blank', 'fill_in_blank', 'short_answer', 'identification'].includes(normalized)) return 'fill_blank';
  if (['essay', 'long_answer', 'constructed_response'].includes(normalized)) return 'essay';
  return 'essay';
}

function mapQuestionTypeToDbQuestionTypes(type?: string): string[] {
  const normalized = normalizeQuestionType(type);
  switch (normalized) {
    case 'mcq':
      return ['mcq', 'multiple-choice', 'multiple_choice', 'multiple choice'];
    case 'true_false':
      return ['true_false', 'true-false', 'true false', 'truefalse', 'true/false'];
    case 'fill_blank':
      return ['fill_blank', 'fill-in-the-blank', 'fill blank', 'fill_in_blank', 'short_answer', 'identification'];
    case 'essay':
      return ['essay', 'long_answer', 'constructed_response'];
    default:
      return [normalized];
  }
}

export function buildGenerationPlanFromTOSCriteria(tosCriteria: TOSCriteria[]): GenerationSlot[] {
  const slots: GenerationSlot[] = [];
  const seenItems = new Set<number>();

  for (const criteria of tosCriteria) {
    if (!Array.isArray(criteria.item_numbers) || criteria.item_numbers.length === 0) {
      throw new Error(
        `Format-aware generation requires explicit item_numbers for topic "${criteria.topic}" and Bloom level "${criteria.bloom_level}".`
      );
    }

    const sortedItemNumbers = [...criteria.item_numbers].sort((a, b) => a - b);
    for (const itemNumber of sortedItemNumbers) {
      if (itemNumber < 1) {
        throw new Error(`Invalid TOS item_number ${itemNumber} for topic "${criteria.topic}". Item numbers must begin at 1.`);
      }
      if (seenItems.has(itemNumber)) {
        throw new Error(`Duplicate TOS item_number ${itemNumber} found. Each item slot must be unique.`);
      }
      seenItems.add(itemNumber);
      slots.push({
        item_number: itemNumber,
        topic: criteria.topic,
        bloom_level: criteria.bloom_level,
        difficulty: criteria.difficulty,
        knowledge_dimension: criteria.knowledge_dimension,
        question_type: normalizeQuestionType(criteria.question_type)
      });
    }

    if (criteria.count !== criteria.item_numbers.length) {
      console.warn(
        `TOS criteria mismatch for ${criteria.topic} / ${criteria.bloom_level}: count=${criteria.count}, item_numbers.length=${criteria.item_numbers.length}`
      );
    }
  }

  slots.sort((a, b) => a.item_number - b.item_number);
  if (slots.length > 0) {
    const maxItemNumber = slots[slots.length - 1].item_number;
    const missingItems: number[] = [];
    for (let i = 1; i <= maxItemNumber; i += 1) {
      if (!seenItems.has(i)) missingItems.push(i);
    }
    if (missingItems.length > 0) {
      throw new Error(
        `TOS item placement must define a contiguous assignment from 1 to ${maxItemNumber}. Missing item numbers: ${missingItems.join(', ')}`
      );
    }
  }

  return slots;
}

export function assignSlotsToSections(slots: GenerationSlot[], sections: ExamSection[]) {
  return slots.map((slot) => {
    const section = sections.find(
      (s) => slot.item_number >= s.startNumber && slot.item_number <= s.endNumber
    );

    if (!section) {
      throw new Error(
        `Slot ${slot.item_number} is outside the scaled exam sections. Check the format and TOS alignment.`
      );
    }

    const normalizedSectionType = normalizeQuestionType(section.questionType);
    const essayPromptGroup = getEssayPromptGroup(section, slot.item_number);

    return {
      ...slot,
      section_id: section.id,
      section_label: section.label,
      section_title: section.title,
      points_per_question: essayPromptGroup
        ? section.pointsPerQuestion / (essayPromptGroup.endNumber - essayPromptGroup.startNumber + 1)
        : section.pointsPerQuestion,
      essay_prompt_group_id: essayPromptGroup?.id,
      essay_prompt_number: essayPromptGroup?.number,
      essay_prompt_start_number: essayPromptGroup?.startNumber,
      essay_prompt_end_number: essayPromptGroup?.endNumber,
      question_type: normalizedSectionType
    };
  });
}

const QUESTION_STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'based', 'by', 'can', 'does',
  'for', 'from', 'given', 'how', 'in', 'into', 'is', 'it', 'must', 'needs',
  'of', 'on', 'or', 'result', 'should', 'that', 'the', 'their', 'this', 'to',
  'using', 'was', 'what', 'when', 'which', 'who', 'why', 'with'
]);

const QUESTION_SYNONYMS: Record<string, string> = {
  average: 'mean',
  calculate: 'compute',
  chief: 'main',
  choose: 'select',
  chosen: 'select',
  computes: 'compute',
  calculating: 'compute',
  calculates: 'compute',
  determine: 'compute',
  determines: 'compute',
  find: 'compute',
  function: 'purpose',
  functions: 'purpose',
  mean: 'mean',
  median: 'median',
  major: 'main',
  main: 'main',
  method: 'approach',
  methods: 'approach',
  objective: 'purpose',
  objectives: 'purpose',
  primary: 'main',
  role: 'purpose',
  roles: 'purpose',
  serves: 'purpose',
  score: 'value',
  scores: 'value',
  task: 'purpose',
  tasks: 'purpose',
  value: 'value',
  values: 'value'
};

function normalizedWords(text: string): string[] {
  return text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 1 && !QUESTION_STOP_WORDS.has(word))
    .map((word) => QUESTION_SYNONYMS[word] || word);
}

function normalizeQuestionText(text: string): string {
  return normalizedWords(text).join(' ');
}

function tokenSimilarity(left: string, right: string): number {
  const leftTokens = new Set(normalizedWords(left));
  const rightTokens = new Set(normalizedWords(right));
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;
  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  return intersection / (leftTokens.size + rightTokens.size - intersection);
}

function objectiveText(text: string): string {
  const sentences = text.split(/[.!?]+\s*/).filter(Boolean);
  return sentences.length > 1 ? sentences[sentences.length - 1] : text;
}

function correctAnswerContent(question: QuestionCandidate): string {
  const answer = question.correct_answer;
  if (typeof answer !== 'string' || !answer.trim()) return '';
  const choices = question.choices;
  const letter = answer.trim().toUpperCase();
  if (Array.isArray(choices)) {
    const index = ['A', 'B', 'C', 'D'][['A', 'B', 'C', 'D'].indexOf(letter)];
    if (index) {
      const choice = choices[['A', 'B', 'C', 'D'].indexOf(letter)];
      if (choice != null) return String(choice);
    }
  } else if (choices && typeof choices === 'object') {
    const choice = (choices as Record<string, unknown>)[letter] ?? (choices as Record<string, unknown>)[letter.toLowerCase()];
    if (choice != null) return String(choice);
  }
  return answer;
}

function getObjectiveAnchors(text: string): Set<string> {
  const lowerText = text.toLowerCase();
  const normalized = normalizeQuestionText(text);
  const anchors = new Set<string>();

  if (
    /\b(?:ram|random access memory)\b/.test(lowerText) &&
    /\b(?:volatile|working memory|temporary|temporarily)\b/.test(lowerText) &&
    /\b(?:cpu|processor|instructions?|data)\b/.test(lowerText)
  ) {
    anchors.add('volatile-working-memory-role');
  }

  if (
    /\bnorthbridge\b/.test(lowerText) &&
    /\bsouthbridge\b/.test(lowerText) &&
    /\b(?:function\w*|role\w*|manag\w*|handl\w*|differ\w*|data flow)\b/.test(lowerText)
  ) {
    anchors.add('northbridge-southbridge-roles');
  }

  if (
    /\boptical\b/.test(normalized) &&
    /\b(?:mouse|mice|input device|input devices)\b/.test(normalized) &&
    /\b(?:surface|movement|track|tracking|coordinate)\b/.test(normalized)
  ) {
    anchors.add('optical-mouse-surface-tracking');
  }

  if (
    /\boutput devices?\b/.test(lowerText) &&
    /\b(?:visual|projector|project\w*|monitor|display)\b/.test(lowerText) &&
    (/\b(?:identif\w*|describ\w*)\b/.test(lowerText) || /\bwhich\s+(?:output\s+)?(?:term|device|class|type)\b/.test(lowerText))
  ) {
    anchors.add('visual-output-device-identification');
  }

  if (
    /\b(?:medical|diagnostic|dicom)\b/.test(normalized) &&
    /\b(?:output device|output devices|printer|printing)\b/.test(normalized) &&
    /\b(?:continuous tone|grayscale|gray scale)\b/.test(normalized) &&
    /\b(?:archival|permanence|permanent|stability)\b/.test(normalized) &&
    /\b(?:which device|most appropriate|evaluate|evaluating|select)\b/.test(normalized)
  ) {
    anchors.add('medical-imaging-output-selection');
  }

  return anchors;
}

export function getQuestionDuplicateReason(
  candidate: QuestionCandidate,
  existing: QuestionCandidate
): string | undefined {
  if (candidate.id && existing.id && candidate.id === existing.id) return undefined;

  const candidateText = String(candidate.question_text || '').trim();
  const existingText = String(existing.question_text || '').trim();
  if (!candidateText || !existingText) return undefined;

  const candidateNormalized = normalizeQuestionText(candidateText);
  const existingNormalized = normalizeQuestionText(existingText);
  if (candidateNormalized && candidateNormalized === existingNormalized) {
    return 'Exact duplicate question text after normalization.';
  }

  const stemSimilarity = tokenSimilarity(candidateText, existingText);
  if (stemSimilarity >= 0.68) {
    return `Near-duplicate wording (content-token similarity ${stemSimilarity.toFixed(2)}).`;
  }
  const objectiveSimilarity = Math.max(
    stemSimilarity,
    tokenSimilarity(objectiveText(candidateText), objectiveText(existingText))
  );

  const candidateAnswer = correctAnswerContent(candidate);
  const existingAnswer = correctAnswerContent(existing);
  const answerSimilarity = candidateAnswer && existingAnswer
    ? tokenSimilarity(candidateAnswer, existingAnswer) || (normalizeQuestionText(candidateAnswer) === normalizeQuestionText(existingAnswer) ? 1 : 0)
    : 0;
  const topicSimilarity = tokenSimilarity(candidate.topic || '', existing.topic || '');
  const candidateAnchors = getObjectiveAnchors(`${candidateText} ${candidateAnswer}`);
  const existingAnchors = getObjectiveAnchors(`${existingText} ${existingAnswer}`);
  const sharedAnchors = [...candidateAnchors].filter((anchor) => existingAnchors.has(anchor));

  if (
    answerSimilarity >= 0.75 &&
    objectiveSimilarity >= 0.65 &&
    topicSimilarity >= 0.5
  ) {
    return `Substantially similar objective and expected answer (objective ${objectiveSimilarity.toFixed(2)}, answer ${answerSimilarity.toFixed(2)}).`;
  }

  if (sharedAnchors.length > 0) {
    return `Substantially similar learning objective (${sharedAnchors.join(', ')}).`;
  }

  return undefined;
}

export function validateQuestionForType(
  question: QuestionCandidate,
  expectedType: QuestionType
): string[] {
  const errors: string[] = [];
  const actualType = normalizeQuestionType(question.question_type);
  if (actualType !== expectedType) {
    errors.push(`question type must be "${expectedType}", got "${question.question_type || 'missing'}".`);
  }
  if (!String(question.question_text || '').trim()) errors.push('question text is missing.');

  if (expectedType === 'mcq') {
    const choices = question.choices;
    let values: string[] = [];
    if (Array.isArray(choices)) {
      values = choices.map((value) => String(value ?? '').trim());
    } else if (choices && typeof choices === 'object') {
      const choiceRecord = choices as Record<string, unknown>;
      const keys = Object.keys(choiceRecord).map((key) => key.toUpperCase()).sort();
      if (keys.length !== 4 || keys.join(',') !== 'A,B,C,D') {
        errors.push('MCQ must contain exactly options A, B, C, and D.');
      }
      values = ['A', 'B', 'C', 'D'].map((key) =>
        String(choiceRecord[key] ?? choiceRecord[key.toLowerCase()] ?? '').trim()
      );
    }
    if (values.length !== 4 || values.some((value) => !value)) {
      if (!errors.some((error) => error.startsWith('MCQ must contain'))) {
        errors.push('MCQ must contain exactly four non-empty options A, B, C, and D.');
      }
    }
    if (new Set(values.map(normalizeQuestionText)).size !== values.length) {
      errors.push('MCQ options must be distinct.');
    }

    const answer = question.correct_answer;
    if (typeof answer !== 'string' || !answer.trim()) {
      errors.push('MCQ must have exactly one correct answer.');
    } else {
      const normalizedAnswer = answer.trim().toUpperCase();
      const answerMatches = /^[A-D]$/.test(normalizedAnswer)
        ? 1
        : values.filter((value) => normalizeQuestionText(value) === normalizeQuestionText(answer)).length;
      if (answerMatches !== 1) errors.push('MCQ correct answer must identify exactly one of options A-D.');
    }
  } else if (expectedType === 'true_false') {
    const choices = question.choices;
    let values: string[] = [];
    if (Array.isArray(choices)) {
      values = choices.map((value) => String(value ?? '').trim().toLowerCase());
    } else if (choices && typeof choices === 'object') {
      const normalizedChoices = choices as Record<string, unknown>;
      const keys = Object.keys(normalizedChoices).map((key) => key.toUpperCase()).sort();
      values = ['A', 'B'].map((key) =>
        String(normalizedChoices[key] ?? normalizedChoices[key.toLowerCase()] ?? '').trim().toLowerCase()
      );
      if (keys.length !== 2 || keys.join(',') !== 'A,B') values = [];
    }
    if (values.length !== 2 || values[0] !== 'true' || values[1] !== 'false') {
      errors.push('True/False questions must contain exactly the True and False options.');
    }
    const rawAnswer = String(question.correct_answer || '').trim().toLowerCase();
    const normalizedAnswer = rawAnswer === 'a' ? values[0] : rawAnswer === 'b' ? values[1] : rawAnswer;
    if (!['true', 'false'].includes(normalizedAnswer)) {
      errors.push('True/False correct answer must be exactly True or False.');
    }
  } else if (!String(question.correct_answer || '').trim()) {
    errors.push(`${expectedType} question is missing its correct answer or rubric.`);
  }

  const metadata = question.metadata;
  if (metadata && typeof metadata === 'object' && 'structure_validated' in metadata) {
    const validation = metadata as { structure_validated?: boolean; rejection_reasons?: string[] };
    if (validation.structure_validated === false) {
      errors.push(`AI Bloom/answer-structure validation failed: ${(validation.rejection_reasons || []).join(' ')}`);
    }
  }

  return errors;
}

export function buildSlotRegenerationContext(
  slot: GenerationSlot,
  rejected: Array<{ question: string; reason: string }>
) {
  return {
    question_number: slot.item_number,
    question_type: normalizeQuestionType(slot.question_type),
    topic: slot.topic,
    bloom_level: slot.bloom_level,
    difficulty: slot.difficulty,
    knowledge_dimension: normalizeKnowledgeDimension(slot.knowledge_dimension),
    essay_prompt_group_id: slot.essay_prompt_group_id,
    essay_prompt_number: slot.essay_prompt_number,
    essay_prompt_start_number: slot.essay_prompt_start_number,
    essay_prompt_end_number: slot.essay_prompt_end_number,
    rejected_questions: rejected
  };
}

export function validateGeneratedPlanQuestions(plan: GenerationSlot[], questions: SectionedQuestion[]): void {
  const errors: string[] = [];
  const expectedTopicCounts = new Map<string, number>();
  const expectedBloomCounts = new Map<string, number>();
  const seenNumbers = new Set<number>();

  plan.forEach((slot) => {
    expectedTopicCounts.set(slot.topic, (expectedTopicCounts.get(slot.topic) || 0) + 1);
    expectedBloomCounts.set(slot.bloom_level, (expectedBloomCounts.get(slot.bloom_level) || 0) + 1);
  });

  const actualTopicCounts = new Map<string, number>();
  const actualBloomCounts = new Map<string, number>();

  if (questions.length !== plan.length) {
    errors.push(`Expected ${plan.length} questions but generated ${questions.length}.`);
  }

  plan.forEach((slot) => {
    const question = questions[slot.item_number - 1];
    if (!question) {
      errors.push(`Missing question for slot ${slot.item_number}.`);
      return;
    }

    if (question.question_number !== slot.item_number) {
      errors.push(`Slot ${slot.item_number} stored question_number ${question.question_number}.`);
    }
    if (seenNumbers.has(question.question_number)) {
      errors.push(`Question number ${question.question_number} is repeated.`);
    }
    seenNumbers.add(question.question_number);
    if (question.topic !== slot.topic) {
      errors.push(`Slot ${slot.item_number} topic mismatch: expected "${slot.topic}", got "${question.topic}".`);
    }
    if (question.bloom_level !== slot.bloom_level) {
      errors.push(`Slot ${slot.item_number} bloom mismatch: expected "${slot.bloom_level}", got "${question.bloom_level}".`);
    }
    if (question.difficulty !== slot.difficulty) {
      errors.push(`Slot ${slot.item_number} difficulty mismatch: expected "${slot.difficulty}", got "${question.difficulty}".`);
    }
    if (normalizeQuestionType(question.question_type) !== normalizeQuestionType(slot.question_type)) {
      errors.push(`Slot ${slot.item_number} question type mismatch: expected "${slot.question_type}", got "${question.question_type}".`);
    }
    if (slot.section_id && question.section_id !== slot.section_id) {
      errors.push(`Slot ${slot.item_number} section mismatch: expected "${slot.section_id}", got "${question.section_id}".`);
    }
    if (slot.knowledge_dimension && question.knowledge_dimension?.toLowerCase() !== slot.knowledge_dimension.toLowerCase()) {
      errors.push(`Slot ${slot.item_number} knowledge dimension mismatch: expected "${slot.knowledge_dimension}", got "${question.knowledge_dimension}".`);
    }

    validateQuestionForType(question, normalizeQuestionType(slot.question_type)).forEach((reason) => {
      errors.push(`Question ${slot.item_number}: ${reason}`);
    });

    actualTopicCounts.set(question.topic, (actualTopicCounts.get(question.topic) || 0) + 1);
    actualBloomCounts.set(question.bloom_level, (actualBloomCounts.get(question.bloom_level) || 0) + 1);
  });

  for (const [topic, expected] of expectedTopicCounts) {
    if (actualTopicCounts.get(topic) !== expected) {
      errors.push(`Topic distribution mismatch for "${topic}": expected ${expected}, got ${actualTopicCounts.get(topic) || 0}.`);
    }
  }
  for (const [bloom, expected] of expectedBloomCounts) {
    if (actualBloomCounts.get(bloom) !== expected) {
      errors.push(`Bloom distribution mismatch for "${bloom}": expected ${expected}, got ${actualBloomCounts.get(bloom) || 0}.`);
    }
  }

  for (let index = 0; index < questions.length; index += 1) {
    for (let otherIndex = index + 1; otherIndex < questions.length; otherIndex += 1) {
      const reason = getQuestionDuplicateReason(questions[index], questions[otherIndex]);
      if (reason) {
        errors.push(`Questions ${questions[index].question_number} and ${questions[otherIndex].question_number} are duplicates: ${reason}`);
      }
    }
  }

  if (errors.length > 0) {
    throw new Error(`Format-aware TOS validation failed: ${errors.join(' ')}`);
  }
}

export function validateAnswerKey(
  questions: SectionedQuestion[],
  answerKey: Array<{ question_number?: number; question_id?: string; correct_answer?: string }>
): void {
  const errors: string[] = [];
  if (answerKey.length !== questions.length) {
    errors.push(`Expected ${questions.length} answer-key entries, got ${answerKey.length}.`);
  }
  questions.forEach((question) => {
    const entries = answerKey.filter((entry) => entry.question_number === question.question_number);
    if (entries.length !== 1) {
      errors.push(`Question ${question.question_number} must have exactly one answer-key entry.`);
      return;
    }
    if (entries[0].question_id !== question.id || entries[0].correct_answer !== question.correct_answer) {
      errors.push(`Answer-key entry for question ${question.question_number} does not match the final question.`);
    }
  });
  if (errors.length > 0) throw new Error(`Answer-key validation failed: ${errors.join(' ')}`);
}

export function buildRepairCriteriaFromTOS(tos: {
  total_items?: number;
  distribution?: Record<string, any>;
  matrix?: Record<string, any>;
}): TOSCriteria[] {
  const distribution = tos.distribution || tos.matrix;
  if (!distribution || Array.isArray(distribution) || typeof distribution !== 'object') {
    throw new Error('The saved TOS does not contain slot-level distribution metadata required for safe repair.');
  }

  const criteria: TOSCriteria[] = [];
  const bloomLevels: BloomLevel[] = [
    'remembering', 'understanding', 'applying', 'analyzing', 'evaluating', 'creating'
  ];
  for (const [topic, topicData] of Object.entries(distribution)) {
    if (!topicData || typeof topicData !== 'object') continue;
    for (const bloom of bloomLevels) {
      const cell = (topicData as Record<string, any>)[bloom];
      if (!cell || !Array.isArray(cell.items)) {
        if (Number(cell?.count || 0) > 0) {
          throw new Error(`Saved TOS slot numbers are missing for ${topic} / ${bloom}.`);
        }
        continue;
      }
      if (cell.items.length === 0) continue;

      const knowledgeDimension = bloom === 'remembering' ? 'Factual'
        : bloom === 'applying' ? 'Procedural'
        : bloom === 'creating' || bloom === 'evaluating' ? 'Metacognitive'
        : 'Conceptual';
      criteria.push({
        topic,
        bloom_level: bloom,
        knowledge_dimension: knowledgeDimension,
        difficulty: getDifficultyForBloom(bloom),
        count: cell.items.length,
        item_numbers: [...cell.items]
      });
    }
  }

  const slotCount = criteria.reduce((sum, criterion) => sum + criterion.count, 0);
  if (!slotCount || (tos.total_items != null && slotCount !== tos.total_items)) {
    throw new Error(
      `Saved TOS slot metadata is incomplete: expected ${tos.total_items ?? 'a positive number of'} items, found ${slotCount}.`
    );
  }
  return criteria;
}

export interface FormatAwareRepairTest {
  id: string;
  format_id?: string | null;
  tos_id?: string | null;
  validation_status?: string | null;
  items?: unknown;
  answer_key?: unknown;
}

export async function repairFormatAwareTest(test: FormatAwareRepairTest): Promise<{
  repaired: boolean;
  items: SectionedQuestion[];
  answer_key: Array<Record<string, unknown>>;
  replacedQuestionNumbers: number[];
}> {
  if (test.validation_status === 'pending_validation' || test.validation_status === 'validated') {
    return {
      repaired: false,
      items: Array.isArray(test.items) ? test.items as SectionedQuestion[] : [],
      answer_key: Array.isArray(test.answer_key) ? test.answer_key as Array<Record<string, unknown>> : [],
      replacedQuestionNumbers: []
    };
  }

  if (!test.tos_id) {
    throw new Error(`Cannot safely repair examination ${test.id}: it is not linked to its original TOS.`);
  }

  const { data: tos, error: tosError } = await supabase
    .from('tos_entries')
    .select('total_items, distribution, matrix')
    .eq('id', test.tos_id)
    .single();
  if (tosError) {
    throw new Error(`Cannot repair examination ${test.id}: unable to retrieve its original TOS: ${tosError.message}`);
  }
  if (!tos) {
    throw new Error(`Cannot repair examination ${test.id}: its original TOS was not found.`);
  }

  const sourceItems = Array.isArray(test.items) ? test.items as Record<string, any>[] : [];
  if (!test.format_id) {
    if (sourceItems.length >= Number(tos.total_items || 0)) {
      return {
        repaired: false,
        items: sourceItems as SectionedQuestion[],
        answer_key: Array.isArray(test.answer_key) ? test.answer_key as Array<Record<string, unknown>> : [],
        replacedQuestionNumbers: []
      };
    }
    throw new Error(
      `Cannot safely repair examination ${test.id}: it has no saved format_id. Recreate it with a selected format first.`
    );
  }
  const format = getExamFormat(test.format_id);
  if (!format) {
    throw new Error(`Cannot repair examination ${test.id}: unsupported saved format "${test.format_id}".`);
  }

  const criteria = buildRepairCriteriaFromTOS(tos as any);
  const plan = buildGenerationPlanFromTOSCriteria(criteria);
  if (plan.length !== tos.total_items) {
    throw new Error(`Cannot repair examination ${test.id}: its TOS item count does not match the saved slot plan.`);
  }
  const sections = scaledFormatSections(format, plan.length);
  const sectionedPlan = assignSlotsToSections(plan, sections);
  const sectionById = new Map(sections.map((section) => [section.id, section]));

  const topicNames = [...new Set(sectionedPlan.map((slot) => slot.topic))];
  let bankQuestions: QuestionCandidate[] | undefined;
  const getRepairBankQuestions = async () => {
    if (bankQuestions) return bankQuestions;
    bankQuestions = [];
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await supabase
        .from('questions')
        .select('id, question_text, question_type, choices, correct_answer, topic, bloom_level, difficulty, knowledge_dimension')
        .eq('deleted', false)
        .eq('approved', true)
        .in('topic', topicNames)
        .range(offset, offset + 499);
      if (error) {
        bankQuestions = undefined;
        throw new Error(`Unable to check the question bank during repair: ${error.message}`);
      }
      bankQuestions.push(...(data || []));
      if (!data || data.length < 500) break;
    }
    return bankQuestions;
  };

  const itemsByNumber = new Map<number, Record<string, any>>();
  sourceItems.forEach((item, index) => {
    const number = Number.isInteger(item.question_number) ? item.question_number : index + 1;
    if (!itemsByNumber.has(number)) itemsByNumber.set(number, item);
  });

  const repairedItems: SectionedQuestion[] = new Array(plan.length);
  const replacedQuestionNumbers: number[] = [];
  const rejectionReasons = new Map<number, Array<{ question: string; reason: string }>>();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Cannot repair examination: user is not authenticated.');
  const repairDuplicateReason = (candidate: QuestionCandidate, existing: QuestionCandidate) => {
    if (candidate.id && existing.id && candidate.id === existing.id) {
      return 'The same question-bank record is already used by another examination slot.';
    }
    return getQuestionDuplicateReason(candidate, existing);
  };

  const slotErrors = (slot: GenerationSlot, item: Record<string, any> | undefined): string[] => {
    if (!item) return ['Question is missing.'];
    const errors = validateQuestionForType(item, normalizeQuestionType(slot.question_type));
    if (item.question_number !== slot.item_number) errors.push('Question number does not match its TOS slot.');
    if (item.topic !== slot.topic) errors.push('Topic does not match its TOS slot.');
    if (item.bloom_level !== slot.bloom_level) errors.push("Bloom level does not match its TOS slot.");
    if (String(item.difficulty || '').toLowerCase() !== slot.difficulty.toLowerCase()) {
      errors.push('Difficulty does not match its TOS slot.');
    }
    if (slot.knowledge_dimension && String(item.knowledge_dimension || '').toLowerCase() !== slot.knowledge_dimension.toLowerCase()) {
      errors.push('Knowledge dimension does not match its TOS slot.');
    }
    if (item.section_id !== slot.section_id) errors.push('Section does not match the saved examination format.');
    return errors;
  };

  for (const slot of sectionedPlan) {
    const original = itemsByNumber.get(slot.item_number);
    const errors = slotErrors(slot, original);
    const previous = repairedItems.filter(Boolean);
    const duplicate = original && errors.length === 0
      ? previous.map((item) => repairDuplicateReason(original, item)).find(Boolean)
      : undefined;
    if (duplicate) errors.push(duplicate);

    if (original && errors.length === 0) {
      repairedItems[slot.item_number - 1] = original as SectionedQuestion;
      continue;
    }

    replacedQuestionNumbers.push(slot.item_number);
    const rejected = rejectionReasons.get(slot.item_number) || [];
    if (original) {
      rejected.push({
        question: String(original.question_text || ''),
        reason: errors.join(' ')
      });
    }
    rejectionReasons.set(slot.item_number, rejected);

    const criterion = criteria.find((candidate) =>
      candidate.topic === slot.topic &&
      candidate.bloom_level === slot.bloom_level &&
      candidate.difficulty === slot.difficulty &&
      candidate.item_numbers?.includes(slot.item_number)
    );
    if (!criterion) {
      throw new Error(`Cannot repair question ${slot.item_number}: no original TOS criterion was found.`);
    }

    const bankCandidates = await getRepairBankQuestions();
    let accepted: QuestionCandidate | undefined;
    for (const candidate of bankCandidates) {
      if (
        candidate.topic !== slot.topic ||
        candidate.bloom_level !== slot.bloom_level ||
        String(candidate.difficulty || '').toLowerCase() !== slot.difficulty.toLowerCase() ||
        normalizeQuestionType(candidate.question_type) !== normalizeQuestionType(slot.question_type)
      ) continue;
      const typeErrors = validateQuestionForType(candidate, normalizeQuestionType(slot.question_type));
      const duplicateReason = [
        ...previous,
        ...sourceItems.filter((item) => item.question_number !== slot.item_number),
        ...bankCandidates.filter((item) => item.id !== candidate.id)
      ]
        .map((item) => repairDuplicateReason(candidate, item))
        .find(Boolean);
      if (typeErrors.length || duplicateReason) {
        rejected.push({
          question: String(candidate.question_text || ''),
          reason: [...typeErrors, ...(duplicateReason ? [duplicateReason] : [])].join(' ')
        });
        continue;
      }
      accepted = candidate;
      break;
    }

    const slotCriterion: TOSCriteria = {
      ...criterion,
      count: 1,
      item_numbers: [slot.item_number],
      question_type: normalizeQuestionType(slot.question_type)
    };
    for (let attempt = 1; attempt <= 3 && !accepted; attempt += 1) {
      const [candidate] = await generateTypedQuestionsViaAI(
        normalizeQuestionType(slot.question_type),
        [slotCriterion],
        1,
        user.id,
        { slot, rejected }
      );
      if (!candidate) {
        rejected.push({ question: '', reason: `No question was returned on repair attempt ${attempt}.` });
        continue;
      }
      const typeErrors = validateQuestionForType(candidate, normalizeQuestionType(slot.question_type));
      const duplicateReason = [
        ...previous,
        ...sourceItems.filter((item) => item.question_number !== slot.item_number),
        ...bankCandidates
      ]
        .map((item) => repairDuplicateReason(candidate, item))
        .find(Boolean);
      if (typeErrors.length || duplicateReason) {
        rejected.push({
          question: String(candidate.question_text || ''),
          reason: [...typeErrors, ...(duplicateReason ? [duplicateReason] : [])].join(' ')
        });
        continue;
      }
      accepted = candidate;
    }

    if (!accepted) {
      throw new Error(
        `Unable to repair question ${slot.item_number} (${slot.topic}, ${slot.bloom_level}, ${slot.question_type}). ${rejected.map((entry) => entry.reason).filter(Boolean).join(' | ')}`
      );
    }

    const section = sectionById.get(slot.section_id!);
    repairedItems[slot.item_number - 1] = {
      ...accepted,
      id: accepted.id || `repair-${slot.item_number}-${Date.now()}`,
      question_number: slot.item_number,
      section_id: slot.section_id!,
      section_label: slot.section_label!,
      section_title: slot.section_title!,
      section_instruction: section?.instruction,
      essay_prompt_group_id: slot.essay_prompt_group_id,
      essay_prompt_number: slot.essay_prompt_number,
      essay_prompt_start_number: slot.essay_prompt_start_number,
      essay_prompt_end_number: slot.essay_prompt_end_number,
      question_type: normalizeQuestionType(slot.question_type),
      points: slot.points_per_question ?? section?.pointsPerQuestion ?? 1,
      topic: slot.topic,
      bloom_level: slot.bloom_level,
      difficulty: slot.difficulty,
      knowledge_dimension: slot.knowledge_dimension
    } as SectionedQuestion;
  }

  validateGeneratedPlanQuestions(sectionedPlan, repairedItems);
  const answerKey = repairedItems.map((item) => ({
    question_number: item.question_number,
    question_id: item.id,
    correct_answer: item.correct_answer,
    section: item.section_label,
    question_type: item.question_type,
    points: item.points
  }));
  validateAnswerKey(repairedItems, answerKey);

  const currentAnswerKey = Array.isArray(test.answer_key) ? test.answer_key : [];
  const answerKeyIsCurrent = currentAnswerKey.length === answerKey.length &&
    answerKey.every((entry: any, index: number) =>
      entry.question_number === answerKey[index].question_number &&
      entry.question_id === answerKey[index].question_id &&
      entry.correct_answer === answerKey[index].correct_answer
    );
  const changedItems = replacedQuestionNumbers.length > 0 || sourceItems.length !== repairedItems.length;
  if (!changedItems && answerKeyIsCurrent) {
    return { repaired: false, items: repairedItems, answer_key: answerKey, replacedQuestionNumbers };
  }

  const { data: updated, error: updateError } = await supabase
    .from('generated_tests')
    .update({
      items: repairedItems as any,
      answer_key: answerKey,
      format_id: format.id
    })
    .eq('id', test.id)
    .select('id')
    .single();
  if (updateError || !updated) {
    throw new Error(`Unable to save repaired examination ${test.id}: ${updateError?.message || 'No updated record was returned.'}`);
  }
  return { repaired: true, items: repairedItems, answer_key: answerKey, replacedQuestionNumbers };
}

export interface FormatAwareTestResult {
  id: string;
  title: string;
  format_id: string;
  sections: {
    id: string;
    label: string;
    title: string;
    instruction: string;
    questions: SectionedQuestion[];
    totalPoints: number;
  }[];
  answer_key: any[];
  totalItems: number;
  totalPoints: number;
}

/**
 * Main entry point for format-aware test generation
 */
export async function generateFormatAwareTest(
  config: FormatAwareTestConfig
): Promise<FormatAwareTestResult> {
  const selectedFormat = getExamFormat(config.format.id);
  if (!selectedFormat) {
    throw new Error(`Unsupported examination format "${config.format.id}".`);
  }

  console.log("🧠 === STARTING FORMAT-AWARE TEST GENERATION ===");
  console.log("📋 Format:", selectedFormat.name);
  console.log("📊 Sections:", selectedFormat.sections.length);

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error("User not authenticated");
  }

  const generationPlan = buildGenerationPlanFromTOSCriteria(config.tosCriteria);
  const requiredTotal = generationPlan.length;
  if (requiredTotal === 0) {
    throw new Error('The TOS has no assigned item slots. Generate or correct the TOS before creating an examination.');
  }
  console.log(`📊 TOS CONTRACT: ${requiredTotal} total questions required`);

  const scaledSections = scaledFormatSections(selectedFormat, requiredTotal);
  console.log("📐 Scaled sections:", scaledSections.map(s =>
    `${s.label}: ${s.endNumber - s.startNumber + 1} ${s.questionType}`
  ));

  const sectionedSlots = assignSlotsToSections(generationPlan, scaledSections);
  const topics = [...new Set(sectionedSlots.map((slot) => slot.topic))];
  const bankQuestionsForDedup: QuestionCandidate[] = [];
  const bankPageSize = 500;
  for (let offset = 0; ; offset += bankPageSize) {
    const { data, error } = await supabase
      .from('questions')
      .select('id, question_text, question_type, choices, correct_answer, topic, bloom_level, difficulty, knowledge_dimension')
      .eq('deleted', false)
      .eq('approved', true)
      .in('topic', topics)
      .range(offset, offset + bankPageSize - 1);
    if (error) {
      throw new Error(`Unable to check the question bank for duplicates: ${error.message}`);
    }
    bankQuestionsForDedup.push(...(data || []));
    if (!data || data.length < bankPageSize) break;
  }

  const sectionResults: FormatAwareTestResult['sections'] = scaledSections.map((section) => ({
    id: section.id,
    label: section.label,
    title: section.title,
    instruction: section.instruction,
    questions: [],
    totalPoints: 0
  }));

  const allQuestions: SectionedQuestion[] = new Array(requiredTotal);
  const sectionMap = new Map(scaledSections.map((section) => [section.id, section]));

  for (const slot of sectionedSlots) {
    console.log(`\n📊 Filling slot #${slot.item_number}: ${slot.topic} | ${slot.bloom_level} | ${slot.difficulty} | ${slot.section_label}`);

    let questionQuery = supabase
      .from('questions')
      .select('*')
      .eq('deleted', false)
      .eq('approved', true)
      .eq('difficulty', slot.difficulty)
      .eq('topic', slot.topic)
      .eq('bloom_level', slot.bloom_level);

    const candidateTypes = [normalizeQuestionType(slot.question_type)];
    if (candidateTypes.length === 1) {
      questionQuery = questionQuery.in('question_type', mapQuestionTypeToDbQuestionTypes(candidateTypes[0]));
    }

    const { data: existingCandidates, error: queryError } = await questionQuery
      .order('used_count', { ascending: true })
      .limit(10);

    if (queryError) {
      console.error('❌ Error querying questions for slot:', queryError);
    }

    const candidates = queryError ? [] : (existingCandidates || []);
    let chosen: QuestionCandidate | null = null;
    const rejected: Array<{ question: string; reason: string }> = [];
    const alreadySelected = allQuestions.filter(Boolean);
    const expectedType = normalizeQuestionType(slot.question_type);

    for (const candidate of candidates) {
      const formatErrors = validateQuestionForType(candidate, expectedType);
      if (formatErrors.length > 0) {
        rejected.push({ question: String(candidate.question_text || ''), reason: formatErrors.join(' ') });
        continue;
      }
      const duplicate = alreadySelected
        .map((question) => getQuestionDuplicateReason(candidate, question))
        .find(Boolean);
      if (duplicate) {
        rejected.push({ question: String(candidate.question_text || ''), reason: duplicate });
        continue;
      }
      chosen = candidate;
      break;
    }

    if (!chosen) {
      console.log(`   ⚠️ No valid unique bank candidate for slot #${slot.item_number}; generating constrained replacement.`);
      const criterion = config.tosCriteria.find((item) =>
        item.topic === slot.topic && item.bloom_level === slot.bloom_level && item.difficulty === slot.difficulty
      ) || config.tosCriteria.find((item) => item.topic === slot.topic)!;
      const slotCriterion: TOSCriteria = {
        ...criterion,
        count: 1,
        item_numbers: [slot.item_number],
        question_type: expectedType
      };

      for (let attempt = 1; attempt <= 3 && !chosen; attempt += 1) {
        let generated: QuestionCandidate[] = [];
        try {
          generated = await generateTypedQuestionsViaAI(expectedType, [slotCriterion], 1, user.id, {
            slot,
            rejected
          });
        } catch (error) {
          rejected.push({
            question: '',
            reason: error instanceof Error ? error.message : 'AI generation failed.'
          });
        }

        const candidate = generated[0];
        if (!candidate) {
          rejected.push({ question: '', reason: `No question was returned on regeneration attempt ${attempt}.` });
          continue;
        }

        const formatErrors = validateQuestionForType(candidate, expectedType);
        const duplicateSources = [
          ...alreadySelected,
          ...bankQuestionsForDedup
        ];
        const duplicate = duplicateSources
          .map((existing) => getQuestionDuplicateReason(candidate, existing))
          .find(Boolean);
        if (formatErrors.length > 0 || duplicate) {
          rejected.push({
            question: String(candidate.question_text || ''),
            reason: [...formatErrors, ...(duplicate ? [duplicate] : [])].join(' ')
          });
          continue;
        }
        chosen = candidate;
      }

      if (!chosen) {
        const reasons = rejected
          .filter((entry) => entry.reason)
          .map((entry) => entry.reason)
          .join(' | ');
        throw new Error(
          `Unable to fill question ${slot.item_number} (${slot.topic}, ${slot.bloom_level}, ${expectedType}) after 3 attempts. ${reasons}`
        );
      }

      const [savedQuestion] = await saveGeneratedQuestionsToBank(
        [chosen],
        user.id,
        [slotCriterion],
        config.testMetadata
      );
      chosen = savedQuestion || chosen;
    } else if (chosen.id) {
      try {
        const { error } = await supabase.rpc('mark_question_used', { p_question_id: chosen.id, p_test_id: null });
        if (error) console.warn(`Could not mark question ${chosen.id} as used: ${error.message}`);
      } catch (error) {
        console.warn(`Could not mark question ${chosen.id} as used:`, error);
      }
    }

    const section = sectionMap.get(slot.section_id!);
    const question: SectionedQuestion = {
      ...chosen,
      id: chosen.id || `ai-${slot.item_number}-${Date.now()}`,
      question_number: slot.item_number,
      section_id: slot.section_id!,
      section_label: slot.section_label!,
      section_title: slot.section_title!,
      section_instruction: section?.instruction,
      essay_prompt_group_id: slot.essay_prompt_group_id,
      essay_prompt_number: slot.essay_prompt_number,
      essay_prompt_start_number: slot.essay_prompt_start_number,
      essay_prompt_end_number: slot.essay_prompt_end_number,
      question_type: expectedType,
      points: slot.points_per_question ?? section?.pointsPerQuestion ?? 1,
      topic: slot.topic,
      bloom_level: slot.bloom_level,
      difficulty: slot.difficulty,
      knowledge_dimension: slot.knowledge_dimension
    } as SectionedQuestion;

    allQuestions[slot.item_number - 1] = question;

    const sectionResult = sectionResults.find((s) => s.id === slot.section_id);
    if (sectionResult) {
      sectionResult.questions.push(question);
      sectionResult.totalPoints += question.points;
    }
  }

  validateGeneratedPlanQuestions(sectionedSlots, allQuestions);

  // Final compile pass: independently shuffle MCQ choices, rebalance answer
  // letters, and recalculate the stored key before persistence/export.
  const securedQuestions = shuffleExamChoices(allQuestions).items as SectionedQuestion[];
  const securedAnswerKey = securedQuestions.map((q) => {
    return {
      question_number: q.question_number,
      question_id: q.id,
      correct_answer: q.correct_answer,
      section: q.section_label,
      question_type: q.question_type,
      points: q.points
    };
  });
  validateGeneratedPlanQuestions(sectionedSlots, securedQuestions);
  validateAnswerKey(securedQuestions, securedAnswerKey);

  for (const sectionResult of sectionResults) {
    sectionResult.questions = securedQuestions.filter((question) => question.section_id === sectionResult.id);
    sectionResult.totalPoints = sectionResult.questions.reduce((sum, question) => sum + question.points, 0);
  }
  const totalPoints = sectionResults.reduce((sum, section) => sum + section.totalPoints, 0);

  // The generated questionnaire must be permanently bound to the exact saved TOS
  // that produced it. Verified before persistence — never inferred afterwards.
  const linkedTosId = await assertTosLink(config.testMetadata?.tos_id);

  // Save to database - cast items and answer_key to Json type
  const testData = {
    title: config.testTitle,
    format_id: selectedFormat.id,
    subject: config.testMetadata?.subject || null,
    course: config.testMetadata?.course || null,
    year_section: config.testMetadata?.year_section || null,
    exam_period: config.testMetadata?.exam_period || null,
    school_year: config.testMetadata?.school_year || null,
    semester: config.testMetadata?.semester || null,
    items: securedQuestions as unknown as any,
    answer_key: securedAnswerKey as unknown as any,
    tos_id: linkedTosId,
    points_per_question: 1,
    created_by: user.id,
  };

  const { data: savedTest, error: saveError } = await supabase
    .from('generated_tests')
    .insert(testData)
    .select()
    .single();

  if (saveError) {
    console.error("❌ Failed to save test:", saveError);
    throw new Error(`Failed to save test: ${saveError.message}`);
  }

  console.log(`✅ Test saved with ID: ${savedTest.id}`);

  return {
    id: savedTest.id,
    title: config.testTitle,
    format_id: selectedFormat.id,
    sections: sectionResults,
    answer_key: securedAnswerKey,
    totalItems: securedQuestions.length,
    totalPoints
  };
}

/**
 * Distribute TOS criteria across sections based on question type requirements
 */
function distributeCriteriaToSections(
  criteria: TOSCriteria[],
  sections: ExamSection[]
): Map<string, TOSCriteria[]> {
  const assignments = new Map<string, TOSCriteria[]>();
  
  // Initialize empty arrays for each section
  sections.forEach(s => assignments.set(s.id, []));
  
  // Create a pool of criteria with remaining counts
  const criteriaPool = criteria.map(c => ({ ...c, remaining: c.count }));
  
  // Priority mapping: which Bloom levels work best for each question type
  const bloomPriority: Record<QuestionType, string[]> = {
    mcq: ['remembering', 'understanding', 'applying', 'analyzing', 'evaluating', 'creating'],
    true_false: ['remembering', 'understanding'],
    fill_blank: ['remembering', 'understanding', 'applying'],
    essay: ['evaluating', 'creating', 'analyzing', 'applying']
  };

  // Assign criteria to sections based on Bloom level suitability
  for (const section of sections) {
    const sectionCount = section.questionType === 'essay' && section.essayCount
      ? section.essayCount
      : section.endNumber - section.startNumber + 1;
    const sectionCriteria: TOSCriteria[] = [];
    let assigned = 0;
    
    const priorityBlooms = bloomPriority[section.questionType];
    
    // First pass: assign from priority Bloom levels
    for (const bloom of priorityBlooms) {
      if (assigned >= sectionCount) break;
      
      for (const criterion of criteriaPool) {
        if (assigned >= sectionCount) break;
        if (criterion.remaining <= 0) continue;
        if (criterion.bloom_level.toLowerCase() !== bloom) continue;
        
        const toAssign = Math.min(criterion.remaining, sectionCount - assigned);
        if (toAssign > 0) {
          sectionCriteria.push({
            ...criterion,
            count: toAssign
          });
          criterion.remaining -= toAssign;
          assigned += toAssign;
        }
      }
    }
    
    // Second pass: fill remaining from any Bloom level
    if (assigned < sectionCount) {
      for (const criterion of criteriaPool) {
        if (assigned >= sectionCount) break;
        if (criterion.remaining <= 0) continue;
        
        const toAssign = Math.min(criterion.remaining, sectionCount - assigned);
        if (toAssign > 0) {
          sectionCriteria.push({
            ...criterion,
            count: toAssign
          });
          criterion.remaining -= toAssign;
          assigned += toAssign;
        }
      }
    }
    
    assignments.set(section.id, sectionCriteria);
  }
  
  // CRITICAL: Check for unassigned criteria items and distribute them to sections with capacity
  const unassignedTotal = criteriaPool.reduce((sum, c) => sum + c.remaining, 0);
  if (unassignedTotal > 0) {
    console.warn(`⚠️ ${unassignedTotal} criteria items unassigned after initial distribution — redistributing`);
    
    // Find the largest section (usually MCQ) and add unassigned items there
    const largestSection = sections.reduce((largest, s) => {
      const sCount = s.endNumber - s.startNumber + 1;
      const lCount = largest.endNumber - largest.startNumber + 1;
      return sCount > lCount ? s : largest;
    }, sections[0]);
    
    for (const criterion of criteriaPool) {
      if (criterion.remaining <= 0) continue;
      const existing = assignments.get(largestSection.id) || [];
      existing.push({
        ...criterion,
        count: criterion.remaining
      });
      assignments.set(largestSection.id, existing);
      criterion.remaining = 0;
    }
  }
  
  return assignments;
}

/**
 * Generate questions for a specific section with the required question type
 */
/**
 * Lightweight text similarity using normalized token overlap (Jaccard-like)
 */
function computeTextSimilarity(text1: string, text2: string): number {
  const tokenize = (t: string) => new Set(
    t.toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/).filter(w => w.length > 2)
  );
  const set1 = tokenize(text1);
  const set2 = tokenize(text2);
  if (set1.size === 0 || set2.size === 0) return 0;
  let intersection = 0;
  for (const token of set1) {
    if (set2.has(token)) intersection++;
  }
  return intersection / Math.max(set1.size, set2.size);
}

/**
 * Check if a question text is too similar to any existing question
 */
function isDuplicateByText(
  questionText: string,
  existingTexts: string[],
  threshold: number = 0.7
): boolean {
  for (const existing of existingTexts) {
    if (computeTextSimilarity(questionText, existing) >= threshold) {
      return true;
    }
  }
  return false;
}

/**
 * Generate questions for a specific section with the required question type
 * Now enforces cross-section deduplication via uniquenessStore and text similarity
 */
async function generateSectionQuestions(
  section: ExamSection,
  criteria: TOSCriteria[],
  targetCount: number,
  startNumber: number,
  userId: string,
  uniquenessStore: QuestionUniquenessStore,
  allQuestionTexts: string[]
): Promise<any[]> {
  const questions: any[] = [];
  
  // Query existing questions from bank matching criteria and type
  for (const criterion of criteria) {
    const dbQuestionType = mapQuestionTypeToDb(section.questionType);
    
    const { data: bankQuestions } = await supabase
      .from('questions')
      .select('*')
      .eq('deleted', false)
      .eq('approved', true)
      .eq('question_type', dbQuestionType)
      .ilike('topic', `%${criterion.topic}%`)
      .order('used_count', { ascending: true })
      .limit(criterion.count * 3); // Fetch extra for dedup filtering
    
    if (bankQuestions && bankQuestions.length > 0) {
      for (const bq of bankQuestions) {
        if (questions.length >= targetCount) break;
        // Skip if text is too similar to already-selected questions
        if (isDuplicateByText(bq.question_text, allQuestionTexts)) {
          console.log(`   🔄 Skipping duplicate bank question: "${bq.question_text.substring(0, 60)}..."`);
          continue;
        }
        questions.push(bq);
        allQuestionTexts.push(bq.question_text);
      }
    }
  }
  
  // If we don't have enough, generate the rest with dedup enforcement
  const remaining = targetCount - questions.length;
  if (remaining > 0) {
    console.log(`   🤖 Generating ${remaining} ${section.questionType} questions via AI...`);
    
    const generatedQuestions = await generateTypedQuestions(
      section.questionType,
      criteria,
      remaining,
      userId,
      uniquenessStore,
      allQuestionTexts
    );
    
    // Save AI-generated questions to the Question Bank for future reuse
    const savedQuestions = await saveGeneratedQuestionsToBank(generatedQuestions, userId, criteria);
    questions.push(...savedQuestions);
  }
  
  // Ensure we have exactly the target count
  return questions.slice(0, targetCount);
}

/**
 * Save AI-generated questions to the Question Bank with full metadata and dedup.
 * Returns the saved questions (with real DB IDs).
 */
async function saveGeneratedQuestionsToBank(
  questions: any[],
  userId: string,
  criteria: TOSCriteria[],
  testMetadata?: FormatAwareTestConfig["testMetadata"]
): Promise<any[]> {
  const saved: any[] = [];

  for (const q of questions) {
    const subjectMeta = testMetadata?.tos_id
      ? await resolveGeneratedQuestionSubject({
        academic_subject_id: q.metadata?.academic_subject_id,
        subject: q.subject,
        topic: q.topic || criteria[0]?.topic,
        subject_code: q.subject_code,
        subject_description: q.subject_description,
        category: q.category,
        specialization: q.specialization,
      }, testMetadata.tos_id)
      : await resolveSubjectMetadata({
        academic_subject_id: testMetadata?.academic_subject_id,
        subject: testMetadata?.subject_code || testMetadata?.subject_no || q.subject,
        topic: q.topic || criteria[0]?.topic,
        subject_code: testMetadata?.subject_code || testMetadata?.subject_no || q.subject_code,
        subject_description: testMetadata?.subject_description || testMetadata?.description || q.subject_description,
        category: testMetadata?.category || q.category,
        specialization: testMetadata?.specialization || q.specialization,
      });

    try {
      const qText = q.question_text || '';

      // DB-level duplicate check: skip if near-identical text already exists
      const { data: existing } = await supabase
        .from('questions')
        .select('id, question_text')
        .eq('deleted', false)
        .eq('topic', q.topic || criteria[0]?.topic || '')
        .eq('bloom_level', q.bloom_level || criteria[0]?.bloom_level || '')
        .eq('question_type', q.question_type || 'mcq')
        .limit(50);

      if (existing && existing.some(e => computeTextSimilarity(e.question_text, qText) >= 0.7)) {
        console.log(`   🔄 DB dedup: skipping existing question: "${qText.substring(0, 60)}..."`);
        saved.push(q); // Still use it for this test, just don't re-save
        continue;
      }

      const { data: dbQuestion, error } = await supabase
        .from('questions')
        .insert({
          question_text: qText,
          question_type: q.question_type || 'mcq',
          choices: q.choices || null,
          correct_answer: q.correct_answer || null,
          topic: q.topic || criteria[0]?.topic || '',
          bloom_level: q.bloom_level || criteria[0]?.bloom_level || 'Understanding',
          difficulty: q.difficulty || criteria[0]?.difficulty || 'Average',
          knowledge_dimension: normalizeKnowledgeDimension(q.knowledge_dimension),
          subject: `${subjectMeta.subject_code} - ${subjectMeta.subject_description}`,
          category: subjectMeta.category,
          specialization: subjectMeta.specialization,
          subject_code: subjectMeta.subject_code,
          subject_description: subjectMeta.subject_description,
          tos_id: testMetadata?.tos_id || null,
          created_by: 'ai',
          approved: true,
          status: 'approved',
          owner: userId,
          ai_confidence_score: q.ai_confidence_score || 0.75,
          needs_review: false,
          metadata: {
            ...(q.metadata || {}),
            subject_no: subjectMeta.subject_code,
            academic_subject_id: subjectMeta.academic_subject_id,
            subject_description: subjectMeta.subject_description,
            category: subjectMeta.category,
            specialization: subjectMeta.specialization,
            tos_id: testMetadata?.tos_id || null,
            auto_generated: true,
            saved_to_bank: true
          }
        })
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to save AI question to the question bank: ${error.message}`);
      }

      // Log generation
      await supabase.from('ai_generation_logs').insert({
        question_id: dbQuestion.id,
        generation_type: 'format_aware_generation',
        prompt_used: `Generate ${q.bloom_level} ${q.question_type} on ${q.topic}`,
        model_used: q.metadata?.generated_for_section ? 'ai_edge_function' : 'template_fallback',
        generated_by: userId,
        metadata: { question_type: q.question_type, auto_generated: true }
      });

      console.log(`   ✅ Saved AI question to bank: ${dbQuestion.id}`);
      saved.push(dbQuestion);
    } catch (err) {
      console.error('   ❌ Error saving question to bank:', err);
      throw err;
    }
  }

  console.log(`   📦 Saved ${saved.filter(s => s.id && !s.id.startsWith('gen-')).length}/${questions.length} AI questions to Question Bank`);
  return saved;
}

/**
 * Map our question types to database format
 */
function mapQuestionTypeToDb(type: QuestionType): string {
  const mapping: Record<QuestionType, string> = {
    mcq: 'mcq',
    true_false: 'true_false',
    fill_blank: 'short_answer',
    essay: 'essay'
  };
  return mapping[type];
}

/**
 * Generate questions of a specific type using AI edge function, with template fallback
 * Enforces deduplication: rejects near-duplicate AI outputs and retries
 */
async function generateTypedQuestions(
  questionType: QuestionType,
  criteria: TOSCriteria[],
  count: number,
  userId: string,
  uniquenessStore: QuestionUniquenessStore,
  allQuestionTexts: string[]
): Promise<any[]> {
  const MAX_RETRIES = 2;
  let attempt = 0;
  const accepted: any[] = [];

  while (accepted.length < count && attempt <= MAX_RETRIES) {
    attempt++;
    const needed = count - accepted.length;

    try {
      const aiQuestions = await generateTypedQuestionsViaAI(questionType, criteria, needed, userId);

      for (const q of aiQuestions) {
        if (accepted.length >= count) break;
        const qText = q.question_text || (q as any).text || '';

        // Check text similarity against all existing questions
        if (isDuplicateByText(qText, allQuestionTexts)) {
          console.log(`   🔄 Rejected duplicate AI question (attempt ${attempt}): "${qText.substring(0, 60)}..."`);
          continue;
        }

        // Check structural uniqueness via fingerprint store
        const bloomForAnswer = mapBloomToAnswerType(q.bloom_level || criteria[0]?.bloom_level || 'Understanding');
        const fp = createQuestionFingerprint(
          qText,
          q.topic || criteria[0]?.topic || '',
          bloomForAnswer as AnswerType,
          q.bloom_level || criteria[0]?.bloom_level || 'Understanding',
          (q.knowledge_dimension || criteria[0]?.knowledge_dimension || 'conceptual') as KnowledgeDimension
        );
        const uniqueCheck = uniquenessStore.checkWithSuggestions(fp);
        if (!uniqueCheck.unique) {
          console.log(`   🔄 Rejected structurally redundant AI question: ${uniqueCheck.reason}`);
          continue;
        }

        // Passed all checks — accept
        uniquenessStore.register(fp);
        allQuestionTexts.push(qText);
        accepted.push(q);
      }

      if (accepted.length >= count) break;
      console.log(`   ⚠️ After AI attempt ${attempt}: ${accepted.length}/${count} unique questions accepted`);
    } catch (error) {
      console.error(`   ❌ AI generation attempt ${attempt} failed:`, error);
      break; // Don't retry on hard errors
    }
  }

  // Only use template fallback if AI couldn't produce enough, with dedup
  if (accepted.length < count) {
    const remaining = count - accepted.length;
    console.warn(`   ⚠️ AI produced ${accepted.length}/${count} unique questions after ${attempt} attempts. Filling ${remaining} with templates (deduplicated).`);
    const templateQuestions = generateTypedQuestionsFromTemplates(questionType, criteria, remaining * 3, userId);

    for (const tq of templateQuestions) {
      if (accepted.length >= count) break;
      const tText = tq.question_text || '';
      if (isDuplicateByText(tText, allQuestionTexts)) continue;
      allQuestionTexts.push(tText);
      accepted.push(tq);
    }
  }

  return accepted.slice(0, count);
}

/**
 * Map bloom level to a default answer type for fingerprinting
 */
function mapBloomToAnswerType(bloomLevel: string): string {
  const map: Record<string, string> = {
    'Remembering': 'definition',
    'Understanding': 'explanation',
    'Applying': 'application',
    'Analyzing': 'analysis',
    'Evaluating': 'evaluation',
    'Creating': 'design'
  };
  return map[bloomLevel] || 'explanation';
}

/**
 * Generate questions via the AI edge function with proper question_type
 */
async function generateTypedQuestionsViaAI(
  questionType: QuestionType,
  criteria: TOSCriteria[],
  count: number,
  userId: string,
  regeneration?: {
    slot: GenerationSlot;
    rejected: Array<{ question: string; reason: string }>;
  }
): Promise<QuestionCandidate[]> {
  const questions: QuestionCandidate[] = [];
  
  // Distribute count across criteria
  const perCriteria = Math.ceil(count / Math.max(criteria.length, 1));
  let generated = 0;
  
  for (const criterion of criteria) {
    if (generated >= count) break;
    const toGenerate = Math.min(perCriteria, count - generated);
    
    // Map question type for the edge function
    const edgeQuestionType = questionType === 'fill_blank' ? 'fill_blank' : questionType;
    
    const { data, error } = await supabase.functions.invoke('generate-constrained-questions', {
      body: {
        topic: criterion.topic,
        bloom_level: criterion.bloom_level || 'Understanding',
        knowledge_dimension: normalizeKnowledgeDimension(criterion.knowledge_dimension),
        difficulty: criterion.difficulty || 'Average',
        count: toGenerate,
        question_type: edgeQuestionType,
        regeneration_context: regeneration
          ? buildSlotRegenerationContext(regeneration.slot, regeneration.rejected)
          : undefined
      }
    });
    
    if (error) {
      console.error(`   ❌ Edge function error for ${questionType}:`, error);
      throw new Error(`Constrained ${questionType} generation failed for question ${regeneration?.slot.item_number ?? 'batch'}: ${error.message}`);
    }
    
    const aiQuestions = data?.questions || [];
    
    for (const q of aiQuestions) {
      if (generated >= count) break;
      
      const mapped = mapAIResponseToQuestion(q, questionType, criterion, userId);
      questions.push(mapped);
      generated++;
    }
  }
  
  return questions;
}

/**
 * Map AI edge function response to our question format
 */
function mapAIResponseToQuestion(
  aiQ: any,
  questionType: QuestionType,
  criterion: TOSCriteria,
  userId: string
): any {
  const base = {
    id: `gen-${questionType}-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
    topic: criterion.topic,
    bloom_level: criterion.bloom_level || aiQ.bloom_level,
    difficulty: criterion.difficulty || aiQ.difficulty,
    knowledge_dimension: normalizeKnowledgeDimension(
      criterion.knowledge_dimension ?? aiQ.knowledge_dimension
    ),
    created_by: 'ai',
    status: 'approved',
    approved: true,
    owner: userId,
    ai_confidence_score: 0.85,
    metadata: {
      generated_for_section: questionType,
      ai_generated: true,
      structure_validated: aiQ.structure_validated,
      rejection_reasons: aiQ.rejection_reasons
    }
  };
  
  switch (questionType) {
    case 'true_false':
      return {
        ...base,
        question_type: 'true_false',
        question_text: aiQ.text,
        choices: { A: 'True', B: 'False' },
        correct_answer: aiQ.correct_answer === 'True' || aiQ.correct_answer === 'true' ? 'True' : 'False'
      };
    case 'fill_blank':
      return {
        ...base,
        question_type: 'short_answer',
        question_text: aiQ.text,
        correct_answer: aiQ.correct_answer || 'N/A'
      };
    case 'essay':
      return {
        ...base,
        question_type: 'essay',
        question_text: aiQ.text,
        correct_answer: aiQ.correct_answer || aiQ.answer || 'See rubric',
        points: 5,
        metadata: {
          ...base.metadata,
          points: 5,
          rubric_criteria: aiQ.rubric_points || []
        }
      };
    default: // mcq
      return {
        ...base,
        question_type: 'mcq',
        question_text: aiQ.text,
        choices: aiQ.choices || {},
        correct_answer: aiQ.correct_answer || 'A'
      };
  }
}

/**
 * Template-based fallback generation (no AI needed)
 */
function generateTypedQuestionsFromTemplates(
  questionType: QuestionType,
  criteria: TOSCriteria[],
  count: number,
  userId: string
): any[] {
  const questions: any[] = [];
  const perCriteria = Math.ceil(count / Math.max(criteria.length, 1));
  let generated = 0;
  
  for (const criterion of criteria) {
    if (generated >= count) break;
    const toGenerate = Math.min(perCriteria, count - generated);
    
    for (let i = 0; i < toGenerate; i++) {
      const question = generateTypedQuestion(questionType, criterion, generated + i, userId);
      questions.push(question);
      generated++;
    }
  }
  
  while (generated < count && criteria.length > 0) {
    const question = generateTypedQuestion(questionType, criteria[0], generated, userId);
    questions.push(question);
    generated++;
  }
  
  return questions;
}

/**
 * Generate a single question of a specific type
 */
function generateTypedQuestion(
  questionType: QuestionType,
  criterion: TOSCriteria,
  index: number,
  userId: string
): any {
  const baseQuestion = {
    id: `gen-${questionType}-${Date.now()}-${index}`,
    topic: criterion.topic,
    bloom_level: criterion.bloom_level,
    difficulty: criterion.difficulty,
    knowledge_dimension: normalizeKnowledgeDimension(criterion.knowledge_dimension),
    created_by: 'ai',
    status: 'approved',
    approved: true,
    owner: userId,
    ai_confidence_score: 0.75,
    metadata: { generated_for_section: questionType }
  };
  
  switch (questionType) {
    case 'mcq':
      return generateMCQ(baseQuestion, criterion, index);
    case 'true_false':
      return generateTrueFalse(baseQuestion, criterion, index);
    case 'fill_blank':
      return generateFillBlank(baseQuestion, criterion, index);
    case 'essay':
      return generateEssay(baseQuestion, criterion, index);
    default:
      return generateMCQ(baseQuestion, criterion, index);
  }
}

function generateMCQ(base: any, criterion: TOSCriteria, index: number): any {
  const templates = getMCQTemplates(criterion);
  const template = templates[index % templates.length];
  
  return {
    ...base,
    question_type: 'mcq',
    question_text: template.question,
    choices: template.choices,
    correct_answer: template.answer
  };
}

function generateTrueFalse(base: any, criterion: TOSCriteria, index: number): any {
  const templates = getTrueFalseTemplates(criterion);
  const template = templates[index % templates.length];
  
  return {
    ...base,
    question_type: 'true_false',
    question_text: template.statement,
    choices: { A: 'True', B: 'False' },
    correct_answer: template.isTrue ? 'True' : 'False'
  };
}

function generateFillBlank(base: any, criterion: TOSCriteria, index: number): any {
  const templates = getFillBlankTemplates(criterion);
  const template = templates[index % templates.length];
  
  return {
    ...base,
    question_type: 'short_answer',
    question_text: template.question,
    correct_answer: template.answer
  };
}

function generateEssay(base: any, criterion: TOSCriteria, index: number): any {
  const templates = getEssayTemplates(criterion);
  const template = templates[index % templates.length];
  
  return {
    ...base,
    question_type: 'essay',
    question_text: template.prompt,
    correct_answer: template.rubric,
    metadata: { 
      ...base.metadata,
      points: 5,
      rubric_criteria: template.criteria
    }
  };
}

// Template generators for each question type
function getMCQTemplates(criterion: TOSCriteria) {
  return [
    {
      question: `What is the primary purpose of ${criterion.topic}?`,
      choices: {
        A: 'To establish foundational principles and systematic approaches',
        B: 'To provide optional guidelines without enforcement',
        C: 'To serve as historical reference only',
        D: 'To replace existing methodologies entirely'
      },
      answer: 'A'
    },
    {
      question: `Which statement best describes the key characteristic of ${criterion.topic}?`,
      choices: {
        A: 'It applies only in theoretical contexts',
        B: 'It provides a structured framework for consistent implementation',
        C: 'It is primarily used for documentation purposes',
        D: 'It requires no specialized knowledge to apply'
      },
      answer: 'B'
    },
    {
      question: `In the context of ${criterion.topic}, what approach is most effective?`,
      choices: {
        A: 'Applying principles systematically while adapting to context',
        B: 'Following rigid procedures regardless of circumstances',
        C: 'Ignoring established guidelines when convenient',
        D: 'Delegating all decisions to external parties'
      },
      answer: 'A'
    },
    {
      question: `What distinguishes effective implementation of ${criterion.topic}?`,
      choices: {
        A: 'Speed of implementation over quality',
        B: 'Alignment between objectives and actual practices',
        C: 'Minimum documentation requirements',
        D: 'Complete automation of all processes'
      },
      answer: 'B'
    },
    {
      question: `How does ${criterion.topic} contribute to overall effectiveness?`,
      choices: {
        A: 'By providing clear guidelines and measurable outcomes',
        B: 'By eliminating the need for human judgment',
        C: 'By reducing all processes to simple rules',
        D: 'By avoiding any form of evaluation'
      },
      answer: 'A'
    }
  ];
}

function getTrueFalseTemplates(criterion: TOSCriteria) {
  return [
    {
      statement: `${criterion.topic} requires systematic implementation to achieve consistent results.`,
      isTrue: true
    },
    {
      statement: `Understanding the principles of ${criterion.topic} is essential for effective application.`,
      isTrue: true
    },
    {
      statement: `${criterion.topic} can be applied effectively without any prior knowledge or preparation.`,
      isTrue: false
    },
    {
      statement: `The primary purpose of ${criterion.topic} is to provide optional guidelines.`,
      isTrue: false
    },
    {
      statement: `Effective implementation of ${criterion.topic} requires adaptation to specific contexts.`,
      isTrue: true
    },
    {
      statement: `${criterion.topic} produces identical results regardless of implementation approach.`,
      isTrue: false
    }
  ];
}

function getFillBlankTemplates(criterion: TOSCriteria) {
  return [
    {
      question: `The systematic approach to ${criterion.topic} is called __________.`,
      answer: 'structured methodology'
    },
    {
      question: `${criterion.topic} is characterized by its focus on __________ and consistency.`,
      answer: 'quality'
    },
    {
      question: `When implementing ${criterion.topic}, the first step is to establish clear __________.`,
      answer: 'objectives'
    },
    {
      question: `The effectiveness of ${criterion.topic} is measured through __________ criteria.`,
      answer: 'defined'
    },
    {
      question: `${criterion.topic} requires __________ feedback to ensure continuous improvement.`,
      answer: 'regular'
    }
  ];
}

function getEssayTemplates(criterion: TOSCriteria) {
  return [
    {
      prompt: `Analyze the key principles of ${criterion.topic} and explain how they contribute to effective implementation. Provide specific examples to support your analysis.`,
      rubric: 'Answers should demonstrate understanding of core principles, provide relevant examples, and show logical analysis.',
      criteria: ['Understanding of principles', 'Quality of examples', 'Logical analysis', 'Clear communication']
    },
    {
      prompt: `Evaluate the effectiveness of different approaches to ${criterion.topic}. Discuss the strengths and limitations of each approach and justify which you consider most effective.`,
      rubric: 'Answers should compare multiple approaches, identify strengths/limitations, and provide justified conclusions.',
      criteria: ['Comparison of approaches', 'Critical evaluation', 'Justification of conclusions', 'Depth of analysis']
    },
    {
      prompt: `Design a comprehensive plan for implementing ${criterion.topic} in a real-world scenario. Include objectives, methodology, and success criteria.`,
      rubric: 'Answers should present a complete plan with clear objectives, practical methodology, and measurable success criteria.',
      criteria: ['Clear objectives', 'Practical methodology', 'Success criteria', 'Feasibility']
    }
  ];
}
