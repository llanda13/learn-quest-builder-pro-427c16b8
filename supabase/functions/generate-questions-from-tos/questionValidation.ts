type ChoiceRecord = Record<string, unknown>;

export interface McqChoiceValidation {
  choices: Record<string, string> | null;
  reasons: string[];
}

function choiceText(choice: unknown): string {
  if (typeof choice === 'string') return choice.trim();
  if (choice !== null && typeof choice === 'object' && !Array.isArray(choice)) {
    const text = (choice as ChoiceRecord).text;
    return typeof text === 'string' ? text.trim() : '';
  }
  return '';
}

export function getMcqChoiceValidationReasons(
  choices: unknown,
  correctAnswer: unknown,
): string[] {
  const entries: Array<[string, unknown]> = Array.isArray(choices)
    ? choices.map((choice, index) => [String(index), choice])
    : choices !== null && typeof choices === 'object'
      ? Object.entries(choices as ChoiceRecord)
      : [];
  const orderedEntries = entries.length === 4 && ['A', 'B', 'C', 'D'].every((key) =>
    entries.some(([entryKey]) => entryKey.toUpperCase() === key)
  )
    ? ['A', 'B', 'C', 'D'].map((key) =>
      entries.find(([entryKey]) => entryKey.toUpperCase() === key)!
    )
    : entries;
  const options = orderedEntries.map(([, choice]) => choiceText(choice));
  const reasons: string[] = [];

  if (options.length !== 4) {
    reasons.push(`quality:mcq_choice_count(expected=4,got=${options.length})`);
  }
  if (options.some((option) => !option)) {
    reasons.push('quality:mcq_empty_choice');
  }

  const normalizedOptions = options.map((option) => option.toLowerCase());
  if (new Set(normalizedOptions).size !== normalizedOptions.length) {
    reasons.push('quality:mcq_duplicate_options');
  }

  const answer = String(correctAnswer ?? '').trim();
  const normalizedAnswer = answer.toLowerCase();
  const answerIndex = /^[a-d]$/i.test(answer)
    ? answer.toUpperCase().charCodeAt(0) - 65
    : /^\d$/.test(answer)
      ? Number(answer)
      : -1;
  const answerMatchesOption =
    normalizedOptions.includes(normalizedAnswer) ||
    (answerIndex >= 0 &&
      answerIndex < options.length &&
      Boolean(options[answerIndex]) &&
      (
        Array.isArray(choices) ||
        orderedEntries[answerIndex]?.[0].toUpperCase() === answer.toUpperCase()
      ));

  if (!answerMatchesOption) {
    reasons.push('quality:mcq_correct_not_in_options');
  }

  return reasons;
}

export function validateMcqChoices(
  choices: unknown,
  correctAnswer: unknown,
  minimumOptionLength = 1,
): McqChoiceValidation {
  const reasons = getMcqChoiceValidationReasons(choices, correctAnswer);
  const answer = typeof correctAnswer === 'string' ? correctAnswer : '';
  if (!['A', 'B', 'C', 'D'].includes(answer)) {
    reasons.push('quality:mcq_invalid_answer_key');
  }

  const entries: Array<[string, unknown]> = Array.isArray(choices)
    ? choices.map((choice, index) => [['A', 'B', 'C', 'D'][index] ?? String(index), choice])
    : choices !== null && typeof choices === 'object'
      ? Object.entries(choices as ChoiceRecord)
      : [];
  const normalizedEntries = entries.map(([key, value]) => [key.toUpperCase(), value] as const);
  const optionKeys = normalizedEntries.map(([key]) => key);
  const hasExactKeys =
    optionKeys.length === 4 &&
    new Set(optionKeys).size === 4 &&
    ['A', 'B', 'C', 'D'].every((key) => optionKeys.includes(key));
  const allStringChoices = normalizedEntries.every(([, value]) => typeof value === 'string');

  if (!allStringChoices && !reasons.includes('quality:mcq_invalid_choice_type')) {
    reasons.push('quality:mcq_invalid_choice_type');
  }

  const normalizedChoices = hasExactKeys && allStringChoices
    ? Object.fromEntries(
      ['A', 'B', 'C', 'D'].map((key) => [
        key,
        String(normalizedEntries.find(([entryKey]) => entryKey === key)?.[1]).trim(),
      ]),
    )
    : null;

  if (normalizedChoices && Object.values(normalizedChoices).some((choice) =>
    choice.length < minimumOptionLength
  )) {
    reasons.push(`quality:mcq_choice_too_short(min=${minimumOptionLength})`);
  }

  return {
    choices: reasons.length === 0 ? normalizedChoices : null,
    reasons,
  };
}
