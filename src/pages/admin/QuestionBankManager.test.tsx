import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  from: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@/hooks/useAcademicHierarchy", () => ({
  useAcademicHierarchy: () => ({
    categories: [{ id: "category-major", name: "Major" }],
    allSpecializations: [{ id: "specialization-it", name: "IT", category_id: "category-major" }],
    allSubjects: [{
      id: "subject-id-101",
      code: "ITPC 101",
      description: "Computer System Servicing",
      specialization_id: "specialization-it",
    }],
    getSpecializations: (categoryId?: string) =>
      categoryId === "category-major" ? [{ id: "specialization-it", name: "IT" }] : [],
    getSubjects: (specializationId?: string) =>
      specializationId === "specialization-it"
        ? [{
            id: "subject-id-101",
            code: "ITPC 101",
            description: "Computer System Servicing",
            specialization_id: "specialization-it",
          }]
        : [],
  }),
}));

vi.mock("@/hooks/useUserRole", () => ({
  useUserRole: () => ({ isAdmin: true }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: mocks.from },
}));

vi.mock("@/services/db/questions", () => ({
  Questions: { create: mocks.create, update: vi.fn(), delete: vi.fn() },
}));

vi.mock("sonner", () => ({
  toast: { error: mocks.toastError, success: vi.fn() },
}));

vi.mock("@/components/admin/QuestionBankReports", () => ({
  QuestionBankReports: () => null,
}));

vi.mock("@/components/admin/FilterManagement", () => ({
  FilterManagement: () => null,
}));

import QuestionBankManager from "./QuestionBankManager";
import { matchesSubjectCodeFilter } from "@/utils/subjectCode";

function renderManager() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <QuestionBankManager />
    </QueryClientProvider>,
  );
}

describe("Admin Question Bank subject validation", () => {
  beforeEach(() => {
    mocks.create.mockReset();
    mocks.from.mockReset();
    mocks.from.mockImplementation(() => {
      const builder: any = {
        select: () => builder,
        order: () => builder,
        then: (onFulfilled: (value: unknown) => unknown) =>
          Promise.resolve({ data: [], error: null }).then(onFulfilled),
      };
      return builder;
    });
    mocks.toastError.mockReset();
  });

  it("creates with metadata from the registered hierarchy selection", async () => {
    mocks.create.mockResolvedValue({});
    const user = userEvent.setup();
    renderManager();

    await user.click(await screen.findByRole("button", { name: /Add Question/i }));
    const form = screen.getByText("Create New Question").closest(".rounded-lg");
    expect(form).not.toBeNull();
    const formSelectors = within(form as HTMLElement).getAllByRole("combobox");
    await user.click(formSelectors[0]);
    await user.click(await screen.findByRole("option", { name: "Major" }));
    await user.click(formSelectors[1]);
    await user.click(await screen.findByRole("option", { name: "IT" }));
    await user.click(formSelectors[2]);
    await user.click(await screen.findByRole("option", { name: "ITPC 101" }));

    await user.type(screen.getByPlaceholderText("Enter question text..."), "What does this registered subject cover?");
    await user.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => expect(mocks.create).toHaveBeenCalledOnce());
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      category: "Major",
      specialization: "IT",
      subject_code: "ITPC 101",
      subject_description: "Computer System Servicing",
      subject: "ITPC 101 - Computer System Servicing",
      metadata: { academic_subject_id: "subject-id-101" },
    }));
  }, 30000);

  it("rejects creation when no registered subject is selected", async () => {
    const user = userEvent.setup();
    renderManager();

    await user.click(await screen.findByRole("button", { name: /Add Question/i }));
    await user.click(screen.getByRole("button", { name: "Create" }));

    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.toastError).toHaveBeenCalledWith(
      "Select a registered Category, Specialization, and Subject Code before saving.",
    );
  });
});
