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
  scaledFormatSections 
} from "@/types/examFormats";
import { generateQuestionsWithAI } from "./testGenerationService";
import type { TOSCriteria } from "./testGenerationService";
import { QuestionUniquenessStore, createQuestionFingerprint, extractConcept } from "./questionUniquenessChecker";
import type { AnswerType, KnowledgeDimension } from "@/types/knowledge";
import { resolveSubjectMetadata } from "./subjectMetadataResolver";
import { shuffleExamChoices } from "@/utils/shuffleExamChoices";
import { assertTosLink } from "@/services/db/tosLink";

export interface FormatAwareTestConfig {
  format: ExamFormat;
  tosCriteria: TOSCriteria[];
  testTitle: string;
  testMetadata?: any;
}

export interface SectionedQuestion {
  id: string;
  question_number: number;
  section_id: string;
  section_label: string;
  section_title: string;
  question_text: string;
  question_type: QuestionType;
  choices?: Record<string, string> | string[];
  correct_answer: string;
  points: number;
  topic: string;
  bloom_level: string;
  difficulty: string;
}

interface GenerationSlot {
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
}

function normalizeQuestionType(type?: string): QuestionType {
  if (!type) return 'mcq';
  const normalized = type.toLowerCase().replace(/[^a-z0-9]+/g, '_');
  if (['mcq', 'multiple_choice', 'multiple-choice', 'multiple choice'].includes(normalized)) return 'mcq';
  if (['true_false', 'true-false', 'true false', 'truefalse', 'true/false'].includes(normalized)) return 'true_false';
  if (['fill_blank', 'fill-in-the-blank', 'fill blank', 'fill_in_blank'].includes(normalized)) return 'fill_blank';
  return 'essay';
}

function requiresChoices(questionType?: string): boolean {
  return normalizeQuestionType(questionType) === 'mcq';
}

function hasUsableChoices(question: any): boolean {
  const choices = question?.choices ?? question?.options;
  if (!choices) return false;
  if (Array.isArray(choices)) {
    return choices.filter((c: any) => String(c ?? '').trim().length > 0).length >= 2;
  }
  if (typeof choices === 'object') {
    return Object.values(choices).filter((c: any) => String(c ?? '').trim().length > 0).length >= 2;
  }
  return false;
}

export function normalizeQuestionText(text: string): string {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Resolve the correct answer as TEXT so that reordered answer choices do not
 * change a question's identity (a choice letter is meaningless on its own).
 */
function resolveCorrectAnswerText(question: any): string {
  const answer = String(question?.correct_answer ?? '').trim();
  const choices = question?.choices;
  if (choices && typeof choices === 'object' && !Array.isArray(choices)) {
    const keyed = (choices as Record<string, string>)[answer.toUpperCase()];
    if (keyed != null) return normalizeQuestionText(keyed);
  }
  if (Array.isArray(choices)) {
    const index = answer.toUpperCase().charCodeAt(0) - 65;
    if (answer.length === 1 && index >= 0 && index < choices.length) {
      return normalizeQuestionText(String(choices[index]));
    }
  }
  return normalizeQuestionText(answer);
}

export interface AcceptedQuestionRecord {
  text: string;
  normalizedText: string;
  concept: string;
  normalizedAnswer: string;
  topic: string;
}

/**
 * Exam-wide duplicate tracker (BUG 1 FIX).
 * Compares every candidate against ALL previously accepted questions in the
 * entire exam — across topics, batches, and sources — using:
 *  1. normalized stem equality (capitalization, punctuation, whitespace),
 *  2. semantic stem similarity (existing 0.7 threshold),
 *  3. concept + expected-answer equality (reordered choices don't matter),
 *  4. structural fingerprint (topic + concept + answer type).
 */
export class ExamDeduplicationTracker {
  private accepted: AcceptedQuestionRecord[] = [];
  private normalizedTexts = new Set<string>();
  private fingerprintStore = new QuestionUniquenessStore();

  private buildFingerprint(question: any, text: string) {
    const bloomLevel = question?.bloom_level || 'Understanding';
    return createQuestionFingerprint(
      text,
      question?.topic || '',
      mapBloomToAnswerType(bloomLevel) as AnswerType,
      bloomLevel,
      (question?.knowledge_dimension || 'conceptual') as KnowledgeDimension
    );
  }

  check(question: any): { duplicate: boolean; reason?: string } {
    const text = String(question?.question_text || question?.text || '');
    const normalizedText = normalizeQuestionText(text);
    if (!normalizedText) {
      return { duplicate: true, reason: 'empty question stem' };
    }
    if (this.normalizedTexts.has(normalizedText)) {
      return {
        duplicate: true,
        reason: 'identical stem already accepted (ignoring capitalization, punctuation, and whitespace)'
      };
    }
    if (this.accepted.length > 0 && isDuplicateByText(text, this.accepted.map((a) => a.text))) {
      return { duplicate: true, reason: 'semantically similar stem already accepted in this exam' };
    }
    const concept = extractConcept(text);
    const normalizedAnswer = resolveCorrectAnswerText(question);
    if (concept && normalizedAnswer) {
      for (const prior of this.accepted) {
        if (prior.concept === concept && prior.normalizedAnswer === normalizedAnswer) {
          return {
            duplicate: true,
            reason: `same concept and expected answer as an accepted question ("${concept}")`
          };
        }
      }
    }
    const uniqueness = this.fingerprintStore.checkWithSuggestions(this.buildFingerprint(question, text));
    if (!uniqueness.unique) {
      return { duplicate: true, reason: uniqueness.reason };
    }
    return { duplicate: false };
  }

  register(question: any): void {
    const text = String(question?.question_text || question?.text || '');
    const normalizedText = normalizeQuestionText(text);
    if (!normalizedText || this.normalizedTexts.has(normalizedText)) return;
    this.accepted.push({
      text,
      normalizedText,
      concept: extractConcept(text),
      normalizedAnswer: resolveCorrectAnswerText(question),
      topic: String(question?.topic || '').toLowerCase().trim()
    });
    this.normalizedTexts.add(normalizedText);
    this.fingerprintStore.register(this.buildFingerprint(question, text));
  }

  getAcceptedStems(): string[] {
    return this.accepted.map((a) => a.text);
  }

  get acceptedCount(): number {
    return this.accepted.length;
  }
}

export function createExamDeduplicationTracker(): ExamDeduplicationTracker {
  return new ExamDeduplicationTracker();
}

function mapQuestionTypeToDbQuestionTypes(type?: string): string[] {
  const normalized = normalizeQuestionType(type);
  switch (normalized) {
    case 'mcq':
      return ['mcq', 'multiple-choice', 'multiple_choice', 'multiple choice'];
    case 'true_false':
      return ['true_false', 'true-false', 'true false', 'truefalse', 'true/false'];
    case 'fill_blank':
      return ['fill_blank', 'fill-in-the-blank', 'fill blank', 'fill_in_blank'];
    case 'essay':
      return ['essay', 'long_answer', 'constructed_response'];
    default:
      return [normalized];
  }
}

function buildGenerationPlanFromTOSCriteria(tosCriteria: TOSCriteria[]): GenerationSlot[] {
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

    const normalizedSlotType = normalizeQuestionType(slot.question_type);
    const normalizedSectionType = normalizeQuestionType(section.questionType);

    if (slot.question_type && normalizedSlotType !== normalizedSectionType) {
      console.warn(
        `TOS slot ${slot.item_number} requests "${slot.question_type}" but section ${section.label} of the selected exam format is "${section.questionType}". The selected exam format is the source of truth — enforcing "${section.questionType}".`
      );
    }

    return {
      ...slot,
      section_id: section.id,
      section_label: section.label,
      section_title: section.title,
      points_per_question: section.pointsPerQuestion,
      question_type: normalizedSectionType
    };
  });
}

function validateGeneratedPlanQuestions(plan: GenerationSlot[], questions: SectionedQuestion[]): void {
  const errors: string[] = [];
  const expectedTopicCounts = new Map<string, number>();
  const expectedBloomCounts = new Map<string, number>();

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
    if (question.topic !== slot.topic) {
      errors.push(`Slot ${slot.item_number} topic mismatch: expected "${slot.topic}", got "${question.topic}".`);
    }
    if (question.bloom_level !== slot.bloom_level) {
      errors.push(`Slot ${slot.item_number} bloom mismatch: expected "${slot.bloom_level}", got "${question.bloom_level}".`);
    }
    if (question.difficulty !== slot.difficulty) {
      errors.push(`Slot ${slot.item_number} difficulty mismatch: expected "${slot.difficulty}", got "${question.difficulty}".`);
    }
    if (question.question_type !== (slot.question_type || question.question_type)) {
      errors.push(`Slot ${slot.item_number} question type mismatch: expected "${slot.question_type}", got "${question.question_type}".`);
    }

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

  if (errors.length > 0) {
    throw new Error(`Format-aware TOS validation failed: ${errors.join(' ')}`);
  }
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
  console.log("🧠 === STARTING FORMAT-AWARE TEST GENERATION ===");
  console.log("📋 Format:", config.format.name);
  console.log("📊 Sections:", config.format.sections.length);

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error("User not authenticated");
  }

  const generationPlan = buildGenerationPlanFromTOSCriteria(config.tosCriteria);
  const requiredTotal = generationPlan.length;
  console.log(`📊 TOS CONTRACT: ${requiredTotal} total questions required`);

  const scaledSections = scaledFormatSections(config.format, requiredTotal);
  console.log("📐 Scaled sections:", scaledSections.map(s =>
    `${s.label}: ${s.endNumber - s.startNumber + 1} ${s.questionType}`
  ));

  const sectionedSlots = assignSlotsToSections(generationPlan, scaledSections);

  const sectionResults: FormatAwareTestResult['sections'] = scaledSections.map((section) => ({
    id: section.id,
    label: section.label,
    title: section.title,
    instruction: section.instruction,
    questions: [],
    totalPoints: 0
  }));

  const allQuestions: SectionedQuestion[] = new Array(requiredTotal);
  const answerKey: any[] = [];
  const dedupTracker = createExamDeduplicationTracker();
  const unfilledItemNumbers: number[] = [];
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
    let chosen: any = null;

    for (const candidate of candidates) {
      if (requiresChoices(slot.question_type) && !hasUsableChoices(candidate)) {
        continue;
      }
      const dedupCheck = dedupTracker.check(candidate);
      if (dedupCheck.duplicate) {
        console.log(`   🔄 Skipping duplicate bank candidate for slot #${slot.item_number}: ${dedupCheck.reason}`);
        continue;
      }
      chosen = candidate;
      break;
    }

    if (!chosen) {
      console.log(`   ⚠️ No unique bank candidate for slot #${slot.item_number}; generating AI content.`);
      const MAX_SLOT_ATTEMPTS = 3;
      for (let attempt = 1; attempt <= MAX_SLOT_ATTEMPTS && !chosen; attempt += 1) {
        const generated = await generateQuestionsWithAI(
          {
            topic: slot.topic,
            bloom_level: slot.bloom_level,
            difficulty: slot.difficulty,
            count: 1,
            type: slot.question_type || 'mcq'
          } as any,
          1,
          user.id,
          { slotNumber: slot.item_number, existingStems: dedupTracker.getAcceptedStems() }
        );
        for (const generatedQuestion of generated) {
          if (!generatedQuestion) continue;
          if (requiresChoices(slot.question_type) && !hasUsableChoices(generatedQuestion)) {
            console.log(`   🔄 Rejected AI question for slot #${slot.item_number}: multiple choice without answer choices`);
            continue;
          }
          const dedupCheck = dedupTracker.check(generatedQuestion);
          if (dedupCheck.duplicate) {
            console.log(`   🔄 Rejected duplicate AI question for slot #${slot.item_number} (attempt ${attempt}): ${dedupCheck.reason}`);
            continue;
          }
          chosen = generatedQuestion;
          break;
        }
      }
    } else {
      try {
        await supabase.rpc('mark_question_used', { p_question_id: chosen.id, p_test_id: null });
      } catch {
        // ignore marking failures
      }
    }

    if (!chosen) {
      console.warn(`   ⚠️ Slot #${slot.item_number} could not be filled with a unique question.`);
      unfilledItemNumbers.push(slot.item_number);
      continue;
    }

    const section = sectionMap.get(slot.section_id!);
    const question: SectionedQuestion = {
      ...chosen,
      id: chosen.id || `ai-${slot.item_number}-${Date.now()}`,
      question_number: slot.item_number,
      section_id: slot.section_id!,
      section_label: slot.section_label!,
      section_title: slot.section_title!,
      question_type: slot.question_type || (section?.questionType ?? 'mcq'),
      points: slot.points_per_question ?? section?.pointsPerQuestion ?? 1,
      topic: slot.topic,
      bloom_level: slot.bloom_level,
      difficulty: slot.difficulty
    } as SectionedQuestion;

    dedupTracker.register(question);
    allQuestions[slot.item_number - 1] = question;

    answerKey.push({
      question_number: question.question_number,
      question_id: question.id,
      correct_answer: question.correct_answer,
      section: question.section_label,
      question_type: question.question_type,
      points: question.points
    });

    const sectionResult = sectionResults.find((s) => s.id === slot.section_id);
    if (sectionResult) {
      sectionResult.questions.push(question);
      sectionResult.totalPoints += question.points;
    }
  }

  // ============= COMPLETION FALLBACK FOR UNFILLED SLOTS =============
  for (const itemNumber of unfilledItemNumbers) {
    if (allQuestions[itemNumber - 1]) continue;
    const slot = sectionedSlots[itemNumber - 1];
    const section = sectionMap.get(slot.section_id!);
    const criterion = config.tosCriteria.find(
      (c) => c.topic === slot.topic && c.bloom_level === slot.bloom_level
    ) || config.tosCriteria[0] || {
      topic: slot.topic,
      bloom_level: slot.bloom_level,
      difficulty: slot.difficulty,
      count: 1
    };
    const fallback = generateTypedQuestion(section.questionType, criterion, itemNumber, user.id);
    const dedupCheck = dedupTracker.check(fallback);
    if (dedupCheck.duplicate) {
      console.warn(`   ⚠️ Fallback question for slot #${itemNumber} rejected: ${dedupCheck.reason}`);
      continue;
    }
    dedupTracker.register(fallback);
    const mapped = {
      ...fallback,
      question_number: itemNumber,
      section_id: slot.section_id,
      section_label: slot.section_label,
      section_title: slot.section_title,
      question_type: section.questionType,
      points: section.pointsPerQuestion,
      needs_review: true,
      validation_notes: 'Final completion fallback used after generation shortfall'
    } as SectionedQuestion;

    allQuestions[itemNumber - 1] = mapped;
    answerKey.push({
      question_number: mapped.question_number,
      display_number: String(mapped.question_number),
      question_id: mapped.id,
      correct_answer: mapped.correct_answer,
      section: mapped.section_label,
      question_type: mapped.question_type,
      points: mapped.points
    });

    const targetSection = sectionResults.find((s) => s.id === slot.section_id);
    if (targetSection) {
      targetSection.questions.push(mapped);
      targetSection.totalPoints += mapped.points;
    }
  }

  // ============= HARD INCOMPLETE-EXAM GATE =============
  const stillUnfilled: number[] = [];
  for (let i = 1; i <= requiredTotal; i += 1) {
    if (!allQuestions[i - 1]) stillUnfilled.push(i);
  }
  if (stillUnfilled.length > 0) {
    throw new Error(
      `Generation incomplete: ${requiredTotal - stillUnfilled.length} of ${requiredTotal} slots filled; ${stillUnfilled.length} unfilled (items: ${stillUnfilled.join(', ')}). No incomplete exam was saved.`
    );
  }

  validateGeneratedPlanQuestions(sectionedSlots, allQuestions);

  let totalPoints = sectionResults.reduce((sum, s) => sum + s.totalPoints, 0);

  console.log(`✅ TOS CONTRACT SATISFIED: ${allQuestions.length}/${requiredTotal} questions`);

  // Final compile pass: independently shuffle MCQ choices, rebalance answer
  // letters, and recalculate the stored key before persistence/export.
  const securedQuestions = shuffleExamChoices(allQuestions).items as SectionedQuestion[];
  const securedAnswerKey = securedQuestions.map((q) => {
    const existing = answerKey.find((entry) => entry.question_number === q.question_number) || {};
    return {
      ...existing,
      question_number: q.question_number,
      question_id: q.id,
      correct_answer: q.correct_answer,
      section: q.section_label,
      question_type: q.question_type,
      points: q.points
    };
  });

  // The generated questionnaire must be permanently bound to the exact saved TOS
  // that produced it. Verified before persistence — never inferred afterwards.
  const linkedTosId = await assertTosLink(config.testMetadata?.tos_id);

  // Save to database - cast items and answer_key to Json type
  const testData = {
    title: config.testTitle,
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
    format_id: config.format.id,
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
  criteria: TOSCriteria[]
): Promise<any[]> {
  const saved: any[] = [];

  for (const q of questions) {
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

      // Resolve hierarchical metadata
      const subjectMeta = resolveSubjectMetadata({
        subject: q.subject,
        topic: q.topic || criteria[0]?.topic,
        subject_code: q.subject_code,
        subject_description: q.subject_description,
        category: q.category,
        specialization: q.specialization,
      });

      // Align to existing subject records to prevent duplicates
      if (subjectMeta.subject_description) {
        const { data: existingSubject } = await supabase
          .from('questions')
          .select('subject_code, category, specialization')
          .eq('subject_description', subjectMeta.subject_description)
          .eq('deleted', false)
          .limit(1)
          .maybeSingle();

        if (existingSubject) {
          if (existingSubject.subject_code) subjectMeta.subject_code = existingSubject.subject_code;
          if (existingSubject.category) subjectMeta.category = existingSubject.category;
          if (existingSubject.specialization) subjectMeta.specialization = existingSubject.specialization;
        }
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
          knowledge_dimension: q.knowledge_dimension || 'conceptual',
          category: subjectMeta.category,
          specialization: subjectMeta.specialization,
          subject_code: subjectMeta.subject_code,
          subject_description: subjectMeta.subject_description,
          created_by: 'ai',
          approved: true,
          status: 'approved',
          owner: userId,
          ai_confidence_score: q.ai_confidence_score || 0.75,
          needs_review: false,
          metadata: { ...(q.metadata || {}), auto_generated: true, saved_to_bank: true }
        })
        .select()
        .single();

      if (error) {
        console.error('   ❌ Failed to save AI question to bank:', error.message);
        saved.push(q); // Still use the unsaved question for this test
        continue;
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
      saved.push(q);
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
        const qText = q.question_text || q.text || '';

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
  userId: string
): Promise<any[]> {
  const questions: any[] = [];
  
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
        knowledge_dimension: criterion.knowledge_dimension || 'conceptual',
        difficulty: criterion.difficulty || 'Average',
        count: toGenerate,
        question_type: edgeQuestionType
      }
    });
    
    if (error) {
      console.error(`   ❌ Edge function error for ${questionType}:`, error);
      continue;
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
    knowledge_dimension: criterion.knowledge_dimension || aiQ.knowledge_dimension || 'conceptual',
    created_by: 'ai',
    status: 'approved',
    approved: true,
    owner: userId,
    ai_confidence_score: 0.85,
    metadata: { generated_for_section: questionType, ai_generated: true }
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
    knowledge_dimension: criterion.knowledge_dimension || 'conceptual',
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
