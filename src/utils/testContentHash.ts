/**
 * Deterministic content fingerprint for a generated Test Questionnaire.
 * Used by the Expert Validation workflow to optionally reuse an existing
 * validation record when a newly-generated TQ has IDENTICAL content,
 * order, and answer key as an already-validated TQ.
 *
 * Non-cryptographic — this is a dedup key, not a security primitive.
 */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const keys = Object.keys(value as Record<string, unknown>).sort();
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${stableStringify((value as any)[k])}`)
    .join(",")}}`;
}

function fnv1a(str: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return ("00000000" + h.toString(16)).slice(-8);
}

function normalizeItem(item: any, index: number) {
  const q = String(item?.question_text ?? item?.question ?? "").trim().toLowerCase();
  const type = String(item?.question_type ?? item?.type ?? "").toLowerCase();
  let choices: string[] = [];
  if (Array.isArray(item?.choices)) {
    choices = item.choices.map((c: any) => String(c ?? "").trim().toLowerCase());
  } else if (item?.choices && typeof item.choices === "object") {
    choices = Object.keys(item.choices)
      .sort()
      .map((k) => `${k}:${String(item.choices[k] ?? "").trim().toLowerCase()}`);
  }
  const answer = String(item?.correct_answer ?? item?.correctAnswer ?? "").trim().toLowerCase();
  return { i: index, q, type, choices, answer };
}

export function computeTestContentHash(items: any[], answerKey?: any): string {
  const normalized = Array.isArray(items) ? items.map(normalizeItem) : [];
  const akShape = Array.isArray(answerKey)
    ? answerKey.map((a: any) => String(a?.correct_answer ?? a).trim().toLowerCase())
    : answerKey && typeof answerKey === "object"
      ? Object.keys(answerKey)
          .sort()
          .map((k) => `${k}:${String((answerKey as any)[k]?.correct_answer ?? (answerKey as any)[k]).trim().toLowerCase()}`)
      : [];
  return fnv1a(stableStringify({ items: normalized, answerKey: akShape }));
}
