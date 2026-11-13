export type GeneratedQuestionType = 'mcq' | 'true_false' | 'short_answer' | 'essay';

export interface QuestionIntent {
  slot: {
    id: string;
    itemNumber: number;
    sectionId?: string;
    topic: string;
    bloomLevel: string;
    difficulty: string;
    questionType: GeneratedQuestionType;
  };
}

export function restoreIntentOrder<TQuestion>(
  intentCount: number,
  groups: readonly { indices: readonly number[]; questions: readonly (TQuestion | null)[] }[],
): Array<TQuestion | null> {
  const questions: Array<TQuestion | null> = new Array(intentCount).fill(null);
  for (const group of groups) {
    group.indices.forEach((intentIndex, groupIndex) => {
      questions[intentIndex] = group.questions[groupIndex] ?? null;
    });
  }
  return questions;
}

function isRecord(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasText(value: unknown, minLength = 1): value is string {
  return typeof value === 'string' && value.trim().length >= minLength;
}

function hasRubric(value: unknown): boolean {
  if (hasText(value)) return true;
  if (!isRecord(value)) return false;
  const entries = Object.values(value);
  return entries.length > 0 && entries.every((entry) => hasText(entry));
}

export function isValidGeneratedQuestion(type: GeneratedQuestionType, question: unknown): boolean {
  if (!isRecord(question)) return false;

  if (type === 'mcq') {
    const correct = question.correct_option ?? question.correct_answer;
    return hasText(question.text, 15) &&
      hasText(correct, 20) &&
      Array.isArray(question.distractors) &&
      question.distractors.length === 3 &&
      question.distractors.every((choice: unknown) => hasText(choice, 20));
  }

  if (type === 'true_false') {
    return hasText(question.text, 11) &&
      typeof question.correct_answer === 'string' &&
      ['true', 'false'].includes(question.correct_answer.trim().toLowerCase());
  }

  if (type === 'short_answer') {
    return hasText(question.text, 11) && hasText(question.correct_answer);
  }

  return hasText(question.text, 21) &&
    hasRubric(question.rubric) &&
    hasText(question.model_answer);
}

export function mapQuestionsToIntents<TIntent extends QuestionIntent, TQuestion extends Record<string, any>>(
  intents: readonly TIntent[],
  generatedQuestions: readonly unknown[],
  type: GeneratedQuestionType,
  buildQuestion: (intent: TIntent, generated: Record<string, any>) => TQuestion | null,
): Array<(TQuestion & Record<string, any>) | null> {
  const questionsByItemNumber = new Map<number, Record<string, any>>();
  const duplicateItemNumbers = new Set<number>();

  for (const generated of generatedQuestions) {
    if (!isRecord(generated) || !Number.isInteger(generated.item_number)) continue;
    const itemNumber = generated.item_number as number;
    if (questionsByItemNumber.has(itemNumber)) {
      duplicateItemNumbers.add(itemNumber);
    } else {
      questionsByItemNumber.set(itemNumber, generated);
    }
  }

  return intents.map((intent) => {
    const slot = intent.slot;
    const generated = questionsByItemNumber.get(slot.itemNumber);
    if (
      !generated ||
      duplicateItemNumbers.has(slot.itemNumber) ||
      slot.questionType !== type ||
      !isValidGeneratedQuestion(type, generated)
    ) {
      return null;
    }

    const question = buildQuestion(intent, generated);
    if (!question) return null;

    return {
      ...question,
      slot_id: slot.id,
      item_number: slot.itemNumber,
      section_id: slot.sectionId,
      topic: slot.topic,
      bloom_level: slot.bloomLevel,
      difficulty: slot.difficulty,
      question_type: slot.questionType,
      metadata: {
        ...(isRecord(question.metadata) ? question.metadata : {}),
        slot_id: slot.id,
        item_number: slot.itemNumber,
        section_id: slot.sectionId,
      },
    };
  });
}
