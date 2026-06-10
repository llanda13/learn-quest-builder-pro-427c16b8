import { useMemo } from "react";

export interface RawTestItem {
  question_text?: string;
  question?: string;
  question_type?: string;
  type?: string;
  choices?: Record<string, string> | string[];
  options?: string[];
  correct_answer?: string | number;
  correctAnswer?: string | number;
  points?: number;
  difficulty?: string;
  bloom_level?: string;
  topic?: string;
}

export interface RawTest {
  id?: string;
  title?: string;
  subject?: string;
  course?: string;
  year_section?: string;
  exam_period?: string;
  school_year?: string;
  semester?: string;
  time_limit?: number;
  instructions?: string;
  items?: RawTestItem[];
  prepared_by?: string;
}

export type SectionKind = "mcq" | "true_false" | "fill_blank" | "essay";

export interface RenderItem {
  number: number;
  text: string;
  points: number;
  correctAnswer: string;
  options: { key: string; text: string }[]; // populated for mcq only
}

export interface RenderSection {
  kind: SectionKind;
  label: string; // e.g. "TEST I. MULTIPLE CHOICE"
  title: string;
  instruction: string;
  items: RenderItem[];
}

export interface ExamRenderModel {
  testId: string;
  title: string;
  subject: string;
  course: string;
  examPeriod: string;
  schoolYear: string;
  semester: string;
  timeLimit?: number;
  instructions: string;
  preparedBy?: string;
  college?: string;
  totalPoints: number;
  totalQuestions: number;
  sections: RenderSection[];
  answerKey: { number: number; answer: string }[];
  showAnswerKey: boolean;
}

const DEFAULT_INSTRUCTIONS =
  "Make sure your mobile phone is switched off and place it at the front together with any bags, books, and etc. If you have a question or need more papers, raise your hand and ask the proctor. Keep your eyes on your own paper. Remember, copying is cheating! Stop writing immediately when the proctor says it is the end of the exam. You must remain silent until after you have exited the room.";

function classify(type?: string): SectionKind | null {
  const t = (type || "").toLowerCase();
  if (t === "mcq" || t === "multiple-choice" || t === "multiple_choice") return "mcq";
  if (t === "true_false" || t === "true-false" || t === "truefalse") return "true_false";
  if (
    t === "short_answer" ||
    t === "fill-blank" ||
    t === "fill_blank" ||
    t === "identification"
  )
    return "fill_blank";
  if (t === "essay") return "essay";
  return null;
}

function toRoman(num: number): string {
  const map: [number, string][] = [
    [10, "X"],
    [9, "IX"],
    [5, "V"],
    [4, "IV"],
    [1, "I"],
  ];
  let result = "";
  let n = num;
  for (const [value, symbol] of map) {
    while (n >= value) {
      result += symbol;
      n -= value;
    }
  }
  return result;
}

function buildOptions(item: RawTestItem): { key: string; text: string }[] {
  const choices = item.choices || item.options;
  if (!choices) return [];
  if (typeof choices === "object" && !Array.isArray(choices)) {
    return ["A", "B", "C", "D", "E"]
      .filter((k) => (choices as Record<string, string>)[k] != null)
      .map((k) => ({ key: k, text: String((choices as Record<string, string>)[k]) }));
  }
  if (Array.isArray(choices)) {
    return choices.map((text, idx) => ({
      key: String.fromCharCode(65 + idx),
      text: String(text),
    }));
  }
  return [];
}

const SECTION_META: Record<SectionKind, { title: string; instruction: string }> = {
  mcq: {
    title: "MULTIPLE CHOICE",
    instruction:
      "Direction: Read and understand each statement and select the best letter to the correct number",
  },
  true_false: {
    title: "TRUE OR FALSE",
    instruction:
      "Direction: Read and understand each statement and write TRUE if the statement is correct, and write FALSE if the statement is wrong.",
  },
  fill_blank: {
    title: "FILL IN THE BLANK",
    instruction:
      "Direction: Read and understand each statement and provide the correct word/s in the blank space in every statement.",
  },
  essay: {
    title: "ESSAY",
    instruction:
      "Direction: Answer the following questions in complete sentences. Provide clear and concise explanations.",
  },
};

export function buildExamRenderModel(
  test: RawTest | null | undefined,
  opts: { college?: string | null; showAnswerKey?: boolean } = {},
): ExamRenderModel {
  const items = Array.isArray(test?.items) ? (test!.items as RawTestItem[]) : [];
  const buckets: Record<SectionKind, RawTestItem[]> = {
    mcq: [],
    true_false: [],
    fill_blank: [],
    essay: [],
  };
  for (const it of items) {
    const k = classify(it.question_type || it.type);
    if (k) buckets[k].push(it);
  }

  const order: SectionKind[] = ["mcq", "true_false", "fill_blank", "essay"];
  const sections: RenderSection[] = [];
  const answerKey: { number: number; answer: string }[] = [];
  let counter = 1;
  let testIdx = 1;
  for (const kind of order) {
    const raw = buckets[kind];
    if (raw.length === 0) continue;
    const meta = SECTION_META[kind];
    const renderItems: RenderItem[] = raw.map((it) => {
      const number = counter++;
      const ans = it.correct_answer ?? it.correctAnswer ?? "—";
      const item: RenderItem = {
        number,
        text: String(it.question_text || it.question || ""),
        points: it.points || 1,
        correctAnswer: String(ans),
        options: kind === "mcq" ? buildOptions(it) : [],
      };
      answerKey.push({ number, answer: item.correctAnswer });
      return item;
    });
    sections.push({
      kind,
      label: `TEST ${toRoman(testIdx)}. ${meta.title}`,
      title: meta.title,
      instruction: meta.instruction,
      items: renderItems,
    });
    testIdx++;
  }

  const totalPoints = items.reduce((s, it) => s + (it.points || 1), 0);

  return {
    testId: test?.id || "",
    title: test?.title || "Examination",
    subject: test?.subject || "",
    course: test?.course || "",
    examPeriod: test?.exam_period || "",
    schoolYear: test?.school_year || "",
    semester: test?.semester || "",
    timeLimit: test?.time_limit,
    instructions: test?.instructions || DEFAULT_INSTRUCTIONS,
    preparedBy: test?.prepared_by,
    college: opts.college || undefined,
    totalPoints,
    totalQuestions: items.length,
    sections,
    answerKey,
    showAnswerKey: !!opts.showAnswerKey,
  };
}

export function useExamRenderModel(
  test: RawTest | null | undefined,
  opts: { college?: string | null; showAnswerKey?: boolean } = {},
): ExamRenderModel {
  return useMemo(
    () => buildExamRenderModel(test, opts),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [test?.id, test?.items, test?.title, test?.subject, test?.course, test?.exam_period, test?.school_year, test?.semester, test?.instructions, opts.college, opts.showAnswerKey],
  );
}
