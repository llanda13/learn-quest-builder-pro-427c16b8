import { supabase } from "@/integrations/supabase/client";
import seedrandom from 'seedrandom';
import { shuffleExamChoices } from "@/utils/shuffleExamChoices";

export interface Question {
  id: string;
  question_text: string;
  question_type: string;
  topic: string;
  bloom_level: string;
  difficulty: string;
  choices?: Record<string, string>;
  correct_answer?: string;
  metadata?: any;
}

export interface TestVersion {
  version_number: number;
  version_label: string;
  questions: Question[];
  answer_key: Record<string, any>;
  question_order: string[];
  shuffle_seed: string;
}

export interface GenerationConfig {
  numberOfVersions: number;
  shuffleQuestions: boolean;
  shuffleChoices: boolean;
  ensureBalance: boolean;
  parentTestId?: string;
  tosId?: string;
  instructions?: string;
}

/**
 * Shuffle array using Fisher-Yates with optional seed for reproducibility
 */
function shuffleArray<T>(array: T[], seed?: string): T[] {
  const shuffled = [...array];
  const rng = seed ? seedrandom(seed) : Math.random;
  
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Shuffle choices within a multiple choice question
 */
function shuffleChoices(question: Question, seed: string): Question {
  return shuffleExamChoices([question]).items[0] as Question;
}

/**
 * Validate that versions maintain topic and difficulty balance
 */
function validateBalance(versions: TestVersion[], questions: Question[]): {
  isBalanced: boolean;
  warnings: string[];
} {
  const warnings: string[] = [];
  
  // Calculate original distribution
  const originalTopics = questions.reduce((acc, q) => {
    acc[q.topic] = (acc[q.topic] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const originalDifficulty = questions.reduce((acc, q) => {
    acc[q.difficulty] = (acc[q.difficulty] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const originalBloom = questions.reduce((acc, q) => {
    acc[q.bloom_level] = (acc[q.bloom_level] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Check each version
  versions.forEach((version, idx) => {
    const versionTopics = version.questions.reduce((acc, q) => {
      acc[q.topic] = (acc[q.topic] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Compare distributions
    Object.keys(originalTopics).forEach(topic => {
      if (originalTopics[topic] !== versionTopics[topic]) {
        warnings.push(`Version ${idx + 1}: Topic "${topic}" count mismatch`);
      }
    });
  });

  return {
    isBalanced: warnings.length === 0,
    warnings
  };
}

/**
 * Generate multiple test versions from a set of questions
 */
export async function generateMultipleVersions(
  questions: Question[],
  config: GenerationConfig
): Promise<TestVersion[]> {
  const versions: TestVersion[] = [];
  const versionLabels = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

  for (let i = 0; i < config.numberOfVersions; i++) {
    const versionSeed = `${config.parentTestId || 'test'}-v${i + 1}-${Date.now()}`;
    
    // Shuffle questions if enabled
    let versionQuestions = config.shuffleQuestions 
      ? shuffleArray(questions, versionSeed)
      : [...questions];

    // Shuffle choices if enabled
    if (config.shuffleChoices) {
      versionQuestions = shuffleExamChoices(versionQuestions).items as Question[];
    }

    // Generate answer key
    const answerKey: Record<string, any> = {};
    versionQuestions.forEach((q, index) => {
      answerKey[`${index + 1}`] = {
        question_id: q.id,
        correct_answer: q.correct_answer,
        question_text: q.question_text,
        topic: q.topic,
        bloom_level: q.bloom_level,
        difficulty: q.difficulty
      };
    });

    versions.push({
      version_number: i + 1,
      version_label: versionLabels[i] || `Version ${i + 1}`,
      questions: versionQuestions,
      answer_key: answerKey,
      question_order: versionQuestions.map(q => q.id),
      shuffle_seed: versionSeed
    });
  }

  // Validate balance if required
  if (config.ensureBalance) {
    const { isBalanced, warnings } = validateBalance(versions, questions);
    if (!isBalanced) {
      console.warn('Version balance warnings:', warnings);
    }
  }

  return versions;
}

/**
 * Save multiple test versions to database
 */
export async function saveTestVersions(
  versions: TestVersion[],
  config: GenerationConfig
): Promise<{ success: boolean; parentId?: string; versionIds: string[]; error?: string }> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    // Create parent test if needed
    let parentTestId = config.parentTestId;
    
    if (!parentTestId) {
      const { data: parentTest, error: parentError } = await supabase
        .from('generated_tests')
        .insert({
          version_label: 'Parent',
          items: versions[0].questions as any,
          answer_key: versions[0].answer_key as any,
          instructions: config.instructions || '',
          question_order: versions[0].question_order as any,
          watermark_data: {
            created_by: user.email,
            created_at: new Date().toISOString()
          } as any
        })
        .select()
        .single();

      if (parentError) throw parentError;
      parentTestId = parentTest.id;
    }

    // Create all versions
    const versionData = versions.map(version => ({
      parent_test_id: parentTestId,
      version_number: version.version_number,
      version_label: version.version_label,
      items: version.questions as any,
      answer_key: version.answer_key as any,
      instructions: config.instructions || '',
      question_order: version.question_order as any,
      shuffle_seed: version.shuffle_seed,
      watermark_data: {
        version: version.version_label,
        created_by: user.email,
        created_at: new Date().toISOString()
      } as any
    }));

    const { data: createdVersions, error: versionsError } = await supabase
      .from('generated_tests')
      .insert(versionData)
      .select();

    if (versionsError) throw versionsError;

    return {
      success: true,
      parentId: parentTestId,
      versionIds: createdVersions?.map(v => v.id) || []
    };
  } catch (error) {
    console.error('Error saving test versions:', error);
    return {
      success: false,
      versionIds: [],
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Fetch questions from TOS for version generation
 */
export async function fetchQuestionsFromTOS(tosId: string): Promise<Question[]> {
  const { data, error } = await supabase
    .from('questions')
    .select('*')
    .eq('tos_id', tosId)
    .eq('deleted', false);

  if (error) throw error;
  return (data || []).map(q => ({
    ...q,
    choices: q.choices as Record<string, string> | undefined
  })) as Question[];
}

/**
 * Fetch questions by IDs for version generation
 */
export async function fetchQuestionsByIds(questionIds: string[]): Promise<Question[]> {
  const { data, error } = await supabase
    .from('questions')
    .select('*')
    .in('id', questionIds)
    .eq('deleted', false);

  if (error) throw error;
  return (data || []).map(q => ({
    ...q,
    choices: q.choices as Record<string, string> | undefined
  })) as Question[];
}
