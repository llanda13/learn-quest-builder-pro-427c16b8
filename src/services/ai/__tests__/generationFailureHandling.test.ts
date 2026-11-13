import { beforeEach, describe, expect, it, vi } from 'vitest';

const { invoke, from, insertedRows, questionInsertResult } = vi.hoisted(() => ({
  invoke: vi.fn(),
  from: vi.fn(),
  insertedRows: { value: null as any },
  questionInsertResult: { value: null as any }
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: { invoke },
    from
  }
}));

vi.mock('../subjectMetadataResolver', () => ({
  resolveGeneratedQuestionSubject: vi.fn(async () => ({
    academic_subject_id: 'subject-101',
    category: 'Major',
    specialization: 'IT',
    subject_code: 'ITPC 101',
    subject_description: 'Computer System Servicing'
  }))
}));

import {
  formatQuestionnaireGenerationError,
  generateQuestionsWithAI,
  QuestionGenerationError,
  type TOSCriteria
} from '../testGenerationService';

const criteria: TOSCriteria = {
  topic: 'Database normalization',
  bloom_level: 'Understanding',
  difficulty: 'average',
  count: 1,
  question_type: 'essay'
};

const validQuestion = {
  question_text: 'Explain how normalization reduces update anomalies in a relational database.',
  question_type: 'essay',
  correct_answer: 'It separates facts into related tables to reduce redundant updates.',
  topic: criteria.topic,
  bloom_level: criteria.bloom_level,
  difficulty: criteria.difficulty,
  metadata: { generated_by: 'intent_driven_pipeline' }
};

describe('generateQuestionsWithAI failure handling', () => {
  beforeEach(() => {
    invoke.mockReset();
    from.mockReset();
    insertedRows.value = null;
    questionInsertResult.value = null;
    from.mockImplementation((table: string) => {
      if (table === 'questions') {
        return {
          insert: (rows: any[]) => {
            insertedRows.value = rows;
            return {
              select: async () => questionInsertResult.value ?? {
                data: rows.map((row, index) => ({ ...row, id: `saved-${index + 1}` })),
                error: null
              }
            };
          }
        };
      }
      return {
        insert: async () => ({ error: null })
      };
    });
  });

  it('passes the requested question type and accepts a valid AI response', async () => {
    invoke.mockResolvedValue({ data: { success: true, questions: [validQuestion] }, error: null });

    const result = await generateQuestionsWithAI(criteria, 1, 'user-1', { slotNumber: 14, tosId: 'tos-101' });

    expect(invoke).toHaveBeenCalledWith('generate-questions-from-tos', {
      body: expect.objectContaining({ requested_question_type: 'essay', target_item_number: 14 })
    });
    expect(result).toEqual([validQuestion]);
  });

  it('preserves a useful Edge Function/provider error without falling back', async () => {
    invoke.mockResolvedValue({ data: null, error: { message: 'AI provider returned HTTP 429: quota exceeded' } });

    await expect(generateQuestionsWithAI(criteria, 1, 'user-1')).rejects.toMatchObject({
      name: 'QuestionGenerationError',
      category: 'provider_failure',
      message: expect.stringContaining('HTTP 429')
    });
  });

  it('classifies timeout errors and redacts bearer credentials', async () => {
    invoke.mockResolvedValue({ data: null, error: { message: 'Request timeout Bearer secret-token-value' } });

    await expect(generateQuestionsWithAI(criteria, 1, 'user-1')).rejects.toMatchObject({
      category: 'timeout',
      message: expect.not.stringContaining('secret-token-value')
    });
  });

  it('rejects missing and malformed responses', async () => {
    invoke.mockResolvedValueOnce({ data: null, error: null });
    await expect(generateQuestionsWithAI(criteria, 1, 'user-1')).rejects.toMatchObject({
      category: 'malformed_response'
    });

    invoke.mockResolvedValueOnce({ data: { questions: [validQuestion] }, error: null });
    await expect(generateQuestionsWithAI(criteria, 1, 'user-1')).rejects.toMatchObject({
      category: 'malformed_response'
    });
  });

  it('rejects deterministic fallback payloads rather than accepting them as AI', async () => {
    invoke.mockResolvedValue({
      data: {
        success: true,
        questions: [{ ...validQuestion, metadata: { generated_by: 'deterministic_fallback' } }]
      },
      error: null
    });

    const error = await generateQuestionsWithAI(criteria, 1, 'user-1').catch((caught) => caught);
    expect(error).toBeInstanceOf(QuestionGenerationError);
    expect(error.category).toBe('provider_failure');
    expect(error.message).toContain('deterministic fallback');
  });

  it('reports exact missing item numbers when the provider returns too few questions', async () => {
    invoke.mockResolvedValue({ data: { success: true, questions: [] }, error: null });

    await expect(generateQuestionsWithAI(criteria, 1, 'user-1', { slotNumber: 23 })).rejects.toMatchObject({
      category: 'unfilled_slots',
      unfilledItemNumbers: [23],
      message: expect.stringContaining('Unfilled items: 23')
    });
  });

  it('accepts a needs-review question with no hard validation reasons and saves it as pending', async () => {
    invoke.mockResolvedValue({
      data: {
        success: true,
        questions: [{
          ...validQuestion,
          created_by: 'ai',
          item_number: 14,
          needs_review: true,
          validation_status: 'needs_review',
          validation_reasons: []
        }]
      },
      error: null
    });

    const result = await generateQuestionsWithAI(criteria, 1, 'user-1', { slotNumber: 14, tosId: 'tos-101' });

    expect(result).toHaveLength(1);
    expect(insertedRows.value).toHaveLength(1);
    expect(insertedRows.value[0]).toMatchObject({
      approved: false,
      needs_review: true,
      validation_status: 'needs_review'
    });
    expect(insertedRows.value[0]).toMatchObject({
      subject_code: 'ITPC 101',
      subject_description: 'Computer System Servicing',
      metadata: { academic_subject_id: 'subject-101', tos_id: 'tos-101' }
    });
  });

  it('saves needs-review questions as unapproved with TOS and validation metadata, then rejects their use', async () => {
    invoke.mockResolvedValue({
      data: {
        success: true,
        questions: [{
          ...validQuestion,
          created_by: 'ai',
          item_number: 14,
          needs_review: true,
          validation_status: 'needs_review',
          validation_reasons: ['quality:mcq_missing_options', 'bloom:mismatch'],
          bloom_detected: 'remembering'
        }]
      },
      error: null
    });

    await expect(generateQuestionsWithAI(
      { ...criteria, topic: 'Database normalization', question_type: 'essay' },
      1,
      'user-1',
      { slotNumber: 14, tosId: 'tos-101' }
    )).rejects.toMatchObject({
      name: 'QuestionGenerationError',
      category: 'validation_failure',
      message: expect.stringContaining('bloom:mismatch')
    });

    expect(insertedRows.value).toHaveLength(1);
    expect(insertedRows.value[0]).toMatchObject({
      approved: false,
      needs_review: true,
      validation_status: 'needs_review',
      topic: 'Database normalization',
      bloom_level: 'Understanding',
      difficulty: 'average',
      question_type: 'essay',
      metadata: {
        item_number: 14,
        edge_validation_status: 'needs_review',
        validation_reasons: ['quality:mcq_missing_options', 'bloom:mismatch'],
        bloom_assigned: 'Understanding',
        bloom_detected: 'remembering'
      }
    });
  });

  it('reports question-bank database insert failures instead of returning unsaved questions', async () => {
    questionInsertResult.value = {
      data: null,
      error: { message: 'permission denied' }
    };
    invoke.mockResolvedValue({
      data: { success: true, questions: [{ ...validQuestion, created_by: 'ai' }] },
      error: null
    });

    await expect(generateQuestionsWithAI(criteria, 1, 'user-1', { slotNumber: 14, tosId: 'tos-101' })).rejects.toMatchObject({
      name: 'QuestionGenerationError',
      category: 'database_failure',
      message: expect.stringContaining('permission denied')
    });
  });

  it('formats generation and save failures with preserved TOS and no-test context', () => {
    const message = formatQuestionnaireGenerationError(new Error('Failed to save test: permission denied'));

    expect(message).toContain('Failed to save test: permission denied');
    expect(message).toContain('Your TOS data has been preserved');
    expect(message).toContain('No test questionnaire was saved');
  });
});
