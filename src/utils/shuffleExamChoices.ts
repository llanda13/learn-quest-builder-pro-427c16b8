/**
 * Content-based MCQ choice randomization with answer-key recalculation
 * and *guaranteed* distribution balance.
 *
 * This is the final compilation step for every examination before it is
 * previewed, printed, exported, or persisted. It guarantees that:
 *   1. Each question's options are independently shuffled (Fisher-Yates).
 *   2. The correct-answer letter is recomputed from the NEW position, using
 *      object-identity tracking so the correct choice is never "lost" when
 *      duplicate/whitespace/case-variant strings are present.
 *   3. The final answer-key distribution across A/B/C/D is naturally
 *      balanced. If random shuffling produces clustering, the engine
 *      performs a deterministic rebalancing pass (per-question swap of the
 *      correct option into an under-represented letter) so no letter ever
 *      exceeds a fair cap.
 *
 * Non-MCQ items pass through unchanged.
 */

const LETTERS = ["A", "B", "C", "D", "E", "F"] as const;

// ---------- helpers -------------------------------------------------------

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
  return (
    t === "mcq" ||
    t === "multiple-choice" ||
    t === "multiple_choice" ||
    t === "multiple choice"
  );
}

/** Ordered entries as [letter, value] regardless of source shape. */
function readEntries(choices: any): Array<[string, string]> {
  if (!choices) return [];
  if (Array.isArray(choices)) {
    return choices.map(
      (v, i) => [LETTERS[i] || `O${i}`, String(v)] as [string, string],
    );
  }
  if (typeof choices === "object") {
    // Accept both upper- and lower-case keys.
    const out: Array<[string, string]> = [];
    for (const L of LETTERS) {
      const v = choices[L] ?? choices[L.toLowerCase()];
      if (v != null && String(v).trim() !== "") out.push([L, String(v)]);
    }
    return out;
  }
  return [];
}

/**
 * Return the INDEX (0-based) of the correct entry in the pre-shuffle list.
 * Resolves whether `correct` is a letter, numeric index, or content string.
 */
function resolveCorrectIndex(
  entries: Array<[string, string]>,
  correct: unknown,
): number {
  if (correct == null) return -1;
  const raw = String(correct).trim();
  if (!raw) return -1;

  // Letter key ("A", "b", ...)
  if (raw.length === 1) {
    const upper = raw.toUpperCase();
    const idx = entries.findIndex(([k]) => k.toUpperCase() === upper);
    if (idx >= 0) return idx;
  }

  // Numeric index ("0", "1", ...)
  const n = Number(raw);
  if (Number.isInteger(n) && n >= 0 && n < entries.length) return n;

  // Content match (case + whitespace tolerant)
  const norm = raw.toLowerCase().replace(/\s+/g, " ").trim();
  const idx = entries.findIndex(
    ([, v]) => v.toLowerCase().replace(/\s+/g, " ").trim() === norm,
  );
  return idx;
}

// ---------- per-item shuffle ---------------------------------------------

interface Prepared {
  item: any;
  isMcq: boolean;
  /** Original ordered entries [letter, value] before shuffle. */
  entries: Array<[string, string]>;
  /** Index (in `entries`) of the correct option; -1 for non-MCQ. */
  correctIdx: number;
  /** Current permutation: shuffledPos[i] = original index at new position i. */
  perm: number[];
}

function prepare(item: any): Prepared {
  if (!isMCQ(item?.question_type || item?.type)) {
    return { item, isMcq: false, entries: [], correctIdx: -1, perm: [] };
  }
  const entries = readEntries(item.choices ?? item.options);
  if (entries.length < 2) {
    return { item, isMcq: false, entries, correctIdx: -1, perm: [] };
  }
  const correctIdx = resolveCorrectIndex(
    entries,
    item.correct_answer ?? item.correctAnswer,
  );
  // Independent Fisher-Yates over indices — the correct option is tracked by
  // its original index, not by string equality, so it cannot be "lost".
  const perm = fisherYates(entries.map((_, i) => i));
  return {
    item,
    isMcq: true,
    entries,
    correctIdx: correctIdx >= 0 ? correctIdx : 0,
    perm,
  };
}

/** New correct-answer letter for a Prepared MCQ. */
function correctLetter(p: Prepared): string {
  const pos = p.perm.indexOf(p.correctIdx);
  return LETTERS[pos] ?? "A";
}

/** Materialise a Prepared MCQ back into an item with shuffled choices. */
function materialise(p: Prepared): any {
  if (!p.isMcq) return p.item;
  const newChoices: Record<string, string> = {};
  p.perm.forEach((origIdx, newPos) => {
    const letter = LETTERS[newPos];
    if (letter) newChoices[letter] = p.entries[origIdx][1];
  });
  const letter = correctLetter(p);
  return {
    ...p.item,
    choices: newChoices,
    options: undefined,
    correct_answer: letter,
    correctAnswer: letter,
  };
}

// ---------- distribution rebalancing --------------------------------------

/**
 * Rotate a Prepared MCQ's permutation so that the correct option lands on
 * `targetLetter`. This is a legal transformation: the option set is
 * unchanged, only their positions rotate — every question still has 4
 * distinct choices and one correct answer.
 */
function rotateCorrectTo(p: Prepared, targetLetter: string): void {
  const targetPos = LETTERS.indexOf(targetLetter as any);
  if (targetPos < 0) return;
  const currentPos = p.perm.indexOf(p.correctIdx);
  if (currentPos < 0 || currentPos === targetPos) return;
  // Swap the two positions — keeps all options, changes only where correct is.
  [p.perm[currentPos], p.perm[targetPos]] = [
    p.perm[targetPos],
    p.perm[currentPos],
  ];
}

/**
 * Rebalance letters across a set of prepared MCQs so no letter exceeds the
 * fair cap. Uses a greedy pass: while some letter is over-cap, pick a
 * question currently assigned to that letter and rotate its correct option
 * into the most under-represented letter.
 */
function buildBalancedTargetLetters(letters: readonly string[], n: number): string[] {
  const targets: string[] = [];
  const base = Math.floor(n / letters.length);
  const extra = n % letters.length;

  letters.forEach((letter, index) => {
    const count = base + (index < extra ? 1 : 0);
    for (let i = 0; i < count; i++) targets.push(letter);
  });

  // Randomize the balanced pool, retrying to avoid visible answer-key runs.
  const hasLongRun = (arr: string[]) =>
    arr.some((letter, index) => index >= 2 && letter === arr[index - 1] && letter === arr[index - 2]);

  let best = fisherYates(targets);
  for (let attempt = 0; attempt < 24 && hasLongRun(best); attempt++) {
    const candidate = fisherYates(targets);
    if (!hasLongRun(candidate)) return candidate;
    const longestRun = (arr: string[]) => {
      let max = 1;
      let run = 1;
      for (let i = 1; i < arr.length; i++) {
        run = arr[i] === arr[i - 1] ? run + 1 : 1;
        max = Math.max(max, run);
      }
      return max;
    };
    if (longestRun(candidate) < longestRun(best)) best = candidate;
  }

  return best;
}

function rebalance(preps: Prepared[]): void {
  const mcqs = preps.filter((p) => p.isMcq && p.entries.length >= 2);
  const n = mcqs.length;
  if (n < 4) return;

  const optionCount = Math.min(4, Math.max(...mcqs.map((p) => p.entries.length)));
  const letters = LETTERS.slice(0, optionCount);

  // Final key compilation is intentionally distribution-aware: every MCQ was
  // independently shuffled first, then the correct option is moved to a
  // randomized balanced target letter. This prevents both aggregate skew
  // (e.g. 20 A's) and visible long runs while preserving each item's options.
  const targets = buildBalancedTargetLetters(letters, n);
  mcqs.forEach((p, index) => rotateCorrectTo(p, targets[index]));
}

// ---------- public API ----------------------------------------------------

export interface ShuffleResult {
  items: any[];
  /** { "1": "B", "2": "A", ... } — MCQ items only, keyed by question number. */
  answerKey: Record<string, string>;
  distribution: Record<string, number>;
  reshuffleAttempts: number;
}

export function shuffleExamChoices(items: any[]): ShuffleResult {
  const safeItems = Array.isArray(items) ? items : [];

  // Attempt several random shuffles; if still clustered, fall through to the
  // deterministic rebalancer so the answer key is ALWAYS well-distributed.
  let preps: Prepared[] = [];
  let attempts = 0;
  const MAX_RANDOM_TRIES = 8;

  const clustered = (): boolean => {
    const mcqs = preps.filter((p) => p.isMcq);
    if (mcqs.length < 8) return false;
    const c: Record<string, number> = {};
    for (const p of mcqs) {
      const L = correctLetter(p);
      c[L] = (c[L] || 0) + 1;
    }
    const uniq = Math.max(1, Object.keys(c).length);
    // Stricter cluster detection: allow only a small overshoot above fair share
    // so the deterministic rebalancer is invoked whenever letters skew.
    const cap = Math.max(3, Math.ceil(mcqs.length / uniq) + 1);
    return Object.values(c).some((v) => v > cap);
  };

  do {
    preps = safeItems.map(prepare);
    attempts++;
  } while (clustered() && attempts < MAX_RANDOM_TRIES);

  // Deterministic guarantee — always applied as a safety net.
  rebalance(preps);

  const outItems = preps.map(materialise);

  const answerKey: Record<string, string> = {};
  const distribution: Record<string, number> = {};
  preps.forEach((p, i) => {
    if (!p.isMcq) return;
    const L = correctLetter(p);
    answerKey[String(i + 1)] = L;
    distribution[L] = (distribution[L] || 0) + 1;
  });

  return {
    items: outItems,
    answerKey,
    distribution,
    reshuffleAttempts: attempts - 1,
  };
}
