import { Questions, Tests, ActivityLog } from '@/services/db';
import { generateAIQuestion, generateAIQuestionsForNeed, analyzeTopicCoverage } from './classify';
import { shuffleExamChoices } from '@/utils/shuffleExamChoices';

export type TestNeed = {
  topic: string;
  bloom_level: string;
  difficulty: string;
  count: number;
};

export type TestConfiguration = {
  title: string;
  subject: string;
  course?: string;
  year_section?: string;
  exam_period?: string;
  school_year?: string;
  instructions: string;
  time_limit?: number;
  points_per_question: number;
  shuffle_questions: boolean;
  shuffle_choices: boolean;
  number_of_versions: number;
  tos_id?: string;
};

export type TestGenerationResult = {
  testId: string;
  versions: TestVersion[];
  generatedQuestions: number;
  warnings: string[];
};

export type TestVersion = {
  version_label: string;
  questions: any[];
  answer_key: Record<string, string>;
  total_points: number;
};

/**
 * Build test needs from TOS matrix
 */
export function buildNeedsFromTOS(tosMatrix: any): TestNeed[] {
  const needs: TestNeed[] = [];
  const { distribution } = tosMatrix;

  Object.entries(distribution).forEach(([topic, bloomLevels]: [string, any]) => {
    Object.entries(bloomLevels).forEach(([bloomLevel, items]: [string, any]) => {
      const count = Array.isArray(items) ? items.length : 0;
      if (count > 0) {
        // Map Bloom's level to difficulty
        const difficulty = ['remembering', 'understanding'].includes(bloomLevel) ? 'easy'
                         : ['applying', 'analyzing'].includes(bloomLevel) ? 'average' : 'difficult';
        
        needs.push({
          topic,
          bloom_level: bloomLevel,
          difficulty,
          count
        });
      }
    });
  });

  return needs;
}

/**
 * Enhanced needs building with better distribution
 */
export function buildEnhancedNeedsFromTOS(tosMatrix: any): TestNeed[] {
  const needs: TestNeed[] = [];
  const { formData, distribution } = tosMatrix;
  
  // Calculate total hours for percentage-based distribution
  const totalHours = formData.topics.reduce((sum: number, topic: any) => sum + topic.hours, 0);
  
  formData.topics.forEach((topicData: any) => {
    const topicPercentage = topicData.hours / totalHours;
    const topicItems = Math.round(formData.totalItems * topicPercentage);
    
    // Distribute across Bloom's levels (standard distribution)
    const bloomDistribution = {
      remembering: Math.round(topicItems * 0.15),
      understanding: Math.round(topicItems * 0.15),
      applying: Math.round(topicItems * 0.20),
      analyzing: Math.round(topicItems * 0.20),
      evaluating: Math.round(topicItems * 0.15),
      creating: Math.round(topicItems * 0.15)
    };
    
    Object.entries(bloomDistribution).forEach(([bloomLevel, count]) => {
      if (count > 0) {
        const difficulty = ['remembering', 'understanding'].includes(bloomLevel) ? 'easy'
                         : ['applying', 'analyzing'].includes(bloomLevel) ? 'average' : 'difficult';
        
        needs.push({
          topic: topicData.topic,
          bloom_level: bloomLevel,
          difficulty,
          count
        });
      }
    });
  });
  
  return needs;
}

/**
 * Fetch questions for specific needs with intelligent selection (avoids redundancy)
 */
export async function fetchQuestionsForNeeds(needs: TestNeed[], approvedOnly: boolean = true): Promise<any[]> {
  const { IntelligentSelector } = await import('@/services/testAssembly/intelligentSelector');
  
  // Build distribution requirements
  const topicDistribution: Record<string, number> = {};
  const bloomDistribution: Record<string, number> = {};
  const difficultyDistribution: Record<string, number> = {};
  let totalQuestions = 0;

  needs.forEach(need => {
    topicDistribution[need.topic] = (topicDistribution[need.topic] || 0) + need.count;
    bloomDistribution[need.bloom_level] = (bloomDistribution[need.bloom_level] || 0) + need.count;
    difficultyDistribution[need.difficulty] = (difficultyDistribution[need.difficulty] || 0) + need.count;
    totalQuestions += need.count;
  });

  // Fetch candidate pool (fetch 2x needed for better selection)
  const candidatePool: any[] = [];
  for (const need of needs) {
    const candidates = await Questions.search({
      topic: need.topic,
      bloom_level: need.bloom_level,
      difficulty: need.difficulty,
      approved: approvedOnly
    });
    
    if (candidates) {
      candidatePool.push(...candidates);
    }
  }

  // Remove duplicates
  const uniqueCandidates = Array.from(
    new Map(candidatePool.map(q => [q.id, q])).values()
  );

  console.log(`Candidate pool: ${uniqueCandidates.length} questions for ${totalQuestions} needed`);

  // Use intelligent selector to avoid redundancy and balance usage
  const selector = new IntelligentSelector({
    topicDistribution,
    bloomDistribution,
    difficultyDistribution,
    totalQuestions,
    similarityThreshold: 0.85, // 85% similarity = duplicate
    recentUseWindowDays: 365, // 1 year recency window
    diversityWeight: 0.7,
    qualityThreshold: 0.5
  });

  const selectionReport = await selector.selectQuestions(uniqueCandidates);
  
  console.log('Selection metrics:', selectionReport.metrics);
  console.log(`Selected: ${selectionReport.selected.length}, Rejected: ${selectionReport.rejected.length}`);

  // If still shortage, generate AI questions
  const shortage = totalQuestions - selectionReport.selected.length;
  if (shortage > 0) {
    console.warn(`Shortage of ${shortage} questions. Generating with AI...`);
    
    const generatedQuestions: any[] = [];
    for (const need of needs) {
      const currentCount = selectionReport.selected.filter(
        q => q.topic === need.topic && 
             q.bloom_level === need.bloom_level && 
             q.difficulty === need.difficulty
      ).length;
      
      const needMore = need.count - currentCount;
      if (needMore > 0) {
        const aiQuestions = generateAIQuestionsForNeed(
          need.topic,
          need.bloom_level,
          need.difficulty,
          needMore
        );
        generatedQuestions.push(...aiQuestions);
      }
    }

    if (generatedQuestions.length > 0) {
      const inserted = await Questions.insertMany(generatedQuestions);
      selectionReport.selected.push(...inserted);
      await ActivityLog.log('generate_questions', 'bulk');
    }
  }

  return selectionReport.selected;
}

/**
 * Shuffle array using Fisher-Yates algorithm
 */
export function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Shuffle MCQ choices and update correct answer
 */
export function shuffleChoices(question: any): { question: any; mapping: Record<string, string> } {
  return { question: shuffleExamChoices([question]).items[0], mapping: {} };
}

/**
 * Generate multiple test versions with shuffling
 */
export async function generateTestVersions(
  config: TestConfiguration,
  questions: any[]
): Promise<TestVersion[]> {
  const versions = [];
  const versionLabels = ['A', 'B', 'C', 'D', 'E'];

  for (let i = 0; i < config.number_of_versions; i++) {
    let versionQuestions = [...questions];

    // Shuffle questions if enabled
    if (config.shuffle_questions) {
      versionQuestions = shuffleArray(versionQuestions);
    }

    // Shuffle answer choices if enabled
    if (config.shuffle_choices) {
      versionQuestions = shuffleExamChoices(versionQuestions).items;
    }

    // Create answer key
    const answerKey: Record<string, string> = {};
    versionQuestions.forEach((question, index) => {
      const questionNumber = (index + 1).toString();
      if (question.correct_answer) {
        answerKey[questionNumber] = question.correct_answer;
      }
    });

    versions.push({
      version_label: versionLabels[i],
      questions: versionQuestions,
      answer_key: answerKey,
      total_points: questions.length * config.points_per_question
    });
  }

  return versions;
}

/**
 * Save test with multiple versions to database and mark questions as used
 */
export async function saveTestWithVersions(
  config: TestConfiguration,
  versions: TestVersion[]
): Promise<TestGenerationResult> {
  // Import GeneratedTests service dynamically to avoid circular dependencies
  const { GeneratedTests } = await import('@/services/db/generatedTests');
  const { markQuestionsAsUsed } = await import('@/services/testAssembly/intelligentSelector');
  
  // Create separate database entries for each version
  const versionConfigs = versions.map((version, index) => ({
    title: config.title,
    subject: config.subject,
    course: config.course,
    year_section: config.year_section,
    exam_period: config.exam_period,
    school_year: config.school_year,
    instructions: config.instructions,
    tos_id: config.tos_id,
    time_limit: config.time_limit,
    points_per_question: config.points_per_question,
    items: version.questions,
    answer_key: version.answer_key,
    shuffle_questions: config.shuffle_questions,
    shuffle_choices: config.shuffle_choices,
    version_label: version.version_label,
    version_number: index + 1
  }));

  // Save all versions to database
  const savedVersions = await GeneratedTests.createMultipleVersions(versionConfigs);

  await ActivityLog.log('generate_test', 'generated_tests');

  // Mark all questions as used across all versions
  const allQuestionIds = new Set<string>();
  versions.forEach(version => {
    version.questions.forEach(q => {
      if (q.id) allQuestionIds.add(q.id);
    });
  });

  if (savedVersions[0]?.id && allQuestionIds.size > 0) {
    await markQuestionsAsUsed(Array.from(allQuestionIds), savedVersions[0].id);
  }

  const generatedQuestions = versions[0]?.questions.filter(q => q.created_by === 'ai').length || 0;
  
  return {
    testId: savedVersions[0]?.id || '',
    versions,
    generatedQuestions,
    warnings: generatedQuestions > 0 ? [`Generated ${generatedQuestions} AI questions due to insufficient question bank`] : []
  };
}

/**
 * Validate test configuration
 */
export function validateTestConfig(config: TestConfiguration, questions: any[]): string[] {
  const errors: string[] = [];

  if (!config.title.trim()) {
    errors.push('Test title is required');
  }

  if (!config.subject.trim()) {
    errors.push('Subject is required');
  }

  if (questions.length === 0) {
    errors.push('At least one question must be selected');
  }

  if (config.number_of_versions < 1 || config.number_of_versions > 5) {
    errors.push('Number of versions must be between 1 and 5');
  }

  if (config.points_per_question < 1) {
    errors.push('Points per question must be at least 1');
  }

  if (config.time_limit && config.time_limit < 10) {
    errors.push('Time limit must be at least 10 minutes');
  }

  return errors;
}

/**
 * Check if questions maintain balance across versions
 */
export function validateVersionBalance(
  questions: any[],
  config: TestConfiguration
): { isBalanced: boolean; warnings: string[] } {
  const warnings: string[] = [];
  
  // Check topic distribution
  const topicCounts = questions.reduce((acc, q) => {
    acc[q.topic] = (acc[q.topic] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Check difficulty distribution
  const difficultyCounts = questions.reduce((acc, q) => {
    acc[q.difficulty] = (acc[q.difficulty] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Check Bloom's level distribution
  const bloomCounts = questions.reduce((acc, q) => {
    acc[q.bloom_level] = (acc[q.bloom_level] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Warn if any category has very few questions
  Object.entries(topicCounts).forEach(([topic, count]) => {
    if (Number(count) < 2 && config.number_of_versions > 1) {
      warnings.push(`Topic "${topic}" has only ${count} question(s). Consider adding more for better balance.`);
    }
  });

  // Check for missing difficulty levels
  const expectedDifficulties = ['easy', 'average', 'difficult'];
  expectedDifficulties.forEach(difficulty => {
    if (!difficultyCounts[difficulty]) {
      warnings.push(`No ${difficulty} questions found. Consider adding some for better balance.`);
    }
  });

  // Check for missing Bloom's levels
  const expectedBloomLevels = ['remembering', 'understanding', 'applying', 'analyzing', 'evaluating', 'creating'];
  const missingBloomLevels = expectedBloomLevels.filter(level => !bloomCounts[level]);
  if (missingBloomLevels.length > 0) {
    warnings.push(`Missing Bloom's levels: ${missingBloomLevels.join(', ')}`);
  }

  const totalQuestions = questions.length;
  if (totalQuestions < config.number_of_versions * 5) {
    warnings.push(`With ${totalQuestions} questions and ${config.number_of_versions} versions, each version will have limited variety.`);
  }

  return {
    isBalanced: warnings.length === 0,
    warnings
  };
}

/**
 * Generate test from TOS matrix
 */
export async function generateTestFromTOS(
  tosMatrix: any,
  config: TestConfiguration
): Promise<TestGenerationResult> {
  // Build needs from TOS
  const needs = buildEnhancedNeedsFromTOS(tosMatrix);
  
  const testQuestions = await fetchQuestionsForNeeds(needs, true);
  
  // Validate configuration
  const configErrors = validateTestConfig(config, testQuestions);
  if (configErrors.length > 0) {
    throw new Error(`Configuration errors: ${configErrors.join(', ')}`);
  }
  
  // Generate versions
  const versions = await generateTestVersions(config, testQuestions);
  
  // Save to database
  const saveResult = await saveTestWithVersions(config, versions);
  
  return {
    testId: saveResult.testId,
    versions: saveResult.versions,
    generatedQuestions: testQuestions.length,
    warnings: []
  };
}

/**
 * Analyze question bank sufficiency for TOS
 */
export async function analyzeTOSSufficiency(tosMatrix: any): Promise<{
  sufficient: boolean;
  analysis: Record<string, any>;
  recommendations: string[];
}> {
  const needs = buildEnhancedNeedsFromTOS(tosMatrix);
  const analysis: Record<string, any> = {};
  const recommendations: string[] = [];
  let totalShortage = 0;
  
  for (const need of needs) {
    const existingQuestions = await Questions.search({
      topic: need.topic,
      bloom_level: need.bloom_level,
      difficulty: need.difficulty,
      approved: true
    });
    
    const available = existingQuestions?.length || 0;
    const shortage = Math.max(0, need.count - available);
    totalShortage += shortage;
    
    analysis[`${need.topic}-${need.bloom_level}`] = {
      needed: need.count,
      available,
      shortage,
      sufficient: shortage === 0
    };
    
    if (shortage > 0) {
      recommendations.push(
        `Add ${shortage} more ${need.difficulty} ${need.bloom_level} questions for "${need.topic}"`
      );
    }
  }
  
  return {
    sufficient: totalShortage === 0,
    analysis,
    recommendations
  };
}