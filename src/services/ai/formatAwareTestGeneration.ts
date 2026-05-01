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
import type { TOSCriteria } from "./testGenerationService";
import { QuestionUniquenessStore, createQuestionFingerprint, extractConcept } from "./questionUniquenessChecker";
import type { AnswerType, KnowledgeDimension } from "@/types/knowledge";
import { resolveSubjectMetadata } from "./subjectMetadataResolver";

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

  // Calculate total items needed from TOS (this is the CONTRACT)
  const requiredTotal = config.tosCriteria.reduce((sum, c) => sum + c.count, 0);
  console.log(`📊 TOS CONTRACT: ${requiredTotal} total questions required`);
  
  // Scale format sections to match total items
  const scaledSections = scaledFormatSections(config.format, requiredTotal);
  
  console.log("📐 Scaled sections:", scaledSections.map(s => 
    `${s.label}: ${s.endNumber - s.startNumber + 1} ${s.questionType}`
  ));

  // Distribute TOS criteria across sections based on format requirements
  const sectionAssignments = distributeCriteriaToSections(
    config.tosCriteria,
    scaledSections
  );

  // Validate distribution: total assigned must equal TOS total
  let totalAssigned = 0;
  for (const [sectionId, criteria] of sectionAssignments.entries()) {
    const sectionAssignedCount = criteria.reduce((sum, c) => sum + c.count, 0);
    totalAssigned += sectionAssignedCount;
    console.log(`   Section ${sectionId}: ${sectionAssignedCount} items assigned`);
  }
  console.log(`📊 Distribution check: ${totalAssigned}/${requiredTotal} items assigned to sections`);

  // Generate questions for each section
  const sectionResults: FormatAwareTestResult['sections'] = [];
  const allQuestions: SectionedQuestion[] = [];
  const answerKey: any[] = [];
  let globalQuestionNumber = 1;

  // Session-level deduplication store — shared across ALL sections
  const uniquenessStore = new QuestionUniquenessStore();
  const allQuestionTexts: string[] = []; // For text similarity checks

  for (const section of scaledSections) {
    const sectionCriteria = sectionAssignments.get(section.id) || [];
    const sectionItemCount = section.endNumber - section.startNumber + 1;
    
    // For essay sections, use essayCount if specified (items are grouped per essay)
    const actualQuestionCount = section.questionType === 'essay' && section.essayCount
      ? section.essayCount
      : sectionItemCount;
    
    console.log(`\n📦 Generating Section ${section.label}: ${section.title}`);
    console.log(`   Need: ${actualQuestionCount} ${section.questionType} question(s) (covering items ${section.startNumber}-${section.endNumber})`);

    // Generate with retry to ensure exact count
    let sectionQuestions = await generateSectionQuestions(
      section,
      sectionCriteria,
      actualQuestionCount,
      globalQuestionNumber,
      user.id,
      uniquenessStore,
      allQuestionTexts
    );

    // COMPLETION GATE: Retry if section is short
    let retryAttempt = 0;
    const MAX_SECTION_RETRIES = 2;
    while (sectionQuestions.length < actualQuestionCount && retryAttempt < MAX_SECTION_RETRIES) {
      retryAttempt++;
      const shortfall = actualQuestionCount - sectionQuestions.length;
      console.log(`   🔄 Section ${section.label} retry ${retryAttempt}: need ${shortfall} more ${section.questionType} questions`);
      
      const repairQuestions = await generateSectionQuestions(
        section,
        sectionCriteria.length > 0 ? sectionCriteria : config.tosCriteria.slice(0, 1),
        shortfall,
        globalQuestionNumber + sectionQuestions.length,
        user.id,
        uniquenessStore,
        allQuestionTexts
      );
      sectionQuestions = [...sectionQuestions, ...repairQuestions];
    }

    // Trim to exact count
    sectionQuestions = sectionQuestions.slice(0, actualQuestionCount);

    // Calculate points correctly for essays (essayCount * pointsPerQuestion) vs regular (count * 1)
    const sectionPoints = section.questionType === 'essay' && section.essayCount
      ? section.essayCount * section.pointsPerQuestion
      : sectionQuestions.length * section.pointsPerQuestion;

    // Map questions with section info
    const mappedQuestions: SectionedQuestion[] = sectionQuestions.map((q, idx) => ({
      ...q,
      question_number: globalQuestionNumber + idx,
      section_id: section.id,
      section_label: section.label,
      section_title: section.title,
      question_type: section.questionType,
      points: section.pointsPerQuestion
    }));

    // Update answer key
    mappedQuestions.forEach((q, idx) => {
      // For essays, calculate the item range this essay covers
      let displayNumber: string;
      if (section.questionType === 'essay' && section.essayCount) {
        const itemsPerEssay = Math.floor(sectionItemCount / section.essayCount);
        const essayStart = section.startNumber + (idx * itemsPerEssay);
        const essayEnd = idx === section.essayCount - 1
          ? section.endNumber
          : essayStart + itemsPerEssay - 1;
        displayNumber = `${essayStart}-${essayEnd}`;
      } else {
        displayNumber = String(q.question_number);
      }
      
      answerKey.push({
        question_number: q.question_number,
        display_number: displayNumber,
        question_id: q.id,
        correct_answer: q.correct_answer,
        section: section.label,
        question_type: section.questionType,
        points: section.pointsPerQuestion
      });
    });
    
    sectionResults.push({
      id: section.id,
      label: section.label,
      title: section.title,
      instruction: section.instruction,
      questions: mappedQuestions,
      totalPoints: sectionPoints
    });

    allQuestions.push(...mappedQuestions);
    globalQuestionNumber += mappedQuestions.length;
    
    console.log(`   ✓ Generated ${mappedQuestions.length}/${actualQuestionCount} question(s) (${sectionPoints} pts)`);
  }

  const totalPoints = sectionResults.reduce((sum, s) => sum + s.totalPoints, 0);

  // ============= FINAL VALIDATION GATE =============
  console.log(`\n📊 FINAL VALIDATION: ${allQuestions.length}/${requiredTotal} questions generated`);
  
  if (allQuestions.length < requiredTotal) {
    const shortfall = requiredTotal - allQuestions.length;
    console.error(`❌ TOS CONTRACT VIOLATION: ${allQuestions.length}/${requiredTotal} questions (missing ${shortfall})`);
    throw new Error(
      `Test generation incomplete: generated ${allQuestions.length}/${requiredTotal} questions. ` +
      `${shortfall} questions could not be generated. Please try again.`
    );
  }

  console.log(`✅ TOS CONTRACT SATISFIED: ${allQuestions.length}/${requiredTotal} questions`);

  // Save to database - cast items and answer_key to Json type
  const testData = {
    title: config.testTitle,
    subject: config.testMetadata?.subject || null,
    course: config.testMetadata?.course || null,
    year_section: config.testMetadata?.year_section || null,
    exam_period: config.testMetadata?.exam_period || null,
    school_year: config.testMetadata?.school_year || null,
    items: allQuestions as unknown as any,
    answer_key: answerKey as unknown as any,
    tos_id: config.testMetadata?.tos_id || null,
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
    answer_key: answerKey,
    totalItems: allQuestions.length,
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
