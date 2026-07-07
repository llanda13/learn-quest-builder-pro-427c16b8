import seedrandom from 'seedrandom';
import { shuffleExamChoices } from '@/utils/shuffleExamChoices';

export interface Question {
  id: string;
  question_text: string;
  question_type: string;
  choices?: Record<string, string>;
  correct_answer?: string;
  topic: string;
  bloom_level: string;
  difficulty: string;
}

export interface TestVersion {
  label: string;
  version: number;
  questions: Question[];
  answer_key: Record<string, any>;
  total_points: number;
  version_label?: string;
}

export interface TestConfiguration {
  title: string;
  subject: string;
  course?: string;
  year_section?: string;
  exam_period?: string;
  school_year?: string;
  instructions: string;
  time_limit?: number;
  points_per_question?: number;
  total_questions: number;
  shuffle_questions: boolean;
  shuffle_choices: boolean;
  number_of_versions: number;
  tos_id?: string;
}

export interface TestGenerationResult {
  testId: string;
  versions: TestVersion[];
  generatedQuestions: number;
  warnings: string[];
}

/**
 * Shuffle array using Fisher-Yates algorithm
 */
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Shuffle questions within a test
 */
function shuffleQuestions(questions: Question[], seed?: string): Question[] {
  if (seed) {
    const rng = seedrandom(seed);
    const shuffled = [...questions];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }
  return shuffleArray(questions);
}

/**
 * Shuffle choices within multiple choice questions
 */
function shuffleChoices(question: Question, seed?: string): Question {
  return shuffleExamChoices([question]).items[0] as Question;
}

function shuffleWithSeed<T>(array: T[], seed: string): T[] {
  const rng = seedrandom(seed);
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Generate multiple versions of a test
 */
export function generateTestVersions(
  config: TestConfiguration,
  questions: Question[]
): TestVersion[] {
  const versions: TestVersion[] = [];
  
  for (let i = 0; i < config.number_of_versions; i++) {
    const versionSeed = `${config.title}-v${i + 1}`;
    
    // Shuffle questions if enabled
    let versionQuestions = config.shuffle_questions 
      ? shuffleQuestions(questions, versionSeed)
      : questions;
    
    // Shuffle choices if enabled
    if (config.shuffle_choices) {
      versionQuestions = shuffleExamChoices(versionQuestions).items as Question[];
    }
    
    // Generate answer key
    const answerKey: Record<string, any> = {};
    versionQuestions.forEach((q, index) => {
      answerKey[`${index + 1}`] = {
        question_id: q.id,
        correct_answer: q.correct_answer,
        points: config.points_per_question || 1
      };
    });
    
    const totalPoints = versionQuestions.length * (config.points_per_question || 1);
    
    versions.push({
      label: `Version ${i + 1}`,
      version: i + 1,
      version_label: `Version ${i + 1}`,
      questions: versionQuestions,
      answer_key: answerKey,
      total_points: totalPoints
    });
  }
  
  return versions;
}

/**
 * Calculate distribution statistics for versions
 */
export function analyzeVersionBalance(versions: TestVersion[]): {
  topicBalance: Record<string, number>;
  difficultyBalance: Record<string, number>;
  bloomBalance: Record<string, number>;
  warnings: string[];
} {
  const warnings: string[] = [];
  
  if (versions.length === 0) {
    warnings.push('No versions generated');
    return { topicBalance: {}, difficultyBalance: {}, bloomBalance: {}, warnings };
  }
  
  const firstVersion = versions[0];
  const topicCounts: Record<string, number> = {};
  const difficultyCounts: Record<string, number> = {};
  const bloomCounts: Record<string, number> = {};
  
  firstVersion.questions.forEach(q => {
    topicCounts[q.topic] = (topicCounts[q.topic] || 0) + 1;
    difficultyCounts[q.difficulty] = (difficultyCounts[q.difficulty] || 0) + 1;
    bloomCounts[q.bloom_level] = (bloomCounts[q.bloom_level] || 0) + 1;
  });
  
  // Check balance across versions
  for (let i = 1; i < versions.length; i++) {
    const version = versions[i];
    const vTopics: Record<string, number> = {};
    
    version.questions.forEach(q => {
      vTopics[q.topic] = (vTopics[q.topic] || 0) + 1;
    });
    
    // Compare with first version
    const topicKeys = new Set([...Object.keys(topicCounts), ...Object.keys(vTopics)]);
    for (const topic of topicKeys) {
      const count1 = topicCounts[topic] || 0;
      const count2 = vTopics[topic] || 0;
      if (Math.abs(count1 - count2) > 1) {
        warnings.push(`Topic "${topic}" distribution varies between versions`);
      }
    }
  }
  
  return {
    topicBalance: topicCounts,
    difficultyBalance: difficultyCounts,
    bloomBalance: bloomCounts,
    warnings
  };
}

/**
 * Export test version to formatted object
 */
export function exportTestVersion(version: TestVersion, metadata: any): any {
  return {
    ...metadata,
    version: version.label,
    questions: version.questions.map((q, index) => ({
      number: index + 1,
      question: q.question_text,
      type: q.question_type,
      choices: q.choices,
      topic: q.topic,
      bloom_level: q.bloom_level,
      difficulty: q.difficulty
    })),
    answer_key: version.answer_key,
    total_points: version.total_points
  };
}

/**
 * Export answer key for a test version
 */
export function exportAnswerKey(version: TestVersion, metadata: any): any {
  return {
    ...metadata,
    version: version.label,
    answer_key: Object.entries(version.answer_key).map(([num, answer]) => ({
      question: parseInt(num),
      correct_answer: (answer as any).correct_answer,
      points: (answer as any).points
    })),
    total_points: version.total_points,
    generated_at: new Date().toISOString()
  };
}

interface GenerationInput {
  tos_id: string;
  total_items: number;
  distributions: Array<{
    topic: string;
    counts: {
      remembering: number;
      understanding: number;
      applying: number;
      analyzing: number;
      evaluating: number;
      creating: number;
      difficulty: { easy: number; average: number; difficult: number };
    };
  }>;
  allow_unapproved?: boolean;
  prefer_existing?: boolean;
}

// Generate test configuration from TOS matrix
export function buildTestConfigFromTOS(tosMatrix: any): GenerationInput {
  const distributions = [];
  
  for (const [topic, bloomData] of Object.entries(tosMatrix.matrix)) {
    const counts = {
      remembering: Math.round(((bloomData as any).remembering?.count || 0)),
      understanding: Math.round(((bloomData as any).understanding?.count || 0)),
      applying: Math.round(((bloomData as any).applying?.count || 0)),
      analyzing: Math.round(((bloomData as any).analyzing?.count || 0)),
      evaluating: Math.round(((bloomData as any).evaluating?.count || 0)),
      creating: Math.round(((bloomData as any).creating?.count || 0)),
      difficulty: {
        easy: Math.round(((bloomData as any).remembering?.count || 0) + ((bloomData as any).understanding?.count || 0)),
        average: Math.round(((bloomData as any).applying?.count || 0) + ((bloomData as any).analyzing?.count || 0)),
        difficult: Math.round(((bloomData as any).evaluating?.count || 0) + ((bloomData as any).creating?.count || 0))
      }
    };
    
    distributions.push({ topic, counts });
  }
  
  return {
    tos_id: tosMatrix.id || 'generated',
    total_items: tosMatrix.total_items || 0,
    distributions,
    prefer_existing: true
  };
}
