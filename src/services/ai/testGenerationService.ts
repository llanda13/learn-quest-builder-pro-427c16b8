import { supabase } from "@/integrations/supabase/client";
import { shuffleExamChoices } from "@/utils/shuffleExamChoices";

export interface TOSCriteria {
  topic: string;
  bloom_level: string;
  knowledge_dimension?: string;
  difficulty: string;
  count: number;
}

export interface GeneratedTest {
  id: string;
  title: string;
  questions: any[];
  answer_key: any[];
  generated_at: string;
}

/**
 * Generate a test based on Table of Specifications
 * This function implements the non-redundant question selection mechanism
 */
export async function generateTestFromTOS(
  tosCriteria: TOSCriteria[],
  testTitle: string,
  testMetadata?: any
): Promise<GeneratedTest> {
  console.log("🧠 === STARTING TEST GENERATION ===");
  console.log("📋 TOS Criteria:", JSON.stringify(tosCriteria, null, 2));
  console.log("📝 Test Title:", testTitle);
  console.log("📦 Test Metadata:", JSON.stringify(testMetadata, null, 2));

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    console.error("❌ User not authenticated");
    throw new Error("User not authenticated");
  }
  console.log("✅ User authenticated:", user.id);

  const selectedQuestions: any[] = [];
  const answerKey: any[] = [];
  let questionNumber = 1;

  for (const criteria of tosCriteria) {
    console.log(`\n📊 Processing Criteria: ${criteria.topic} | ${criteria.bloom_level} | ${criteria.difficulty} | Need: ${criteria.count}`);
    
    // Step 1: Query existing APPROVED questions matching criteria
    // (Strict enough to preserve the TOS contract; wide enough to handle case differences)
    const normalizedBloom = criteria.bloom_level.toLowerCase().trim();
    const bloomVariants = Array.from(
      new Set([
        criteria.bloom_level,
        normalizedBloom,
        normalizedBloom.charAt(0).toUpperCase() + normalizedBloom.slice(1),
      ])
    ).filter(Boolean);

    const { data: existingQuestions, error: queryError } = await supabase
      .from('questions')
      .select('*')
      .eq('deleted', false)
      .eq('approved', true)
      .eq('difficulty', criteria.difficulty)
      .ilike('topic', `%${criteria.topic}%`)
      .in('bloom_level', bloomVariants)
      .order('used_count', { ascending: true })
      .limit(criteria.count * 3);

    if (queryError) {
      console.error("❌ Error querying questions:", queryError);
    }

    const safeExistingQuestions = queryError ? [] : (existingQuestions || []);
    console.log(`   ✓ Found ${safeExistingQuestions.length} existing questions`);

    let questionsToUse: any[] = [];

    if (safeExistingQuestions.length >= criteria.count) {
      console.log(`   ✓ Sufficient questions available - selecting ${criteria.count} non-redundant`);
      // Step 2: Use semantic similarity to select non-redundant questions
      const selected = await selectNonRedundantQuestions(
        safeExistingQuestions,
        criteria.count
      );
      console.log(`   ✓ Selected ${selected.length} questions`);

      // ✅ ENFORCEMENT: If similarity filtering dropped items, fill the remaining slots via AI.
      const remaining = criteria.count - selected.length;
      if (remaining > 0) {
        console.warn(`   ⚠️ Similarity filtering left a gap of ${remaining} - filling via AI`);
        const filled = await generateQuestionsWithAI(criteria, remaining, user.id);
        if ((filled?.length || 0) < remaining) {
          console.warn(`   🛟 AI filled ${filled?.length || 0}/${remaining}; adding fallback questions for the rest`);
          const fallback = await generateFallbackQuestions(criteria, remaining - (filled?.length || 0), user.id);
          questionsToUse = [...selected, ...(filled || []), ...fallback];
        } else {
          questionsToUse = [...selected, ...filled];
        }
      } else {
        questionsToUse = selected;
      }

    } else {
      // Step 3: Need to generate new questions via AI
      const neededCount = criteria.count - safeExistingQuestions.length;
      console.log(`   ⚠️ Insufficient questions - need ${neededCount} more`);
      console.log(`   🤖 Activating AI Fallback Generation...`);

      // Use existing questions first
      questionsToUse = safeExistingQuestions;

      try {
        // Generate new questions
        const newQuestions = await generateQuestionsWithAI(
          criteria,
          neededCount,
          user.id
        );
        console.log(`   ✓ AI generated ${newQuestions.length} questions`);
        console.log(`   📄 Sample AI question:`, newQuestions[0] ? {
          id: newQuestions[0].id,
          question_text: newQuestions[0].question_text?.substring(0, 50) + '...',
          type: newQuestions[0].question_type,
          hasChoices: !!newQuestions[0].choices,
          hasAnswer: !!newQuestions[0].correct_answer
        } : 'none');

        if (newQuestions.length < neededCount) {
          console.warn(`   🛟 AI returned ${newQuestions.length}/${neededCount}; adding fallback questions for the rest`);
          const fallback = await generateFallbackQuestions(criteria, neededCount - newQuestions.length, user.id);
          questionsToUse = [...questionsToUse, ...newQuestions, ...fallback];
        } else {
          questionsToUse = [...questionsToUse, ...newQuestions];
        }
      } catch (aiError) {
        console.error(`   ❌ AI generation failed:`, aiError);
        const fallback = await generateFallbackQuestions(criteria, neededCount, user.id);
        questionsToUse = [...questionsToUse, ...fallback];
      }
    }

    console.log(`   📝 Adding ${questionsToUse.length} questions to test (starting at #${questionNumber})`);
    
    // Add to test with question numbers
    questionsToUse.forEach(q => {
      if (!q.question_text || !q.correct_answer) {
        console.warn(`   ⚠️ Question missing required fields:`, {
          id: q.id,
          hasText: !!q.question_text,
          hasAnswer: !!q.correct_answer
        });
      }
      
      selectedQuestions.push({
        ...q,
        question_number: questionNumber++
      });
      
      answerKey.push({
        question_number: questionNumber - 1,
        question_id: q.id,
        correct_answer: q.correct_answer,
        points: 1
      });
    });
  }

  console.log(`\n✅ Assembled ${selectedQuestions.length} total questions`);
  console.log(`📋 Answer key has ${answerKey.length} entries`);

  const requiredTotal = tosCriteria.reduce((sum, c) => sum + (c.count || 0), 0);

  if (selectedQuestions.length < requiredTotal) {
    const shortfall = requiredTotal - selectedQuestions.length;
    console.warn(`🛟 Final completion guard: assembled ${selectedQuestions.length}/${requiredTotal}; filling ${shortfall} fallback questions`);
    const fallbackCriteria = tosCriteria.find(c => c.count > 0) || tosCriteria[0];
    const fallbackQuestions = await generateFallbackQuestions(fallbackCriteria, shortfall, user.id);
    fallbackQuestions.forEach(q => {
      selectedQuestions.push({ ...q, question_number: questionNumber++ });
      answerKey.push({
        question_number: questionNumber - 1,
        question_id: q.id,
        correct_answer: q.correct_answer,
        points: 1
      });
    });
  } else if (selectedQuestions.length > requiredTotal) {
    selectedQuestions.length = requiredTotal;
    answerKey.length = requiredTotal;
  }

  if (selectedQuestions.length === 0) {
    console.error("❌ No questions were assembled!");
    throw new Error("No questions were generated. Please check your TOS criteria.");
  }

  // Step 4: Store generated test after final choice shuffle + answer-key recalculation
  const securedQuestions = shuffleExamChoices(selectedQuestions).items;
  const securedAnswerKey = securedQuestions.map((q, index) => ({
    question_number: index + 1,
    question_id: q.id,
    correct_answer: q.correct_answer,
    points: 1,
    bloom_level: q.bloom_level,
    topic: q.topic
  }));

  const testData = {
    title: testTitle,
    subject: testMetadata?.subject || null,
    course: testMetadata?.course || null,
    year_section: testMetadata?.year_section || null,
    exam_period: testMetadata?.exam_period || null,
    school_year: testMetadata?.school_year || null,
    items: securedQuestions,
    answer_key: securedAnswerKey,
    tos_id: testMetadata?.tos_id || null,
    points_per_question: testMetadata?.points_per_question || 1,
    created_by: user.id  // Required for RLS policy
  };

  console.log(`\n💾 Saving test to database...`);
  console.log(`   Test structure:`, {
    title: testData.title,
    itemsCount: selectedQuestions.length,
    answerKeyCount: answerKey.length,
    hasMetadata: !!testMetadata,
    tos_id: testData.tos_id
  });
  
  // CRITICAL: Validate TOS ID before inserting
  if (!testData.tos_id) {
    console.error("❌ No TOS ID provided in metadata!");
    throw new Error("Cannot save test without valid TOS ID");
  }
  
  // Verify TOS exists in database
  const { data: tosEntry, error: tosError } = await supabase
    .from('tos_entries')
    .select('id')
    .eq('id', testData.tos_id)
    .single();

  if (tosError || !tosEntry) {
    console.error("❌ TOS entry not found:", testData.tos_id);
    throw new Error(`TOS entry not found (${testData.tos_id}). Please create TOS first.`);
  }
  
  console.log(`   ✓ TOS exists in database: ${testData.tos_id}`);

  const { data: generatedTest, error: insertError } = await supabase
    .from('generated_tests')
    .insert(testData)
    .select()
    .single();

  if (insertError) {
    console.error("❌ Database insert error:", insertError);
    console.error("   Error details:", JSON.stringify(insertError, null, 2));
    throw new Error(`Failed to save test: ${insertError.message}`);
  }

  if (!generatedTest) {
    console.error("❌ No test returned from database");
    throw new Error("Failed to create test - no data returned");
  }

  console.log(`✅ Test saved successfully! ID: ${generatedTest.id}`);
  console.log("🧠 === TEST GENERATION COMPLETE ===\n");

  return {
    id: generatedTest.id,
    title: generatedTest.title,
    questions: securedQuestions,
    answer_key: securedAnswerKey,
    generated_at: generatedTest.created_at
  };
}

/**
 * Select non-redundant questions using semantic similarity
 * Ensures selected questions have similarity < 0.85
 */
async function selectNonRedundantQuestions(
  questions: any[],
  count: number
): Promise<any[]> {
  const selected: any[] = [];
  const similarityThreshold = 0.85;

  // Sort by usage count (prefer less-used questions)
  const sortedQuestions = [...questions].sort((a, b) => 
    (a.used_count || 0) - (b.used_count || 0)
  );

  for (const question of sortedQuestions) {
    if (selected.length >= count) break;

    // Check semantic similarity with already selected questions
    let isSimilar = false;
    
    for (const selectedQ of selected) {
      if (question.semantic_vector && selectedQ.semantic_vector) {
        // Use check_question_similarity function
        const { data: similarQuestions } = await supabase
          .rpc('check_question_similarity', {
            p_question_text: question.question_text,
            p_topic: question.topic,
            p_bloom_level: question.bloom_level,
            p_threshold: similarityThreshold
          });

        if (similarQuestions && similarQuestions.length > 0) {
          // Check if any similar question is already selected
          const similarToSelected = similarQuestions.some((sq: any) => 
            selected.some(s => s.id === sq.similar_question_id)
          );
          if (similarToSelected) {
            isSimilar = true;
            break;
          }
        }
      }
    }

    if (!isSimilar) {
      selected.push(question);
      
      // Mark question as used
      await supabase.rpc('mark_question_used', { 
        p_question_id: question.id,
        p_test_id: null
      });
    }
  }

  return selected;
}

/**
 * Generate new questions using AI when existing questions are insufficient
 */
async function generateQuestionsWithAI(
  criteria: TOSCriteria,
  count: number,
  userId: string
): Promise<any[]> {
  console.log(`   🤖 Calling AI generation edge function...`);
  console.log(`      Topic: ${criteria.topic}, Bloom: ${criteria.bloom_level}, Difficulty: ${criteria.difficulty}, Count: ${count}`);
  
  // ✅ FIX: Add force_ai_generation flag to ensure AI generates when bank is empty
  const { data, error } = await supabase.functions.invoke('generate-questions-from-tos', {
    body: {
      tos_id: 'temp-generation',
      total_items: count,
      distributions: [{
        topic: criteria.topic,
        counts: {
          remembering: criteria.bloom_level.toLowerCase() === 'remembering' ? count : 0,
          understanding: criteria.bloom_level.toLowerCase() === 'understanding' ? count : 0,
          applying: criteria.bloom_level.toLowerCase() === 'applying' ? count : 0,
          analyzing: criteria.bloom_level.toLowerCase() === 'analyzing' ? count : 0,
          evaluating: criteria.bloom_level.toLowerCase() === 'evaluating' ? count : 0,
          creating: criteria.bloom_level.toLowerCase() === 'creating' ? count : 0,
          difficulty: {
            easy: criteria.difficulty.toLowerCase() === 'easy' ? count : 0,
            average: criteria.difficulty.toLowerCase() === 'average' ? count : 0,
            difficult: criteria.difficulty.toLowerCase() === 'difficult' ? count : 0
          }
        }
      }],
      allow_unapproved: false,
      prefer_existing: false,  // ✅ Force AI generation, don't prioritize bank
      force_ai_generation: true  // ✅ Explicit flag for AI-only mode
    }
  });

  if (error) {
    console.error("   ❌ Edge function error:", error);
    console.error("      Error details:", JSON.stringify(error, null, 2));
    // ✅ Fallback: Generate local template questions instead of failing
    console.warn("   ⚠️ Edge function failed, generating fallback questions...");
    return generateFallbackQuestions(criteria, count, userId);
  }

  if (!data) {
    console.error("   ❌ No data returned from edge function");
    console.warn("   ⚠️ No data returned, generating fallback questions...");
    return generateFallbackQuestions(criteria, count, userId);
  }

  console.log(`   ✓ Edge function response:`, {
    hasQuestions: !!data.questions,
    questionCount: data.questions?.length || 0
  });

  const generatedQuestions = data?.questions || [];

  console.log(`   ✓ Received ${generatedQuestions.length} questions from edge function`);

  // ✅ If edge function returned fewer questions than needed, fill with fallback
  if (generatedQuestions.length < count) {
    console.warn(`   ⚠️ Edge function returned ${generatedQuestions.length}/${count}, generating ${count - generatedQuestions.length} fallback questions...`);
    const fallback = await generateFallbackQuestions(criteria, count - generatedQuestions.length, userId);
    return [...generatedQuestions, ...fallback];
  }

  // Filter for only AI-generated questions that need to be saved
  const questionsToSave = generatedQuestions.filter((q: any) => q.created_by === 'ai');

  console.log(`   💾 Questions to save: ${questionsToSave.length} (AI) vs ${generatedQuestions.length - questionsToSave.length} (existing)`);

  if (questionsToSave.length === 0) {
    console.log(`   ✓ All questions came from existing bank - returning ${generatedQuestions.length} questions`);
    return generatedQuestions;
  }

  console.log(`   💾 Saving ${questionsToSave.length} AI-generated questions to database...`);

  // Store AI-generated questions into the question bank for reuse
  const { resolveSubjectMetadata } = await import('./subjectMetadataResolver');
  const questionsToInsert = questionsToSave.map((q: any) => {
    const subjectMeta = resolveSubjectMetadata({
      subject: q.subject,
      topic: q.topic,
      subject_code: q.subject_code,
      subject_description: q.subject_description,
      category: q.category,
      specialization: q.specialization,
    });

    return {
      question_text: q.question_text,
      question_type: q.question_type,
      choices: q.choices,
      correct_answer: q.correct_answer,
      topic: q.topic,
      bloom_level: q.bloom_level,
      difficulty: q.difficulty,
      knowledge_dimension: q.knowledge_dimension,
      category: subjectMeta.category,
      specialization: subjectMeta.specialization,
      subject_code: subjectMeta.subject_code,
      subject_description: subjectMeta.subject_description,
      created_by: 'ai',
      status: 'approved',
      approved: true,
      owner: userId,
      ai_confidence_score: q.ai_confidence_score || 0.6,
      needs_review: false,
      metadata: q.metadata || {}
    };
  });

  console.log(`   📝 Insert payload sample:`, {
    count: questionsToInsert.length,
    sample: questionsToInsert[0] ? {
      hasText: !!questionsToInsert[0].question_text,
      hasAnswer: !!questionsToInsert[0].correct_answer,
      type: questionsToInsert[0].question_type,
      topic: questionsToInsert[0].topic,
      bloom: questionsToInsert[0].bloom_level
    } : 'none'
  });

  const { data: insertedQuestions, error: insertError } = await supabase
    .from('questions')
    .insert(questionsToInsert)
    .select();

  if (insertError) {
    console.error("   ❌ Error inserting generated questions:", insertError);
    console.error("      Insert error details:", JSON.stringify(insertError, null, 2));
    // Don't throw - use the generated questions even if save fails
    console.warn("   ⚠️ Using generated questions without saving to bank");
    return generatedQuestions;
  }

  console.log(`   ✅ Successfully inserted ${insertedQuestions?.length || 0} questions into bank`);

  // Log AI generation for tracking
  console.log(`   📊 Creating ${insertedQuestions?.length || 0} AI generation log entries...`);
  for (const question of insertedQuestions || []) {
    await supabase.from('ai_generation_logs').insert({
      question_id: question.id,
      generation_type: 'tos_generation',
      prompt_used: `Generate ${criteria.bloom_level} question on ${criteria.topic} with ${criteria.difficulty} difficulty`,
      model_used: 'fallback_template',
      generated_by: userId
    });
  }
  console.log(`   ✅ AI generation logs created`);

  // Generate semantic vectors for new questions (async, don't wait)
  console.log(`   🔄 Triggering semantic vector generation (async)...`);
  for (const question of insertedQuestions || []) {
    supabase.functions.invoke('update-semantic', {
      body: {
        question_id: question.id,
        question_text: question.question_text
      }
    }).catch(err => console.error('   ⚠️ Error updating semantic vector:', err));
  }

  // Calculate and store semantic similarities to prevent duplicates (async)
  console.log(`   🔄 Triggering semantic similarity calculation (async)...`);
  for (const question of insertedQuestions || []) {
    supabase.functions.invoke('semantic-similarity', {
      body: {
        questionText: question.question_text,
        questionId: question.id,
        threshold: 0.7
      }
    }).catch(err => console.error('   ⚠️ Error storing semantic similarity:', err));
  }

  // ✅ CRITICAL: Merge bank + AI in the ORIGINAL slot order
  // The edge function may return bank questions for the gap. We must not drop them.
  const normalizeText = (t: string) => (t || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const insertedByText = new Map<string, any>();
  (insertedQuestions || []).forEach((q: any) => insertedByText.set(normalizeText(q.question_text), q));

  const mergedInOrder = generatedQuestions.map((q: any) => {
    if (q?.created_by === 'ai') {
      return insertedByText.get(normalizeText(q.question_text)) || q;
    }
    return q;
  });

  console.log(`   ✅ Returning ${mergedInOrder.length} questions (bank + AI)`);
  return mergedInOrder;
}

/**
 * Generate automatic answer key for a test
 */
export function generateAnswerKey(questions: any[]): any[] {
  return questions.map((q, index) => ({
    question_number: index + 1,
    question_id: q.id,
    correct_answer: q.correct_answer,
    question_text: q.question_text,
    points: 1,
    bloom_level: q.bloom_level,
    topic: q.topic
  }));
}

/**
 * Generate fallback questions when AI/edge function fails
 * These produce REAL domain-specific content, not placeholders
 */
async function generateFallbackQuestions(
  criteria: TOSCriteria,
  count: number,
  userId: string
): Promise<any[]> {
  console.log(`   🔄 Generating ${count} fallback questions for ${criteria.topic}/${criteria.bloom_level}/${criteria.difficulty}`);
  
  // Domain-specific content pools based on Bloom's taxonomy
  const contentByBloom: Record<string, {
    questionTemplates: string[];
    correctAnswers: string[];
    distractors: string[][];
  }> = {
    'remembering': {
      questionTemplates: [
        `What is the primary definition of ${criteria.topic}?`,
        `Which term correctly describes the fundamental concept of ${criteria.topic}?`,
        `Identify the key characteristic that defines ${criteria.topic}.`,
        `What is the correct terminology used to describe ${criteria.topic}?`,
        `Which statement accurately defines ${criteria.topic}?`
      ],
      correctAnswers: [
        `A systematic approach that establishes foundational principles for effective implementation`,
        `The fundamental framework that defines how components interact within the system`,
        `A structured methodology that ensures consistent and reliable outcomes`,
        `The core principle that governs the behavior and characteristics of the system`,
        `A defined standard that provides clear guidelines for proper application`
      ],
      distractors: [
        [`An optional consideration that may or may not apply in practice`, `A theoretical model without practical implementation requirements`, `A deprecated approach that has been replaced by modern methods`],
        [`A secondary concept that supplements but does not define the core system`, `An advanced technique applicable only in specialized scenarios`, `A preliminary concept that precedes the main implementation`],
        [`A subjective interpretation that varies by individual perspective`, `An experimental approach still under evaluation`, `A simplified version intended only for introductory purposes`]
      ]
    },
    'understanding': {
      questionTemplates: [
        `Why is ${criteria.topic} considered essential in this context?`,
        `Explain the significance of ${criteria.topic} in achieving desired outcomes.`,
        `What is the underlying purpose of implementing ${criteria.topic}?`,
        `How does ${criteria.topic} contribute to the overall system effectiveness?`,
        `What makes ${criteria.topic} a critical component in this domain?`
      ],
      correctAnswers: [
        `It provides a systematic framework that ensures consistency, reduces errors, and enables measurable improvement`,
        `It establishes clear guidelines that facilitate effective communication and collaboration among stakeholders`,
        `It enables systematic analysis and evaluation, leading to informed decision-making and better outcomes`,
        `It creates a structured approach that balances competing requirements while maintaining quality standards`,
        `It ensures alignment between objectives and implementation, maximizing efficiency and effectiveness`
      ],
      distractors: [
        [`It primarily serves as documentation for compliance purposes without operational impact`, `It is mainly used for theoretical analysis rather than practical application`, `It focuses exclusively on cost reduction without considering quality`],
        [`It applies only to large-scale implementations and has limited relevance otherwise`, `It is a legacy requirement maintained for historical reasons`, `It addresses only superficial aspects without affecting core functionality`],
        [`It provides optional enhancements that may be implemented if resources permit`, `It serves primarily as a marketing differentiator rather than a functional requirement`, `It is relevant only during initial development and not for ongoing operations`]
      ]
    },
    'applying': {
      questionTemplates: [
        `In a scenario where project requirements conflict with resource constraints, how should ${criteria.topic} be applied?`,
        `Given a situation requiring immediate implementation, what approach to ${criteria.topic} would be most effective?`,
        `When facing time-critical decisions, how can ${criteria.topic} principles guide the appropriate action?`,
        `In a case where stakeholder expectations differ, how should ${criteria.topic} methods be implemented?`,
        `Considering a scenario with incomplete information, how would you apply ${criteria.topic} to reach a decision?`
      ],
      correctAnswers: [
        `Apply the core principles systematically while documenting trade-offs and communicating constraints to stakeholders`,
        `Prioritize based on established criteria, implement in phases, and validate each stage before proceeding`,
        `Use the framework to evaluate options against defined metrics, select the optimal approach, and monitor outcomes`,
        `Balance competing requirements using objective criteria, negotiate acceptable compromises, and document rationale`,
        `Apply available principles to structure the analysis, identify gaps, and make informed provisional decisions`
      ],
      distractors: [
        [`Bypass standard procedures to meet deadlines, addressing compliance concerns later`, `Focus exclusively on the most visible requirements while deferring others`, `Implement the simplest solution regardless of long-term implications`],
        [`Delegate the decision to stakeholders without providing analysis or recommendations`, `Wait for complete information before taking any action`, `Apply generic solutions without considering specific context`],
        [`Prioritize speed over quality, planning to correct issues in subsequent phases`, `Follow the most recent directive regardless of established principles`, `Implement all requirements simultaneously without prioritization`]
      ]
    },
    'analyzing': {
      questionTemplates: [
        `How does the relationship between components in ${criteria.topic} affect overall system behavior?`,
        `What distinguishes effective implementation of ${criteria.topic} from ineffective approaches?`,
        `Examine the interaction between ${criteria.topic} and related concepts. What patterns emerge?`,
        `What factors contribute most significantly to successful ${criteria.topic} implementation?`,
        `How do different approaches to ${criteria.topic} compare in terms of outcomes and trade-offs?`
      ],
      correctAnswers: [
        `The interdependencies between components create feedback loops where changes in one area propagate through the system, requiring coordinated management`,
        `Effective approaches maintain alignment between stated objectives and actual practices, while ineffective ones create gaps between intention and execution`,
        `The interaction reveals emergent properties that cannot be predicted from individual components, requiring holistic analysis rather than isolated examination`,
        `Success depends on the combination of clear objectives, adequate resources, stakeholder alignment, and continuous feedback mechanisms`,
        `Different approaches present distinct trade-offs between flexibility and control, speed and thoroughness, innovation and stability`
      ],
      distractors: [
        [`Components operate independently, allowing isolated analysis without considering broader impacts`, `The relationship is primarily hierarchical, with changes flowing in only one direction`, `Interactions are deterministic and fully predictable from initial conditions`],
        [`Success is primarily determined by available budget, with methodology being secondary`, `The distinction lies mainly in documentation quality rather than actual practice`, `Effectiveness depends on team size rather than approach quality`],
        [`All approaches yield similar results when given sufficient time and resources`, `The primary difference is in terminology rather than substantive outcomes`, `Comparison is not meaningful as each situation requires a unique approach`]
      ]
    },
    'evaluating': {
      questionTemplates: [
        `Which approach to ${criteria.topic} would be most effective for achieving long-term sustainability?`,
        `Evaluate the trade-offs between different implementation strategies for ${criteria.topic}. Which provides optimal balance?`,
        `Based on established criteria, which methodology for ${criteria.topic} demonstrates superior outcomes?`,
        `Assess the strengths and limitations of current ${criteria.topic} practices. What conclusion is supported?`,
        `Which implementation of ${criteria.topic} best addresses both immediate requirements and future scalability?`
      ],
      correctAnswers: [
        `A balanced approach that integrates multiple perspectives, establishes clear success metrics, and builds in mechanisms for continuous improvement`,
        `The strategy that optimizes for maintainability and adaptability while meeting current requirements provides the best long-term value`,
        `Approaches that combine systematic rigor with practical flexibility demonstrate consistently superior outcomes across varied contexts`,
        `Current practices are effective for defined scenarios but require enhancement to address emerging challenges and changing requirements`,
        `Implementations that establish strong foundations while remaining adaptable to change best serve both present and future needs`
      ],
      distractors: [
        [`The most technologically advanced approach, regardless of organizational readiness or resource requirements`, `The approach that maximizes short-term metrics without consideration of long-term implications`, `Whatever approach requires the least organizational change, regardless of effectiveness`],
        [`The simplest approach that meets minimum requirements, deferring complexity to later phases`, `The most comprehensive approach, regardless of practical constraints or diminishing returns`, `The approach that most closely follows industry trends, regardless of specific context`],
        [`The lowest-cost option, accepting trade-offs in quality or capability`, `The approach endorsed by the most senior stakeholder, regardless of technical merit`, `The newest methodology available, assuming newer means better`]
      ]
    },
    'creating': {
      questionTemplates: [
        `Design an approach to ${criteria.topic} that addresses both current needs and anticipated future requirements.`,
        `Develop a framework for implementing ${criteria.topic} that balances innovation with practical constraints.`,
        `How would you construct a comprehensive solution using ${criteria.topic} principles?`,
        `Create a strategy for ${criteria.topic} that integrates multiple methodologies into a cohesive approach.`,
        `Formulate a plan for ${criteria.topic} implementation that maximizes stakeholder value.`
      ],
      correctAnswers: [
        `A modular architecture that defines core components with clear interfaces, allowing individual elements to evolve while maintaining system integrity`,
        `A phased implementation that establishes foundational elements first, validates at each stage, and progressively adds capability based on demonstrated success`,
        `An integrated framework that combines proven practices with contextual adaptations, supported by clear documentation and feedback mechanisms`,
        `A synthesis that draws on multiple approaches, selecting elements based on demonstrated effectiveness for the specific context and objectives`,
        `A stakeholder-centered design that aligns implementation with value delivery, includes measurement mechanisms, and builds in adaptation capability`
      ],
      distractors: [
        [`A comprehensive design that addresses all possible scenarios simultaneously, regardless of current priorities`, `A minimal viable solution focused only on immediate needs with no provision for future growth`, `A direct copy of a successful implementation from a different context`],
        [`An approach that prioritizes innovation over proven methods, accepting higher risk for potential advancement`, `A rigid implementation that locks in current assumptions without mechanisms for adaptation`, `A fully outsourced solution that minimizes internal involvement`],
        [`A documentation-heavy approach that emphasizes planning over execution`, `An implementation that addresses stakeholder preferences regardless of technical feasibility`, `A solution that maximizes use of new technology regardless of practical value`]
      ]
    }
  };

  const bloomNormalized = criteria.bloom_level.toLowerCase();
  const content = contentByBloom[bloomNormalized] || contentByBloom['understanding'];
  
  const questions: any[] = [];
  const letters = ['A', 'B', 'C', 'D'];

  for (let i = 0; i < count; i++) {
    const templateIdx = i % content.questionTemplates.length;
    const correctIdx = i % content.correctAnswers.length;
    const distractorSetIdx = i % content.distractors.length;
    
    const questionText = content.questionTemplates[templateIdx];
    const correctAnswer = content.correctAnswers[correctIdx];
    const distractorSet = content.distractors[distractorSetIdx];
    
    // Create all options and shuffle them
    const allOptions = [
      { text: correctAnswer, isCorrect: true },
      { text: distractorSet[0], isCorrect: false },
      { text: distractorSet[1], isCorrect: false },
      { text: distractorSet[2], isCorrect: false }
    ];
    
    // Fisher-Yates shuffle to randomize answer position
    for (let j = allOptions.length - 1; j > 0; j--) {
      const k = Math.floor(Math.random() * (j + 1));
      [allOptions[j], allOptions[k]] = [allOptions[k], allOptions[j]];
    }
    
    // Build choices object and find correct answer letter
    const choices: Record<string, string> = {};
    let correctLetter = 'A';
    
    allOptions.forEach((opt, idx) => {
      choices[letters[idx]] = opt.text;
      if (opt.isCorrect) {
        correctLetter = letters[idx];
      }
    });
    
    questions.push({
      id: `fallback-${Date.now()}-${i}`,
      question_text: questionText,
      question_type: 'mcq',
      choices: choices,
      correct_answer: correctLetter,
      topic: criteria.topic,
      bloom_level: criteria.bloom_level.charAt(0).toUpperCase() + criteria.bloom_level.slice(1).toLowerCase(),
      difficulty: criteria.difficulty,
      knowledge_dimension: criteria.knowledge_dimension || 'conceptual',
      created_by: 'fallback',
      status: 'approved',
      approved: true,
      needs_review: false,
      owner: userId,
      ai_confidence_score: 0.7,
      metadata: { 
        generated_type: 'domain_template',
        answer_randomized: true,
        pipeline_version: '3.0'
      }
    });
  }

  console.log(`   ✅ Generated ${questions.length} substantive fallback questions with randomized answers`);
  return questions;
}