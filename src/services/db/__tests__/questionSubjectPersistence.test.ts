import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const rows: Record<string, any>[] = [];
  const subjects = [
    {
      id: "subject-id-101",
      code: "ITPC 101",
      description: "Computer System Servicing",
      category_name: "Major",
      specialization_name: "IT",
    },
    {
      id: "subject-id-110",
      code: "ITPC 110",
      description: "Computer Networking 2 - Advance",
      category_name: "Major",
      specialization_name: "IT",
    },
  ];

  const from = vi.fn(() => {
    let action: "select" | "insert" | "update" = "select";
    let payload: any;
    let id: string | undefined;

    const resolve = () => {
      if (action === "insert") {
        const inserted = (Array.isArray(payload) ? payload : [payload]).map((row, index) => {
          const saved = { ...row, id: `test-question-${rows.length + index + 1}` };
          rows.push(saved);
          return saved;
        });
        return { data: Array.isArray(payload) ? inserted : inserted[0], error: null };
      }

      const current = rows.find((row) => row.id === id);
      if (action === "update" && current) {
        Object.assign(current, payload);
        return { data: current, error: null };
      }
      return { data: current || null, error: current ? null : new Error("Question not found") };
    };

    const builder: any = {
      select: () => builder,
      eq: (_field: string, value: string) => {
        id = value;
        return builder;
      },
      insert: (value: any) => {
        action = "insert";
        payload = value;
        return builder;
      },
      update: (value: any) => {
        action = "update";
        payload = value;
        return builder;
      },
      single: async () => resolve(),
      then: (onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) =>
        Promise.resolve(resolve()).then(onFulfilled, onRejected),
    };
    return builder;
  });

  return {
    rows,
    subjects,
    from,
    getUser: vi.fn(async () => ({ data: { user: { id: "test-user" } } })),
  };
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: mocks.getUser },
    from: mocks.from,
  },
}));

vi.mock("@/services/db/academicHierarchy", () => ({
  AcademicHierarchy: {
    getSubjects: vi.fn(async () => mocks.subjects),
  },
}));

import { Questions } from "@/services/db/questions";

const question = (subjectCode: string, subjectDescription: string, subjectId: string) => ({
  question_text: `Explain how ${subjectCode} applies to this test scenario.`,
  question_type: "mcq" as const,
  choices: { A: "Correct", B: "Incorrect" },
  correct_answer: "A",
  bloom_level: "understanding",
  difficulty: "easy",
  topic: "Hardware Basic",
  category: "Major",
  specialization: "IT",
  subject: `${subjectCode} - ${subjectDescription}`,
  subject_code: subjectCode,
  subject_description: subjectDescription,
  knowledge_dimension: "Conceptual",
  metadata: { academic_subject_id: subjectId },
  created_by: "teacher" as const,
});

describe("canonical question persistence", () => {
  beforeEach(() => {
    mocks.rows.length = 0;
    mocks.from.mockClear();
    mocks.getUser.mockClear();
  });

  it.each([
    ["ITPC 101", "Computer System Servicing", "subject-id-101"],
    ["ITPC 110", "Computer Networking 2 - Advance", "subject-id-110"],
  ])("creates a question with the registered metadata for %s", async (code, description, id) => {
    const saved = await Questions.create(question(code, description, id));

    expect(saved).toMatchObject({
      category: "Major",
      specialization: "IT",
      subject_code: code,
      subject_description: description,
      topic: "Hardware Basic",
      metadata: { academic_subject_id: id },
    });
  });

  it("rejects unknown and conflicting subjects before insertion", async () => {
    await expect(Questions.create(question("ITPC 999", "Unknown course", "unknown-id")))
      .rejects.toThrow("is not registered");
    await expect(Questions.create(question(
      "ITPC 101",
      "Computer Networking 2 - Advance",
      "subject-id-101",
    ))).rejects.toThrow("does not match subject description");

    expect(mocks.rows).toHaveLength(0);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("bulk imports registered metadata and preserves the academic subject UUID", async () => {
    const [saved] = await Questions.bulkInsert([
      question("ITPC 110", "Computer Networking 2 - Advance", "subject-id-110"),
    ]);

    expect(saved).toMatchObject({
      subject_code: "ITPC 110",
      subject_description: "Computer Networking 2 - Advance",
      topic: "Hardware Basic",
      metadata: { academic_subject_id: "subject-id-110" },
    });
  });

  it("normalizes knowledge dimensions before insert and rejects missing or unsupported values", async () => {
    const saved = await Questions.create({
      ...question("ITPC 101", "Computer System Servicing", "subject-id-101"),
      knowledge_dimension: "  FACTUAL ",
    });

    expect(saved.knowledge_dimension).toBe("factual");
    await expect(Questions.create({
      ...question("ITPC 101", "Computer System Servicing", "subject-id-101"),
      knowledge_dimension: "",
    })).rejects.toThrow(/knowledge dimension/i);
    await expect(Questions.bulkInsert([{
      ...question("ITPC 101", "Computer System Servicing", "subject-id-101"),
      knowledge_dimension: "Remembering",
    }])).rejects.toThrow(/knowledge dimension/i);
    expect(mocks.rows).toHaveLength(1);
  });

  it("keeps an existing assignment on ordinary edits and rejects reassignment", async () => {
    const [created] = await Questions.bulkInsert([
      question("ITPC 101", "Computer System Servicing", "subject-id-101"),
    ]);

    const edited = await Questions.update(created.id, {
      question_text: "Explain the changed scenario without changing its subject.",
    });
    expect(edited).toMatchObject({
      subject_code: "ITPC 101",
      subject_description: "Computer System Servicing",
      metadata: { academic_subject_id: "subject-id-101" },
    });

    await expect(Questions.update(created.id, { subject_code: "ITPC 110" }))
      .rejects.toThrow("cannot be changed through ordinary question editing");
    expect(mocks.rows[0]).toMatchObject({
      subject_code: "ITPC 101",
      metadata: { academic_subject_id: "subject-id-101" },
    });
  });
});
