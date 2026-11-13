import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  isValidGeneratedQuestion,
  mapQuestionsToIntents,
  restoreIntentOrder,
  type QuestionIntent,
} from "./questionSlotMapping.ts";

const intents: QuestionIntent[] = [1, 2, 3].map((itemNumber) => ({
  slot: {
    id: `slot-${itemNumber}`,
    itemNumber,
    sectionId: `section-${itemNumber}`,
    topic: `Topic ${itemNumber}`,
    bloomLevel: 'understanding',
    difficulty: 'average',
    questionType: 'mcq',
  },
}));

function mcq(itemNumber: number, overrides: Record<string, unknown> = {}) {
  return {
    item_number: itemNumber,
    text: `Question stem ${itemNumber} asks about the assigned topic?`,
    correct_option: `The correct substantive option for question ${itemNumber}.`,
    distractors: [
      `A substantive incorrect option for question ${itemNumber}.`,
      `Another substantive incorrect option for question ${itemNumber}.`,
      `A third substantive incorrect option for question ${itemNumber}.`,
    ],
    ...overrides,
  };
}

Deno.test("rejecting the first generated MCQ leaves later TOS slots aligned", () => {
  const questions = mapQuestionsToIntents(
    intents,
    [
      mcq(1, { distractors: [] }),
      mcq(2),
      mcq(3),
    ],
    'mcq',
    (_intent, generated) => ({ question_text: generated.text }),
  );

  assertEquals(questions.map((question) => question?.item_number ?? null), [null, 2, 3]);
  assertEquals(questions[1]?.slot_id, 'slot-2');
  assertEquals(questions[2]?.topic, 'Topic 3');
});

Deno.test("rejecting a middle generated MCQ does not shift the final slot", () => {
  const questions = mapQuestionsToIntents(
    intents,
    [
      mcq(1),
      mcq(2, { correct_option: '' }),
      mcq(3),
    ],
    'mcq',
    (_intent, generated) => ({ question_text: generated.text }),
  );

  assertEquals(questions.map((question) => question?.item_number ?? null), [1, null, 3]);
  assertEquals(questions[0]?.slot_id, 'slot-1');
  assertEquals(questions[2]?.slot_id, 'slot-3');
});

Deno.test("restoring grouped question types preserves original intent order and rejected positions", () => {
  const questions = restoreIntentOrder(4, [
    { indices: [0, 2], questions: [null, { slot_id: 'slot-3' }] },
    { indices: [1, 3], questions: [{ slot_id: 'slot-2' }, null] },
  ]);

  assertEquals(questions.map((question) => question?.slot_id ?? null), [null, 'slot-2', 'slot-3', null]);
});

Deno.test("slot metadata overrides provider metadata without losing item identity", () => {
  const questions = mapQuestionsToIntents(
    intents.slice(0, 1),
    [mcq(1, { topic: 'wrong', bloom_level: 'creating', difficulty: 'difficult' })],
    'mcq',
    (_intent, generated) => ({ question_text: generated.text }),
  );

  assertEquals(questions[0]?.topic, 'Topic 1');
  assertEquals(questions[0]?.bloom_level, 'understanding');
  assertEquals(questions[0]?.difficulty, 'average');
  assertEquals(questions[0]?.question_type, 'mcq');
  assertEquals(questions[0]?.item_number, 1);
  assertEquals(questions[0]?.section_id, 'section-1');
});

Deno.test("generated answer validation requires complete content for each question type", () => {
  assert(isValidGeneratedQuestion('mcq', mcq(1)));
  assert(!isValidGeneratedQuestion('mcq', mcq(1, { distractors: ['one', 'two', 'three'] })));
  assert(isValidGeneratedQuestion('true_false', { text: 'A true or false statement.', correct_answer: 'False' }));
  assert(!isValidGeneratedQuestion('true_false', { text: 'A true or false statement.', correct_answer: 'unknown' }));
  assert(isValidGeneratedQuestion('short_answer', { text: 'What is the answer?', correct_answer: 'A valid response' }));
  assert(!isValidGeneratedQuestion('short_answer', { text: 'What is the answer?', correct_answer: '   ' }));
  assert(isValidGeneratedQuestion('essay', {
    text: 'Discuss the topic and support your analysis with evidence.',
    rubric: { accuracy: 'Accurate analysis', evidence: 'Relevant evidence' },
    model_answer: 'A complete model answer.',
  }));
  assert(!isValidGeneratedQuestion('essay', {
    text: 'Discuss the topic and support your analysis with evidence.',
    rubric: {},
    model_answer: 'A complete model answer.',
  }));
});

Deno.test("questions without an explicit matching item number cannot fill a slot", () => {
  const questions = mapQuestionsToIntents(
    intents.slice(0, 1),
    [mcq(2)],
    'mcq',
    (_intent, generated) => ({ question_text: generated.text }),
  );

  assertEquals(questions, [null]);
});
