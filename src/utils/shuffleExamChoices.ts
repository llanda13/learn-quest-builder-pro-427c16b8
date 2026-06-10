/**
 * Content-based MCQ choice randomization with answer-key recalculation
 * and distribution validation.
 *
 * Used as the final compilation step for any examination before it is
 * previewed, printed, exported, or persisted. Guarantees Preview / Print /
 * PDF / Stored records all show the same shuffled options + answer key.
 */

const LETTERS = ["A", "B", "C", "D", "E", "F"] as const;

function fisherYates<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function isMCQ(type?: string): boolean {
  const t = (type || "").toLowerCase();
  return t === "mcq" || t === "multiple-choice" || t === "multiple_choice" || t === "multiple choice";
}

/** Convert an item's choices into an ordered [letter, value] entry list. */
function readEntries(choices: any): Array<[string, string]> {
  if (!choices) return [];
  if (Array.isArray(choices)) {
    return choices.map((v, i) => [LETTERS[i] || `O${i}`, String(v)] as [string, string]);
  }
  if (typeof choices === "object") {
    return LETTERS.filter((k) => choices[k] != null).map(
      (k) => [k, String(choices[k])] as [string, string],
    );
  }
  return [];
}

/**
 * Resolve the correct answer to its actual content value, regardless of
 * whether the source uses a letter key ("A"), a numeric index (0), or the
 * raw content itself.
 */
function resolveCorrectContent(
  entries: Array<[string, string]>,
  correct: unknown,
): string | null {
  if (correct == null) return null;
  const raw = String(correct).trim();
  if (!raw) return null;

  // Letter key
  const byLetter = entries.find(([k]) => k.toUpperCase() === raw.toUpperCase());
  if (byLetter) return byLetter[1];

  // Numeric index
  const idx = Number(raw);
  if (Number.isInteger(idx) && idx >= 0 && idx < entries.length) {
    return entries[idx][1];
  }

  // Content match (case-insensitive, trimmed)
  const byValue = entries.find(
    ([, v]) => v.trim().toLowerCase() === raw.toLowerCase(),
  );
  if (byValue) return byValue[1];

  return null;
}

export interface ShuffledItem {
  item: any;            // new item with shuffled choices + recomputed correct_answer letter
  letter: string | null; // recomputed letter for MCQ; null for non-MCQ
}

function shuffleOne(item: any): ShuffledItem {
  if (!isMCQ(item?.question_type || item?.type)) {
    return { item, letter: null };
  }
  const entries = readEntries(item.choices ?? item.options);
  if (entries.length < 2) return { item, letter: null };

  const correctContent = resolveCorrectContent(
    entries,
    item.correct_answer ?? item.correctAnswer,
  );

  const shuffled = fisherYates(entries);
  const newChoices: Record<string, string> = {};
  let newLetter: string | null = null;
  shuffled.forEach(([, value], idx) => {
    const letter = LETTERS[idx];
    newChoices[letter] = value;
    if (correctContent != null && value === correctContent) newLetter = letter;
  });

  // Fallback: if we somehow lost the correct answer, keep the original letter.
  if (!newLetter) newLetter = String(item.correct_answer ?? item.correctAnswer ?? "A");

  return {
    item: {
      ...item,
      choices: newChoices,
      options: undefined,
      correct_answer: newLetter,
      correctAnswer: newLetter,
    },
    letter: newLetter,
  };
}

/**
 * Check answer-key distribution. Returns true if any letter exceeds the
 * allowed cluster cap (1.5x the even share, min cap 3).
 */
function isClustered(letters: string[]): boolean {
  if (letters.length < 8) return false;
  const counts: Record<string, number> = {};
  for (const l of letters) counts[l] = (counts[l] || 0) + 1;
  const uniq = Object.keys(counts).length || 1;
  const cap = Math.max(3, Math.ceil((letters.length / uniq) * 1.5));
  return Object.values(counts).some((c) => c > cap);
}

export interface ShuffleResult {
  items: any[];
  answerKey: Record<string, string>; // { "1": "B", "2": "A", ... } – MCQ only entries keyed by question number
  distribution: Record<string, number>;
  reshuffleAttempts: number;
}

/**
 * Shuffle MCQ choices for every item, recompute correct-answer letters, and
 * validate distribution. Non-MCQ items are returned unchanged.
 *
 * The full list is re-shuffled (up to 5 attempts) when the answer-key letters
 * are too clustered into one position.
 */
export function shuffleExamChoices(items: any[]): ShuffleResult {
  const safeItems = Array.isArray(items) ? items : [];
  let attempt = 0;
  let lastRun: ShuffledItem[] = [];

  while (attempt < 5) {
    lastRun = safeItems.map(shuffleOne);
    const letters = lastRun
      .map((r) => r.letter)
      .filter((l): l is string => !!l);
    if (!isClustered(letters)) break;
    attempt++;
  }

  const answerKey: Record<string, string> = {};
  const distribution: Record<string, number> = {};
  lastRun.forEach((r, i) => {
    if (r.letter) {
      const num = String(i + 1);
      answerKey[num] = r.letter;
      distribution[r.letter] = (distribution[r.letter] || 0) + 1;
    }
  });

  return {
    items: lastRun.map((r) => r.item),
    answerKey,
    distribution,
    reshuffleAttempts: attempt,
  };
}
