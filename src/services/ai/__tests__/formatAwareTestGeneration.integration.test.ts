import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const state: {
    bankQuestions: Record<string, unknown>[];
    seedBankQuestions: Record<string, unknown>[];
    tosRecord: Record<string, any> | null;
    examPayload: Record<string, unknown> | null;
    savedExam: Record<string, any> | null;
    examUpdates: Record<string, unknown>[];
    generatedQuestionWrites: Record<string, unknown>[];
    edgeCalls: Array<{ name: string; body: Record<string, any> }>;
    slotCallCounts: Record<number, number>;
    questionInsertError: string | null;
  } = {
    bankQuestions: [],
    seedBankQuestions: [],
    tosRecord: null,
    examPayload: null,
    savedExam: null,
    examUpdates: [],
    generatedQuestionWrites: [],
    edgeCalls: [],
    slotCallCounts: {},
    questionInsertError: null
  };

  const from = vi.fn((table: string) => {
    let action = 'select';
    let payload: any;
    let ordered = false;
    let ranged = false;
    let update = false;

    const resolve = () => {
      if (table === 'questions') {
        if (action === 'insert') {
          if (state.questionInsertError) {
            return { data: null, error: new Error(state.questionInsertError) };
          }
          const row = {
            ...payload,
            id: `bank-question-${state.generatedQuestionWrites.length + 1}`
          };
          state.generatedQuestionWrites.push(row);
          state.bankQuestions.push(row);
          return { data: row, error: null };
        }
        return {
          data: ranged ? state.seedBankQuestions : ordered ? [] : state.bankQuestions,
          error: null
        };
      }

      if (table === 'generated_tests' && action === 'insert') {
        state.examPayload = payload;
        state.savedExam = { ...payload, id: 'generated-test-1' };
        return { data: state.savedExam, error: null };
      }

      if (table === 'generated_tests' && update) {
        state.examUpdates.push(payload);
        state.savedExam = { ...state.savedExam, ...payload };
        return { data: { id: state.savedExam.id }, error: null };
      }

      if (table === 'generated_tests') {
        return { data: state.savedExam, error: null };
      }

      if (table === 'tos_entries') {
        return { data: state.tosRecord, error: state.tosRecord ? null : new Error('TOS fixture missing') };
      }

      return { data: null, error: null };
    };

    const builder: any = {
      select: () => builder,
      eq: () => builder,
      in: () => builder,
      range: () => {
        ranged = true;
        return builder;
      },
      order: () => {
        ordered = true;
        return builder;
      },
      limit: () => builder,
      insert: (value: any) => {
        action = 'insert';
        payload = value;
        return builder;
      },
      update: (value: any) => {
        update = true;
        payload = value;
        return builder;
      },
      maybeSingle: async () => ({ data: null, error: null }),
      single: async () => resolve(),
      then: (onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) =>
        Promise.resolve(resolve()).then(onFulfilled, onRejected)
    };

    return builder;
  });

  const invoke = vi.fn();

  return { state, from, invoke };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'teacher-1' } } })) },
    functions: { invoke: mocks.invoke },
    from: mocks.from
  }
}));

vi.mock('@/services/db/tosLink', () => ({
  assertTosLink: vi.fn(async (tosId: string) => tosId)
}));

vi.mock('../subjectMetadataResolver', () => ({
  resolveSubjectMetadata: vi.fn(async (context: Record<string, string>) => ({
    academic_subject_id: 'subject-id-101',
    category: context.category || '',
    specialization: context.specialization || '',
    subject_code: context.subject_code || '',
    subject_description: context.subject_description || ''
  })),
  resolveGeneratedQuestionSubject: vi.fn(async () => ({
    academic_subject_id: 'subject-id-101',
    category: 'Major',
    specialization: 'IT',
    subject_code: 'ITPC 101',
    subject_description: 'Computer System Servicing'
  })),
}));

import { generateFormatAwareTest } from '../formatAwareTestGeneration';
import { repairFormatAwareTest } from '../formatAwareTestGeneration';
import { getQuestionDuplicateReason } from '../formatAwareTestGeneration';
import { FORMAT_1, FORMAT_2, FORMAT_4 } from '@/types/examFormats';
import { GeneratedTests } from '@/services/db/generatedTests';
import { buildExamRenderModel } from '@/print/useExamRenderModel';

function createTosCriteria(totalItems: number) {
  const bloomLevels = ['remembering', 'understanding', 'applying', 'analyzing', 'evaluating', 'creating'];
  return Array.from({ length: totalItems }, (_, index) => ({
    topic: 'Systems Analysis',
    bloom_level: bloomLevels[index % bloomLevels.length],
    knowledge_dimension: bloomLevels[index % bloomLevels.length] === 'remembering'
      ? 'Factual'
      : bloomLevels[index % bloomLevels.length] === 'applying'
        ? 'Procedural'
        : ['evaluating', 'creating'].includes(bloomLevels[index % bloomLevels.length])
          ? 'Metacognitive'
          : 'Conceptual',
    difficulty: ['remembering', 'understanding'].includes(bloomLevels[index % bloomLevels.length])
      ? 'easy'
      : ['applying', 'analyzing'].includes(bloomLevels[index % bloomLevels.length])
        ? 'average'
        : 'difficult',
    count: 1,
    item_numbers: [index + 1],
    question_type: index % bloomLevels.length >= 3 ? 'essay' : 'mcq'
  }));
}

function createTosRecord(totalItems: number) {
  const distribution: Record<string, Record<string, { count: number; items: number[] }>> = {};
  for (const criterion of createTosCriteria(totalItems)) {
    distribution[criterion.topic] ||= {};
    const bloom = criterion.bloom_level.toLowerCase();
    distribution[criterion.topic][bloom] ||= { count: 0, items: [] };
    distribution[criterion.topic][bloom].count += criterion.item_numbers!.length;
    distribution[criterion.topic][bloom].items.push(...criterion.item_numbers!);
  }
  return { total_items: totalItems, distribution };
}

describe('format-aware generation workflow integration', () => {
  beforeEach(() => {
    mocks.state.bankQuestions = [];
    mocks.state.seedBankQuestions = [];
    mocks.state.tosRecord = createTosRecord(50);
    mocks.state.examPayload = null;
    mocks.state.savedExam = null;
    mocks.state.examUpdates = [];
    mocks.state.generatedQuestionWrites = [];
    mocks.state.edgeCalls = [];
    mocks.state.slotCallCounts = {};
    mocks.state.questionInsertError = null;
    mocks.invoke.mockReset();
    mocks.invoke.mockImplementation(async (name, options) => {
      mocks.state.edgeCalls.push({ name, body: options.body });
      const number = options.body.regeneration_context?.question_number as number;
      const token = String.fromCharCode(97 + Math.floor((number - 1) / 26)) +
        String.fromCharCode(97 + ((number - 1) % 26));
      const attempt = (mocks.state.slotCallCounts[number] || 0) + 1;
      mocks.state.slotCallCounts[number] = attempt;
      const variation = attempt > 1 ? `retry${attempt}` : '';
      return {
        data: {
          questions: [{
            text: `Compare ${token}${variation}signal with ${token}${variation}metric; use ${token}${variation}process and ${token}${variation}operation to classify ${token}${variation}outcome.`,
            choices: {
              A: `${token}${variation}correct`,
              B: `${token}${variation}distractorone`,
              C: `${token}${variation}distractortwo`,
              D: `${token}${variation}distractorthree`
            },
            correct_answer: 'A',
            structure_validated: true
          }]
        },
        error: null
      };
    });
    mocks.from.mockClear();
  });

  it('generates, persists, and renders all 50 Format 1 items as MCQs with a matching key', async () => {
    const result = await generateFormatAwareTest({
      format: FORMAT_1,
      tosCriteria: createTosCriteria(50),
      testTitle: '50-item integration exam',
      testMetadata: {
        tos_id: 'tos-1',
        subject_no: 'ITPC 101',
        subject_code: 'ITPC 101',
        academic_subject_id: 'subject-id-101',
        description: 'Computer System Servicing',
        subject_description: 'Computer System Servicing',
        category: 'Major',
        specialization: 'IT'
      }
    });

    const savedItems = mocks.state.examPayload?.items as Array<Record<string, any>>;
    const savedAnswerKey = mocks.state.examPayload?.answer_key as Array<Record<string, any>>;

    expect(result.id).toBe('generated-test-1');
    expect(mocks.state.examPayload?.format_id).toBe(FORMAT_1.id);
    expect(savedItems).toHaveLength(50);
    expect(savedItems.map((item) => item.question_number)).toEqual(Array.from({ length: 50 }, (_, i) => i + 1));
    expect(savedItems.every((item) => item.question_type === 'mcq')).toBe(true);
    expect(savedItems.every((item) =>
      Object.keys(item.choices).sort().join(',') === 'A,B,C,D' &&
      /^[A-D]$/.test(item.correct_answer) &&
      item.choices[item.correct_answer]
    )).toBe(true);
    expect(savedItems.every((item) => item.section_id === 'A')).toBe(true);
    expect(savedItems.some((item) => ['essay', 'true_false', 'fill_blank'].includes(item.question_type))).toBe(false);
    expect(savedAnswerKey).toHaveLength(50);
    savedItems.forEach((item) => {
      const keyEntries = savedAnswerKey.filter((entry) => entry.question_number === item.question_number);
      expect(keyEntries).toHaveLength(1);
      expect(keyEntries[0]).toMatchObject({
        question_id: item.id,
        correct_answer: item.correct_answer
      });
    });
    expect(savedItems.map((item) => item.bloom_level)).toEqual(
      createTosCriteria(50).map((criterion) => criterion.bloom_level)
    );
    expect(savedItems.map((item) => item.knowledge_dimension)).toEqual(
      createTosCriteria(50).map((criterion) => criterion.knowledge_dimension)
    );
    expect(mocks.state.generatedQuestionWrites).toHaveLength(50);
    expect(mocks.state.generatedQuestionWrites.every((question) =>
      ["factual", "conceptual", "procedural", "metacognitive"].includes(
        String(question.knowledge_dimension)
      )
    )).toBe(true);
    expect(mocks.state.generatedQuestionWrites.every((question) =>
      question.subject_code === 'ITPC 101' &&
      question.subject_description === 'Computer System Servicing' &&
      question.subject === 'ITPC 101 - Computer System Servicing' &&
      question.category === 'Major' &&
      question.specialization === 'IT' &&
      question.topic === 'Systems Analysis' &&
      question.tos_id === 'tos-1' &&
      (question.metadata as Record<string, unknown>).subject_no === 'ITPC 101' &&
      (question.metadata as Record<string, unknown>).academic_subject_id === 'subject-id-101' &&
      (question.metadata as Record<string, unknown>).tos_id === 'tos-1'
    )).toBe(true);
    expect(mocks.state.edgeCalls).toHaveLength(50);
    expect(mocks.state.edgeCalls.every(({ name, body }) =>
      name === 'generate-constrained-questions' &&
      body.question_type === 'mcq' &&
      body.regeneration_context.question_type === 'mcq'
    )).toBe(true);

    const renderModel = buildExamRenderModel({
      id: result.id,
      title: result.title,
      items: savedItems as any
    }, { showAnswerKey: true });
    expect(renderModel.totalQuestions).toBe(50);
    expect(renderModel.sections).toHaveLength(1);
    expect(renderModel.sections[0].kind).toBe('mcq');
    expect(renderModel.sections[0].items).toHaveLength(50);
    expect(renderModel.sections[0].items.every((item) => item.options.length === 4)).toBe(true);
    expect(renderModel.answerKey).toHaveLength(50);
  });

  it('rejects generation when a question-bank insert fails instead of returning an unsaved question', async () => {
    mocks.state.questionInsertError = 'question bank unavailable';

    await expect(generateFormatAwareTest({
      format: FORMAT_1,
      tosCriteria: createTosCriteria(50),
      testTitle: 'persistence failure exam',
      testMetadata: {
        tos_id: 'tos-1',
        subject_no: 'ITPC 101',
        academic_subject_id: 'subject-id-101',
        description: 'Computer System Servicing',
        category: 'Major',
        specialization: 'IT'
      }
    })).rejects.toThrow('Failed to save AI question to the question bank: question bank unavailable');

    expect(mocks.state.generatedQuestionWrites).toHaveLength(0);
    expect(mocks.state.examPayload).toBeNull();
  });

  it('regenerates a duplicate with the original slot metadata and a different question', async () => {
    let slotTwoAttempts = 0;
    mocks.invoke.mockImplementation(async (name, options) => {
      mocks.state.edgeCalls.push({ name, body: options.body });
      const slot = options.body.regeneration_context;
      const number = slot.question_number as number;
      slotTwoAttempts += number === 2 ? 1 : 0;
      const duplicate = number === 2 && slotTwoAttempts === 1;
      const questionNumber = duplicate ? 1 : number;
      const token = String.fromCharCode(97 + Math.floor((questionNumber - 1) / 26)) +
        String.fromCharCode(97 + ((questionNumber - 1) % 26));
      return {
        data: {
          questions: [{
            text: `Compare ${token}signal with ${token}metric; use ${token}process and ${token}operation to classify ${token}outcome.`,
            choices: {
              A: `${token}correct`,
              B: `${token}distractorone`,
              C: `${token}distractortwo`,
              D: `${token}distractorthree`
            },
            correct_answer: 'A',
            structure_validated: true
          }]
        },
        error: null
      };
    });

    const result = await generateFormatAwareTest({
      format: FORMAT_1,
      tosCriteria: createTosCriteria(2),
      testTitle: 'Regeneration integration exam',
      testMetadata: { tos_id: 'tos-1' }
    });

    const items = mocks.state.examPayload?.items as Array<Record<string, any>>;
    const retry = mocks.state.edgeCalls.find(({ body }) =>
      body.regeneration_context.question_number === 2 &&
      body.regeneration_context.rejected_questions?.length > 0
    );

    expect(result.totalItems).toBe(2);
    expect(slotTwoAttempts).toBe(2);
    expect(items).toHaveLength(2);
    expect(items[1].question_number).toBe(2);
    expect(items[1].question_text).toContain('absignal');
    expect(items[1].topic).toBe('Systems Analysis');
    expect(items[1].bloom_level).toBe('understanding');
    expect(items[1].difficulty).toBe('easy');
    expect(items[1].knowledge_dimension).toBe('Conceptual');
    expect(items[1].question_type).toBe('mcq');
    expect(retry?.body.regeneration_context).toMatchObject({
      question_number: 2,
      topic: 'Systems Analysis',
      bloom_level: 'understanding',
      difficulty: 'easy',
      knowledge_dimension: 'conceptual',
      question_type: 'mcq'
    });
    expect(retry?.body.regeneration_context.rejected_questions[0].question).toContain('aasignal');
    expect(retry?.body.regeneration_context.rejected_questions[0].reason).toMatch(/duplicate/i);
  });

  it('rejects a bank duplicate before accepting the regenerated replacement', async () => {
    const bankQuestion = {
      id: 'existing-bank-question',
      question_text: 'Compare aasignal with aametric; use aaprocess and aaoperation to classify aaoutcome.',
      question_type: 'mcq',
      choices: {
        A: 'aacorrect',
        B: 'aadistractorone',
        C: 'aadistractortwo',
        D: 'aadistractorthree'
      },
      correct_answer: 'A',
      topic: 'Systems Analysis',
      bloom_level: 'Remembering',
      difficulty: 'Average',
      knowledge_dimension: 'Factual'
    };
    mocks.state.seedBankQuestions = [bankQuestion];
    let responseCount = 0;
    mocks.invoke.mockImplementation(async (name, options) => {
      mocks.state.edgeCalls.push({ name, body: options.body });
      responseCount += 1;
      const replacement = responseCount > 1;
      const token = replacement ? 'new' : 'aa';
      return {
        data: {
          questions: [{
            text: `Compare ${token}signal with ${token}metric; use ${token}process and ${token}operation to classify ${token}outcome.`,
            choices: {
              A: `${token}correct`,
              B: `${token}distractorone`,
              C: `${token}distractortwo`,
              D: `${token}distractorthree`
            },
            correct_answer: 'A',
            structure_validated: true
          }]
        },
        error: null
      };
    });

    await generateFormatAwareTest({
      format: FORMAT_1,
      tosCriteria: createTosCriteria(1),
      testTitle: 'Bank duplicate exam',
      testMetadata: { tos_id: 'tos-1' }
    });

    const item = (mocks.state.examPayload?.items as Array<Record<string, any>>)[0];
    const retry = mocks.state.edgeCalls[1];
    expect(responseCount).toBe(2);
    expect(item.question_text).toContain('newsignal');
    expect(retry.body.regeneration_context.rejected_questions[0].question)
      .toBe(bankQuestion.question_text);
    expect(retry.body.regeneration_context.rejected_questions[0].reason).toMatch(/duplicate/i);
  });

  it('does not persist a completed test when every generated MCQ is invalid', async () => {
    mocks.invoke.mockImplementation(async (name, options) => {
      mocks.state.edgeCalls.push({ name, body: options.body });
      return {
        data: {
          questions: [{
            text: 'Invalid MCQ with too few choices.',
            choices: { A: 'Only one' },
            correct_answer: 'A',
            structure_validated: true
          }]
        },
        error: null
      };
    });

    await expect(generateFormatAwareTest({
      format: FORMAT_1,
      tosCriteria: createTosCriteria(1),
      testTitle: 'Invalid exam',
      testMetadata: { tos_id: 'tos-1' }
    })).rejects.toThrow(/Unable to fill question 1/);

    expect(mocks.state.examPayload).toBeNull();
    expect(mocks.state.edgeCalls).toHaveLength(3);
  });

  it('saves and retrieves the selected format ID from the generated examination row', async () => {
    await generateFormatAwareTest({
      format: FORMAT_1,
      tosCriteria: createTosCriteria(1),
      testTitle: 'Persisted format exam',
      testMetadata: { tos_id: 'tos-1' }
    });

    const retrieved = await GeneratedTests.getById('generated-test-1');
    expect(retrieved.format_id).toBe(FORMAT_1.id);
  });

  it.each([FORMAT_2, FORMAT_4])(
    '$name produces the configured grouped essay prompts and preserves all $totalItems TOS slots',
    async (format) => {
      const result = await generateFormatAwareTest({
        format,
        tosCriteria: createTosCriteria(50),
        testTitle: `${format.name} integration exam`,
        testMetadata: { tos_id: 'tos-1' }
      });
      const items = mocks.state.examPayload?.items as Array<Record<string, any>>;
      const answerKey = mocks.state.examPayload?.answer_key as Array<Record<string, any>>;
      const essaySection = format.sections.find((section) => section.questionType === 'essay')!;
      const essayItems = items.filter((item) => item.question_type === 'essay');
      const promptGroups = new Map<string, Record<string, any>[]>();
      essayItems.forEach((item) => {
        const group = promptGroups.get(item.essay_prompt_group_id) || [];
        group.push(item);
        promptGroups.set(item.essay_prompt_group_id, group);
      });

      expect(result.totalItems).toBe(50);
      expect(items).toHaveLength(50);
      expect(items.map((item) => item.question_number)).toEqual(Array.from({ length: 50 }, (_, i) => i + 1));
      expect(items.filter((item) => item.question_type === 'mcq')).toHaveLength(
        format.sections.find((section) => section.questionType === 'mcq')!.endNumber
      );
      expect(promptGroups.size).toBe(essaySection.essayCount);
      expect([...promptGroups.values()].map((group) => group.length)).toEqual(
        Array(essaySection.essayCount).fill(
          (essaySection.endNumber - essaySection.startNumber + 1) / essaySection.essayCount!
        )
      );
      expect([...promptGroups.values()].every((group) => group.every((item) =>
        item.essay_prompt_start_number === group[0].essay_prompt_start_number &&
        item.essay_prompt_end_number === group[0].essay_prompt_end_number &&
        item.points === 1
      ))).toBe(true);
      expect(essayItems.reduce((sum, item) => sum + item.points, 0))
        .toBe(essaySection.essayCount! * essaySection.pointsPerQuestion);
      expect(result.totalPoints).toBe(50);
      expect(new Set(items.map((item) => item.question_type))).toEqual(
        new Set(format.sections.map((section) => section.questionType))
      );
      expect(mocks.state.examPayload?.format_id).toBe(format.id);
      expect(answerKey).toHaveLength(50);
      expect(mocks.state.edgeCalls
        .filter(({ body }) => body.question_type === 'essay')
        .every(({ body }) =>
          body.regeneration_context.essay_prompt_group_id &&
          body.regeneration_context.essay_prompt_start_number &&
          body.regeneration_context.essay_prompt_end_number
        )
      ).toBe(true);
      const renderModel = buildExamRenderModel({ items: items as any }, { showAnswerKey: true });
      const renderedEssayItems = renderModel.sections
        .filter((section) => section.kind === 'essay')
        .flatMap((section) => section.items);
      expect(new Set(renderedEssayItems.map((item) => item.essayPromptGroupId)).size)
        .toBe(essaySection.essayCount);
      expect(renderModel.answerKey).toHaveLength(50);
    }
  );

  it('repairs a partial Format 1 exam without changing valid TOS-aligned items', async () => {
    const generated = await generateFormatAwareTest({
      format: FORMAT_1,
      tosCriteria: createTosCriteria(50),
      testTitle: 'Repairable Format 1 exam',
      testMetadata: { tos_id: 'tos-1' }
    });
    const retrieved = await GeneratedTests.getById(generated.id);
    expect(retrieved.format_id).toBe(FORMAT_1.id);
    const originalItems = retrieved.items as Array<Record<string, any>>;
    const originalAnswerKey = retrieved.answer_key as Array<Record<string, any>>;
    const missingNumber = 25;
    const originalAtSlot = originalItems[missingNumber - 1];
    const remainingItems = originalItems.filter((item) => item.question_number !== missingNumber);
    const remainingAnswerKey = originalAnswerKey
      .filter((entry) => entry.question_number !== missingNumber);
    mocks.state.savedExam = {
      ...mocks.state.savedExam,
      format_id: FORMAT_1.id,
      items: remainingItems,
      answer_key: remainingAnswerKey
    };

    const repair = await repairFormatAwareTest({
      id: generated.id,
      format_id: retrieved.format_id,
      tos_id: 'tos-1',
      items: remainingItems,
      answer_key: remainingAnswerKey
    });

    expect(repair.repaired).toBe(true);
    expect(repair.replacedQuestionNumbers).toEqual([missingNumber]);
    expect(repair.items).toHaveLength(50);
    expect(repair.items.every((item) => item.question_type === 'mcq')).toBe(true);
    expect(repair.items[missingNumber - 1]).toMatchObject({
      question_number: missingNumber,
      topic: originalAtSlot.topic,
      bloom_level: originalAtSlot.bloom_level,
      difficulty: originalAtSlot.difficulty,
      knowledge_dimension: originalAtSlot.knowledge_dimension,
      question_type: 'mcq',
      section_id: 'A'
    });
    expect(repair.items.filter((item) => item.question_number !== missingNumber))
      .toEqual(remainingItems);
    expect(repair.answer_key).toHaveLength(50);
    repair.items.forEach((item) => {
      expect(repair.answer_key.find((entry) => entry.question_number === item.question_number))
        .toMatchObject({
          question_id: item.id,
          correct_answer: item.correct_answer
        });
    });
    expect(mocks.state.examUpdates).toHaveLength(1);
    expect(mocks.state.examUpdates[0]).toMatchObject({ format_id: FORMAT_1.id });
  });

  it.each(['pending_validation', 'validated'])(
    'does not attempt auto-repair for a %s questionnaire',
    async (validationStatus) => {
      const items = [{ question_number: 1, question_text: 'Existing submitted item' }];
      const answerKey = [{ question_number: 1, correct_answer: 'A' }];

      const repair = await repairFormatAwareTest({
        id: 'locked-test',
        format_id: FORMAT_1.id,
        tos_id: 'tos-1',
        validation_status: validationStatus,
        items,
        answer_key: answerKey
      });

      expect(repair).toEqual({
        repaired: false,
        items,
        answer_key: answerKey,
        replacedQuestionNumbers: []
      });
      expect(mocks.state.examUpdates).toHaveLength(0);
      expect(mocks.state.edgeCalls).toHaveLength(0);
    }
  );

  it('rejects a bank duplicate during repair and replaces it with a unique item', async () => {
    const generated = await generateFormatAwareTest({
      format: FORMAT_1,
      tosCriteria: createTosCriteria(50),
      testTitle: 'Duplicate-safe repair exam',
      testMetadata: { tos_id: 'tos-1' }
    });
    const originalItems = mocks.state.savedExam?.items as Array<Record<string, any>>;
    const missingNumber = 25;
    const retained = originalItems.filter((item) => item.question_number !== missingNumber);
    const retainedKey = (mocks.state.savedExam?.answer_key as Array<Record<string, any>>)
      .filter((entry) => entry.question_number !== missingNumber);
    mocks.state.seedBankQuestions = [{
      ...originalItems[missingNumber],
      bloom_level: originalItems[missingNumber - 1].bloom_level,
      difficulty: originalItems[missingNumber - 1].difficulty,
      knowledge_dimension: originalItems[missingNumber - 1].knowledge_dimension
    }];
    mocks.state.savedExam = {
      ...mocks.state.savedExam,
      format_id: FORMAT_1.id,
      items: retained,
      answer_key: retainedKey
    };

    let attempts = 0;
    mocks.invoke.mockImplementation(async (name, options) => {
      mocks.state.edgeCalls.push({ name, body: options.body });
      attempts += 1;
      const source = attempts === 1 ? originalItems[missingNumber] : undefined;
      const token = 'replacementunique';
      return {
        data: {
          questions: [{
            text: source?.question_text ||
              `Compare ${token}signal with ${token}metric; use ${token}process and ${token}operation to classify ${token}outcome.`,
            choices: source?.choices || {
              A: `${token}correct`,
              B: `${token}distractorone`,
              C: `${token}distractortwo`,
              D: `${token}distractorthree`
            },
            correct_answer: source?.correct_answer || 'A',
            structure_validated: true
          }]
        },
        error: null
      };
    });

    const repair = await repairFormatAwareTest({
      id: generated.id,
      format_id: FORMAT_1.id,
      tos_id: 'tos-1',
      items: retained,
      answer_key: retainedKey
    });

    expect(attempts).toBe(2);
    expect(repair.items).toHaveLength(50);
    expect(repair.items[24].question_text).toContain('replacementunique');
    expect(repair.items.every((item, index) =>
      repair.items.slice(index + 1).every((other) =>
        !getQuestionDuplicateReason(item, other)
      )
    )).toBe(true);
    expect(mocks.state.edgeCalls.at(-1)?.body.regeneration_context.rejected_questions[0].reason)
      .toMatch(/duplicate|already used/i);
  });

  it('does not overwrite a saved examination when replacement generation remains invalid', async () => {
    mocks.state.tosRecord = createTosRecord(1);
    mocks.state.savedExam = {
      id: 'legacy-partial',
      format_id: FORMAT_1.id,
      tos_id: 'tos-1',
      items: [],
      answer_key: []
    };
    const before = { ...mocks.state.savedExam };
    mocks.invoke.mockImplementation(async (name, options) => {
      mocks.state.edgeCalls.push({ name, body: options.body });
      return {
        data: {
          questions: [{
            text: 'Invalid MCQ replacement.',
            choices: { A: 'only option' },
            correct_answer: 'A',
            structure_validated: true
          }]
        },
        error: null
      };
    });

    await expect(repairFormatAwareTest({
      id: 'legacy-partial',
      format_id: FORMAT_1.id,
      tos_id: 'tos-1',
      items: [],
      answer_key: []
    })).rejects.toThrow(/Unable to repair question 1/);

    expect(mocks.state.examUpdates).toHaveLength(0);
    expect(mocks.state.savedExam).toEqual(before);
  });

  it('does not guess a format for legacy records without format metadata', async () => {
    mocks.state.tosRecord = createTosRecord(1);
    const completeLegacy = await repairFormatAwareTest({
      id: 'legacy-complete',
      tos_id: 'tos-1',
      items: [{ question_number: 1 }],
      answer_key: []
    });
    expect(completeLegacy.repaired).toBe(false);
    await expect(repairFormatAwareTest({
      id: 'legacy-incomplete',
      tos_id: 'tos-1',
      items: [],
      answer_key: []
    })).rejects.toThrow(/no saved format_id/);
    expect(mocks.state.examUpdates).toHaveLength(0);
  });
});
