import { supabase } from "@/integrations/supabase/client";
import { TOS } from "../db/tos";
import type { BloomLevel, Difficulty } from "./classify";
import { generateQuestionsWithAI } from "./questionGenerator";

export interface TOSCriteria {
  topic: string;
  bloomLevel: BloomLevel;
  difficulty: Difficulty;
  count: number;
}

export interface TestData {
  title: string;
  subject?: string;
  course?: string;
  year_section?: string;
  exam_period?: string;
  school_year?: string;
  tos_id?: string;
}

/**
 * COMPLETE TEST GENERATION SERVICE WITH AI FALLBACK
 * 
 * This service implements the full algorithm:
 * 1. Validates/creates TOS entry with bloom_distribution
 * 2. Builds Bloom criteria from TOS matrix
 * 3. Queries existing approved questions from bank
 * 4. If insufficient, generates questions using AI
 * 5. Saves AI-generated questions to database
 * 6. Assembles final test
 * 7. Returns test ID for navigation
 */
export async function generateCompleteTestFromTOS(
  tosMatrix: any,
  testData: TestData
): Promise<{ testId: string }> {
  console.log("🧠 Starting Complete Test Generation from TOS");
  console.log("TOS Matrix:", tosMatrix);
  console.log("Test Data:", testData);

  // Validate user authentication
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    throw new Error("User not authenticated");
  }

  // STEP 1: Validate/Create TOS Entry with bloom_distribution
  let tosId = testData.tos_id;
  if (!tosId || tosId.startsWith('temp-')) {
    console.log("📝 Creating new TOS entry in database...");
    try {
      const tosEntry = await TOS.create({
        title: testData.title || `${testData.course} - ${testData.exam_period}`,
        subject_no: tosMatrix.subject_no || testData.subject || '',
        course: tosMatrix.course || testData.course || '',
        description: tosMatrix.description || testData.title || '',
        year_section: tosMatrix.year_section || testData.year_section || '',
        exam_period: tosMatrix.exam_period || testData.exam_period || '',
        school_year: tosMatrix.school_year || testData.school_year || '',
        total_items: tosMatrix.total_items || 50,
        prepared_by: tosMatrix.preparedBy || '',
        noted_by: tosMatrix.notedBy || '',
        distribution: tosMatrix.distribution || {},
        matrix: tosMatrix
      });
      tosId = tosEntry.id;
      console.log("✅ TOS entry created:", tosId);
    } catch (error: any) {
      console.error("❌ Failed to create TOS entry:", error);
      throw new Error(`Failed to save TOS: ${error.message}`);
    }
  }

  if (!tosId) {
    throw new Error("Failed to create or retrieve TOS ID");
  }

  // STEP 2: Build Bloom criteria from TOS matrix
  const criteria = buildCriteriaFromTOS(tosMatrix);
  console.log("📊 Built criteria:", criteria);

  // STEP 3-7: Query bank, generate missing questions, assemble test
  const allQuestions: any[] = [];
  let aiGeneratedCount = 0;
  let existingCount = 0;

  for (const criterion of criteria) {
    console.log(`\n🔍 Processing: ${criterion.topic} | ${criterion.bloomLevel} | ${criterion.difficulty}`);
    
    // Query existing approved questions
    const existingQuestions = await queryQuestionBank(
      criterion.topic,
      criterion.bloomLevel,
      criterion.difficulty,
      criterion.count
    );
    
    console.log(`   ✓ Found ${existingQuestions.length}/${criterion.count} existing questions`);
    
    if (existingQuestions.length >= criterion.count) {
      allQuestions.push(...existingQuestions.slice(0, criterion.count));
      existingCount += criterion.count;
    } else {
      // Use existing questions
      allQuestions.push(...existingQuestions);
      existingCount += existingQuestions.length;
      
      // Generate missing questions with AI
      const needed = criterion.count - existingQuestions.length;
      console.log(`   🤖 Generating ${needed} questions with AI...`);
      
      try {
        const aiQuestions = await generateAIQuestions(
          criterion.topic,
          criterion.bloomLevel,
          criterion.difficulty,
          needed
        );
        
        // Save AI questions to database
        const savedQuestions = await saveAIQuestionsToBank(aiQuestions, user.id, tosId);
        allQuestions.push(...savedQuestions);
        aiGeneratedCount += savedQuestions.length;
        
        console.log(`   ✅ Generated and saved ${savedQuestions.length} AI questions`);
      } catch (error) {
        console.error(`   ❌ Failed to generate AI questions:`, error);
        // Continue with whatever questions we have
      }
    }
  }

  console.log(`\n📝 Total Questions: ${allQuestions.length}`);
  console.log(`   - Existing: ${existingCount}`);
  console.log(`   - AI Generated: ${aiGeneratedCount}`);

  // ============= COMPLETION GATE: Enforce exact TOS count =============
  const requiredTotal = criteria.reduce((sum, c) => sum + c.count, 0);
  let completionAttempts = 0;
  const MAX_COMPLETION_ATTEMPTS = 3;

  while (allQuestions.length < requiredTotal && completionAttempts < MAX_COMPLETION_ATTEMPTS) {
    completionAttempts++;
    const shortfall = requiredTotal - allQuestions.length;
    
    console.log(`\n🔄 === COMPLETION GATE RETRY ${completionAttempts}/${MAX_COMPLETION_ATTEMPTS} ===`);
    console.log(`   📊 Current: ${allQuestions.length}/${requiredTotal} (need ${shortfall} more)`);
    
    // Generate repair questions for the shortfall
    try {
      // Distribute shortfall across random criteria
      const repairCriteria = criteria.filter(c => c.count > 0);
      const repairTopic = repairCriteria[completionAttempts % repairCriteria.length] || criteria[0];
      
      console.log(`   🤖 Generating ${shortfall} repair questions for ${repairTopic.topic}...`);
      
      const repairQuestions = await generateAIQuestions(
        repairTopic.topic,
        repairTopic.bloomLevel,
        repairTopic.difficulty,
        shortfall
      );
      
      if (repairQuestions.length > 0) {
        const savedRepair = await saveAIQuestionsToBank(repairQuestions, user.id, tosId);
        allQuestions.push(...savedRepair);
        aiGeneratedCount += savedRepair.length;
        console.log(`   ✅ Added ${savedRepair.length} repair questions`);
      }
    } catch (error) {
      console.error(`   ❌ Repair attempt ${completionAttempts} failed:`, error);
    }
    
    console.log(`   📊 New total: ${allQuestions.length}/${requiredTotal}`);
  }

  // Final validation: TOS contract must be satisfied
  if (allQuestions.length < requiredTotal) {
    const shortfall = requiredTotal - allQuestions.length;
    console.error(`❌ TOS CONTRACT VIOLATION: ${allQuestions.length}/${requiredTotal} questions`);
    throw new Error(
      `Test generation incomplete: generated ${allQuestions.length}/${requiredTotal} questions. ` +
      `${shortfall} questions could not be generated. Please try again.`
    );
  }

  if (allQuestions.length === 0) {
    throw new Error("No questions could be generated or selected");
  }

  // Trim to exact count if we have extras
  const finalQuestions = allQuestions.slice(0, requiredTotal);
  
  console.log(`✅ TOS CONTRACT SATISFIED: ${finalQuestions.length}/${requiredTotal} questions`);

  // STEP 8: Assemble and save final test
  const testId = await assembleFinalTest(
    testData.title,
    finalQuestions,
    testData,
    user.id,
    tosId
  );

  console.log(`✅ Test created successfully! ID: ${testId}`);

  return { testId };
}

/**
 * Build criteria from TOS distribution
 */
function buildCriteriaFromTOS(tosMatrix: any): TOSCriteria[] {
  const criteria: TOSCriteria[] = [];
  const distribution = tosMatrix.distribution || {};

  Object.keys(distribution).forEach(topicName => {
    const topicDist = distribution[topicName];
    
    // Map Bloom levels — handle both object format {count, items} and array format
    const bloomLevels: Array<{ level: BloomLevel, count: number }> = [
      { level: 'remembering', count: getBloomCount(topicDist.remembering) },
      { level: 'understanding', count: getBloomCount(topicDist.understanding) },
      { level: 'applying', count: getBloomCount(topicDist.applying) },
      { level: 'analyzing', count: getBloomCount(topicDist.analyzing) },
      { level: 'evaluating', count: getBloomCount(topicDist.evaluating) },
      { level: 'creating', count: getBloomCount(topicDist.creating) }
    ];

    bloomLevels.forEach(({ level, count }) => {
      if (count > 0) {
        // Map bloom level to difficulty directly (no sub-splitting that inflates counts)
        const difficulty: Difficulty = 
          ['remembering', 'understanding'].includes(level) ? 'easy' :
          ['applying', 'analyzing'].includes(level) ? 'average' : 'difficult';
        
        criteria.push({
          topic: topicName,
          bloomLevel: level,
          difficulty,
          count
        });
      }
    });
  });

  return criteria;
}

/**
 * Extract count from bloom distribution data (handles both formats)
 */
function getBloomCount(bloomData: any): number {
  if (!bloomData) return 0;
  if (typeof bloomData === 'object' && 'count' in bloomData) return bloomData.count;
  if (Array.isArray(bloomData)) return bloomData.length;
  return 0;
}

/**
 * Query existing approved questions from bank
 */
async function queryQuestionBank(
  topic: string,
  bloomLevel: BloomLevel,
  difficulty: Difficulty,
  count: number
): Promise<any[]> {
  const { data, error } = await supabase
    .from('questions')
    .select('*')
    .eq('topic', topic)
    .eq('bloom_level', bloomLevel)
    .eq('difficulty', difficulty)
    .eq('approved', true)
    .eq('deleted', false)
    .order('used_count', { ascending: true })
    .limit(count * 2); // Get more for selection

  if (error) {
    console.error("Error querying questions:", error);
    return [];
  }

  return data || [];
}

/**
 * Generate AI questions using the question generator
 */
async function generateAIQuestions(
  topic: string,
  bloomLevel: BloomLevel,
  difficulty: Difficulty,
  count: number
): Promise<any[]> {
  return generateQuestionsWithAI(topic, bloomLevel, difficulty, count);
}

/**
 * Save AI-generated questions to database
 */
async function saveAIQuestionsToBank(
  questions: any[],
  userId: string,
  tosId: string
): Promise<any[]> {
  const { resolveSubjectMetadata } = await import('./subjectMetadataResolver');
  const savedQuestions: any[] = [];

  for (const q of questions) {
    try {
      const subjectMeta = resolveSubjectMetadata({
        subject: q.subject,
        topic: q.topic,
        subject_code: q.subject_code,
        subject_description: q.subject_description,
        category: q.category,
        specialization: q.specialization,
      });

      const { data: saved, error: insertError } = await supabase
        .from('questions')
        .insert({
          question_text: q.question_text,
          question_type: q.question_type,
          choices: q.choices || null,
          correct_answer: q.correct_answer || null,
          topic: q.topic,
          bloom_level: q.bloom_level,
          difficulty: q.difficulty,
          knowledge_dimension: 'conceptual',
          category: subjectMeta.category,
          specialization: subjectMeta.specialization,
          subject_code: subjectMeta.subject_code,
          subject_description: subjectMeta.subject_description,
          created_by: 'ai',
          approved: true,
          status: 'approved',
          owner: userId,
          ai_confidence_score: 0.75,
          needs_review: false,
          tos_id: tosId,
          metadata: { auto_generated: true, points: q.points || 1 }
        })
        .select()
        .single();

      if (insertError) {
        console.error("Error saving question:", insertError);
        continue;
      }

      savedQuestions.push(saved);

      // Log to ai_generation_logs
      await supabase.from('ai_generation_logs').insert({
        question_id: saved.id,
        generation_type: 'tos_generation',
        prompt_used: `Generate ${q.bloom_level} question on ${q.topic} with ${q.difficulty} difficulty`,
        model_used: 'template_fallback',
        generated_by: userId,
        tos_id: tosId,
        metadata: {
          question_type: q.question_type,
          auto_generated: true
        }
      });

    } catch (error) {
      console.error("Error in saveAIQuestionsToBank:", error);
    }
  }

  return savedQuestions;
}

/**
 * Assemble final test and save to generated_tests
 */
async function assembleFinalTest(
  title: string,
  questions: any[],
  testData: TestData,
  userId: string,
  tosId: string
): Promise<string> {
  // Number the questions
  const numberedQuestions = questions.map((q, index) => ({
    ...q,
    question_number: index + 1
  }));

  // Generate answer key
  const answerKey = numberedQuestions.map((q, index) => ({
    question_number: index + 1,
    question_id: q.id,
    correct_answer: q.correct_answer,
    question_text: q.question_text,
    points: q.metadata?.points || 1,
    bloom_level: q.bloom_level,
    topic: q.topic
  }));

  // Save to generated_tests
  const { data: test, error } = await supabase
    .from('generated_tests')
    .insert({
      title,
      subject: testData.subject || null,
      course: testData.course || null,
      year_section: testData.year_section || null,
      exam_period: testData.exam_period || null,
      school_year: testData.school_year || null,
      items: numberedQuestions,
      answer_key: answerKey,
      tos_id: tosId,
      created_by: userId,
      points_per_question: 1
    })
    .select()
    .single();

  if (error) {
    console.error("Error saving test:", error);
    throw error;
  }

  return test.id;
}
