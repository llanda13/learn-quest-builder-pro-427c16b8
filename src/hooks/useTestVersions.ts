import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { shuffleExamChoices } from '@/utils/shuffleExamChoices';

interface Question {
  id: string;
  question_text: string;
  question_type: string;
  topic: string;
  bloom_level: string;
  difficulty: string;
  choices?: Record<string, string>;
  correct_answer?: string;
  created_by: string;
}

interface TestVersion {
  id?: string;
  version_label: string;
  questions: Question[];
  answer_key: Record<string, string>;
  total_points: number;
}

interface TestMetadata {
  id?: string;
  title: string;
  subject: string;
  course?: string;
  year_section?: string;
  exam_period?: string;
  school_year?: string;
  instructions: string;
  time_limit?: number;
  points_per_question: number;
  total_questions: number;
  shuffle_questions: boolean;
  shuffle_choices: boolean;
  number_of_versions: number;
}

export const useTestVersions = () => {
  const [testMetadata, setTestMetadata] = useState<TestMetadata[]>([]);
  const [loading, setLoading] = useState(false);

  // Utility function to shuffle array using Fisher-Yates algorithm
  const shuffleArray = <T,>(array: T[]): T[] => {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  };

  // Shuffle answer choices and update correct answer
  const shuffleQuestionChoices = (question: Question): Question => {
    return shuffleExamChoices([question]).items[0] as Question;
  };

  // Generate multiple test versions
  const generateTestVersions = async (
    metadata: TestMetadata,
    selectedQuestions: Question[]
  ): Promise<TestVersion[]> => {
    if (selectedQuestions.length === 0) {
      throw new Error('No questions selected for test generation');
    }

    const versions: TestVersion[] = [];
    const versionLabels = ['A', 'B', 'C', 'D', 'E'];

    for (let i = 0; i < metadata.number_of_versions; i++) {
      let versionQuestions = [...selectedQuestions];

      // If the selectedQuestions contain explicit `question_number` values (Generation Plan),
      // DO NOT shuffle the question order — the TOS is the single source of truth.
      const hasExplicitNumbers = versionQuestions.some(q => Number.isInteger((q as any).question_number));
      if (metadata.shuffle_questions && !hasExplicitNumbers) {
        versionQuestions = shuffleArray(versionQuestions);
      }

      // If explicit question numbers are present, ensure questions are ordered by that number
      if (hasExplicitNumbers) {
        versionQuestions.sort((a, b) => (Number((a as any).question_number) || 0) - (Number((b as any).question_number) || 0));
      }

      // Shuffle answer choices if enabled
      if (metadata.shuffle_choices) {
        versionQuestions = shuffleExamChoices(versionQuestions).items as Question[];
      }

      // Create answer key for this version
      const answerKey: Record<string, string> = {};
      versionQuestions.forEach((question, index) => {
        const questionNumber = hasExplicitNumbers ? String((question as any).question_number || index + 1) : String(index + 1);
        if (question.correct_answer) {
          answerKey[questionNumber] = question.correct_answer;
        }
      });

      versions.push({
        version_label: versionLabels[i],
        questions: versionQuestions,
        answer_key: answerKey,
        total_points: selectedQuestions.length * metadata.points_per_question
      });
    }

    return versions;
  };

  // Save test metadata and versions to database
  const saveTestVersions = async (
    metadata: TestMetadata,
    versions: TestVersion[]
  ): Promise<string> => {
    try {
      // Save test metadata
      const { data: testMetadataRecord, error: metadataError } = await (supabase as any)
        .from('test_metadata')
        .insert([{
          title: metadata.title,
          subject: metadata.subject,
          course: metadata.course,
          year_section: metadata.year_section,
          exam_period: metadata.exam_period,
          school_year: metadata.school_year,
          instructions: metadata.instructions,
          time_limit: metadata.time_limit,
          points_per_question: metadata.points_per_question,
          total_questions: metadata.total_questions,
          shuffle_questions: metadata.shuffle_questions,
          shuffle_choices: metadata.shuffle_choices,
          number_of_versions: metadata.number_of_versions,
          created_by: 'teacher'
        }])
        .select()
        .single();

      if (metadataError) throw metadataError;

      // Save each version
      for (const version of versions) {
        const { data: versionRecord, error: versionError } = await (supabase as any)
          .from('test_versions')
          .insert([{
            test_metadata_id: testMetadataRecord.id,
            version_label: version.version_label,
            question_order: version.questions.map(q => q.id),
            answer_key: version.answer_key,
            total_points: version.total_points
          }])
          .select()
          .single();

        if (versionError) throw versionError;

        // Save individual test questions for this version
        const testQuestions = version.questions.map((question, index) => ({
          test_version_id: versionRecord.id,
          question_id: question.id,
          question_number: (question as any).question_number || index + 1,
          shuffled_choices: question.choices || null,
          correct_answer_key: question.correct_answer || null,
          points: metadata.points_per_question
        }));

        const { error: questionsError } = await (supabase as any)
          .from('test_questions')
          .insert(testQuestions);

        if (questionsError) throw questionsError;
      }

      return testMetadataRecord.id;
    } catch (error) {
      console.error('Error saving test versions:', error);
      throw error;
    }
  };

  // Load saved test metadata
  const loadTestMetadata = async () => {
    setLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from('test_metadata')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTestMetadata(data || []);
    } catch (error) {
      console.error('Error loading test metadata:', error);
      toast.error('Failed to load test history');
    } finally {
      setLoading(false);
    }
  };

  // Load specific test versions
  const loadTestVersions = async (testMetadataId: string): Promise<TestVersion[]> => {
    try {
      const { data: versions, error: versionsError } = await (supabase as any)
        .from('test_versions')
        .select(`
          *,
          test_questions (
            *,
            questions (*)
          )
        `)
        .eq('test_metadata_id', testMetadataId)
        .order('version_label');

      if (versionsError) throw versionsError;

      return (versions || []).map((version: any) => ({
        id: version.id,
        version_label: version.version_label,
        questions: version.test_questions
          .sort((a: any, b: any) => a.question_number - b.question_number)
          .map((tq: any) => ({
            ...tq.questions,
            choices: tq.shuffled_choices || tq.questions.choices,
            correct_answer: tq.correct_answer_key || tq.questions.correct_answer
          })),
        answer_key: version.answer_key,
        total_points: version.total_points
      }));
    } catch (error) {
      console.error('Error loading test versions:', error);
      throw error;
    }
  };

  // Delete test and all its versions
  const deleteTest = async (testMetadataId: string) => {
    try {
      const { error } = await (supabase as any)
        .from('test_metadata')
        .delete()
        .eq('id', testMetadataId);

      if (error) throw error;
      
      await loadTestMetadata(); // Refresh list
      toast.success('Test deleted successfully');
    } catch (error) {
      console.error('Error deleting test:', error);
      toast.error('Failed to delete test');
    }
  };

  // Validate test configuration
  const validateTestConfig = (metadata: TestMetadata, selectedQuestions: Question[]): string[] => {
    const errors: string[] = [];

    if (!metadata.title.trim()) {
      errors.push('Test title is required');
    }

    if (!metadata.subject.trim()) {
      errors.push('Subject is required');
    }

    if (selectedQuestions.length === 0) {
      errors.push('At least one question must be selected');
    }

    if (metadata.number_of_versions < 1 || metadata.number_of_versions > 5) {
      errors.push('Number of versions must be between 1 and 5');
    }

    if (metadata.points_per_question < 1) {
      errors.push('Points per question must be at least 1');
    }

    return errors;
  };

  // Check if questions maintain balance across versions
  const validateVersionBalance = (
    selectedQuestions: Question[],
    metadata: TestMetadata
  ): { isBalanced: boolean; warnings: string[] } => {
    const warnings: string[] = [];
    
    // Check topic distribution
    const topicCounts = selectedQuestions.reduce((acc, q) => {
      acc[q.topic] = (acc[q.topic] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Check difficulty distribution
    const difficultyCounts = selectedQuestions.reduce((acc, q) => {
      acc[q.difficulty] = (acc[q.difficulty] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Check Bloom's level distribution
    const bloomCounts = selectedQuestions.reduce((acc, q) => {
      acc[q.bloom_level] = (acc[q.bloom_level] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Warn if any category has very few questions
    Object.entries(topicCounts).forEach(([topic, count]) => {
      if (count < 2 && metadata.number_of_versions > 1) {
        warnings.push(`Topic "${topic}" has only ${count} question(s). Consider adding more for better balance.`);
      }
    });

    const totalQuestions = selectedQuestions.length;
    if (totalQuestions < metadata.number_of_versions * 5) {
      warnings.push(`With ${totalQuestions} questions and ${metadata.number_of_versions} versions, each version will have limited variety.`);
    }

    return {
      isBalanced: warnings.length === 0,
      warnings
    };
  };

  useEffect(() => {
    loadTestMetadata();
  }, []);

  return {
    testMetadata,
    loading,
    generateTestVersions,
    saveTestVersions,
    loadTestVersions,
    deleteTest,
    validateTestConfig,
    validateVersionBalance,
    shuffleArray,
    shuffleQuestionChoices
  };
};