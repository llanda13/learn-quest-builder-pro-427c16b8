import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mocks = vi.hoisted(() => ({
  bulkInsert: vi.fn(),
  from: vi.fn(),
  buildTaxonomyMatrix: vi.fn(),
  toastSuccess: vi.fn(),
  importComplete: vi.fn(),
}));

vi.mock("react-dropzone", () => ({
  useDropzone: () => ({
    getRootProps: () => ({}),
    getInputProps: () => ({}),
    isDragActive: false,
  }),
}));

vi.mock("pdfjs-dist", () => ({ GlobalWorkerOptions: {} }));
vi.mock("pdfjs-dist/build/pdf.worker.min.mjs?url", () => ({ default: "worker-url" }));
vi.mock("tesseract.js", () => ({ createWorker: vi.fn(), PSM: {} }));

vi.mock("@/hooks/useAcademicHierarchy", () => ({
  useAcademicHierarchy: () => ({
    categories: [{ id: "category-major", name: "Major" }],
    allSpecializations: [{ id: "specialization-it", name: "IT", category_id: "category-major" }],
    allSubjects: [{
      id: "subject-id-110",
      code: "ITPC 110",
      description: "Computer Networking 2 - Advance",
      specialization_id: "specialization-it",
    }],
    getSpecializations: () => [{
      id: "specialization-it",
      name: "IT",
      category_id: "category-major",
    }],
    getSubjects: () => [{
      id: "subject-id-110",
      code: "ITPC 110",
      description: "Computer Networking 2 - Advance",
      specialization_id: "specialization-it",
    }],
  }),
}));

vi.mock("@/hooks/useTaxonomyClassification", () => ({
  useTaxonomyClassification: () => ({
    batchClassify: vi.fn(),
    buildTaxonomyMatrix: mocks.buildTaxonomyMatrix,
  }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: mocks.from },
}));

vi.mock("@/services/db/questions", () => ({
  Questions: { bulkInsert: mocks.bulkInsert },
}));

vi.mock("@/services/edgeFunctions", () => ({ classifyQuestions: vi.fn() }));
vi.mock("@/services/ai/classify", () => ({
  classifyBloom: vi.fn(),
  detectKnowledgeDimension: vi.fn(),
  inferDifficulty: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: mocks.toastSuccess,
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

import BulkImport from "./BulkImport";

const importFixture = [{
  question_text: "Explain the network routing scenario.",
  question_type: "mcq",
  choices: { A: "Route A", B: "Route B" },
  correct_answer: "A",
  bloom_level: "understanding",
  difficulty: "easy",
  knowledge_dimension: "conceptual",
  topic: "",
  created_by: "teacher",
  approved: false,
  needs_review: false,
  category: "Major",
  specialization: "IT",
  subject_code: "ITPC 110",
  subject_description: "Computer Networking 2 - Advance",
  metadata: { academic_subject_id: "subject-id-110" },
}];

describe("BulkImport canonical subject persistence", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.localStorage.setItem("bulk-import.step", JSON.stringify("verification"));
    window.localStorage.setItem("bulk-import.verification-data", JSON.stringify(importFixture));
    window.localStorage.setItem("bulk-import.selected-category", JSON.stringify("Major"));
    window.localStorage.setItem("bulk-import.selected-specialization", JSON.stringify("IT"));
    window.localStorage.setItem("bulk-import.selected-subject-code", JSON.stringify("ITPC 110"));

    mocks.bulkInsert.mockReset();
    mocks.bulkInsert.mockResolvedValue([]);
    mocks.buildTaxonomyMatrix.mockReset();
    mocks.toastSuccess.mockReset();
    mocks.importComplete.mockReset();
    mocks.from.mockReset();
    mocks.from.mockImplementation(() => {
      const builder: any = {
        select: () => builder,
        eq: () => builder,
        not: () => builder,
        then: (onFulfilled: (value: unknown) => unknown) =>
          Promise.resolve({ data: [], error: null }).then(onFulfilled),
      };
      return builder;
    });
  });

  it("saves the registered subject metadata and academic-subject UUID from the verified import", async () => {
    const user = userEvent.setup();
    render(<BulkImport onClose={vi.fn()} onImportComplete={mocks.importComplete} />);

    await user.click(await screen.findByRole("button", {
      name: "Save 1 Questions to Question Bank",
    }));

    await waitFor(() => expect(mocks.bulkInsert).toHaveBeenCalledOnce());
    expect(mocks.bulkInsert).toHaveBeenCalledWith([
      expect.objectContaining({
        category: "Major",
        specialization: "IT",
        subject_code: "ITPC 110",
        subject_description: "Computer Networking 2 - Advance",
        metadata: { academic_subject_id: "subject-id-110" },
      }),
    ]);
    expect(mocks.importComplete).toHaveBeenCalledOnce();
  });
});
