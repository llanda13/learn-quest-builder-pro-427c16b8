import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: mocks.toast }),
}));

vi.mock("@/hooks/useAcademicHierarchy", () => ({
  useAcademicHierarchy: () => ({
    categories: [{ id: "category-major", name: "Major" }],
    getSpecializations: (categoryId?: string) =>
      categoryId === "category-major" ? [{ id: "specialization-it", name: "IT" }] : [],
    getSubjects: (specializationId?: string) =>
      specializationId === "specialization-it"
        ? [
            {
              id: "subject-101",
              specialization_id: "specialization-it",
              code: "ITPC 101",
              description: "Computer System Servicing",
            },
            {
              id: "subject-110",
              specialization_id: "specialization-it",
              code: "ITPC 110",
              description: "Computer Networking 2 - Advance",
            },
          ]
        : [],
  }),
}));

vi.mock("@/services/db/questions", () => ({
  Questions: { create: mocks.create },
}));

import { QuestionBankForm } from "./QuestionBankForm";

describe("QuestionBankForm", () => {
  beforeEach(() => {
    mocks.create.mockReset();
    mocks.toast.mockReset();
  });

  it.each([
    ["ITPC 101", "Computer System Servicing", "subject-101"],
    ["ITPC 110", "Computer Networking 2 - Advance", "subject-110"],
  ])("saves the selected metadata for %s and keeps topic separate", async (code, description, id) => {
    mocks.create.mockResolvedValue({});
    const user = userEvent.setup();
    const onSuccess = vi.fn();
    render(<QuestionBankForm onSuccess={onSuccess} />);

    await user.click(screen.getByRole("combobox", { name: "Category" }));
    await user.click(screen.getByRole("option", { name: "Major" }));
    await user.click(screen.getByRole("combobox", { name: "Specialization" }));
    await user.click(screen.getByRole("option", { name: "IT" }));
    await user.click(screen.getByRole("combobox", { name: "Subject Code" }));
    await user.click(screen.getByRole("option", { name: `${code} - ${description}` }));

    await user.click(screen.getByRole("combobox", { name: "Topic" }));
    await user.click(screen.getByRole("option", { name: "System Design" }));
    await user.type(screen.getByLabelText("Question Text"), "Which system design method is applied here?");

    const choices = screen.getAllByPlaceholderText(/^Choice [A-D]$/);
    await user.type(choices[0], "Correct choice");
    await user.type(choices[1], "Distractor one");
    await user.type(choices[2], "Distractor two");
    await user.type(choices[3], "Distractor three");

    await user.click(screen.getByRole("combobox", { name: "Bloom's Level" }));
    await user.click(screen.getByRole("option", { name: "Remembering" }));
    await user.click(screen.getByRole("combobox", { name: "Difficulty" }));
    await user.click(screen.getByRole("option", { name: "Easy" }));
    await user.click(screen.getByRole("combobox", { name: "Knowledge Dimension" }));
    await user.click(screen.getByRole("option", { name: "Factual" }));
    await user.click(screen.getByRole("combobox", { name: "Correct Answer" }));
    await user.click(screen.getByRole("option", { name: "A - Correct choice" }));
    await user.click(screen.getByRole("button", { name: "Add Question" }));

    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1));
    const [payload] = mocks.create.mock.calls[0];
    expect(payload).toMatchObject({
      category: "Major",
      specialization: "IT",
      subject_code: code,
      subject_description: description,
      topic: "System Design",
      metadata: { academic_subject_id: id },
    });
    expect(onSuccess).toHaveBeenCalledOnce();
  }, 30000);
});
