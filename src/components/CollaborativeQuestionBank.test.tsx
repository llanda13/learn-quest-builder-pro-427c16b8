import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  from: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  broadcastChange: vi.fn(),
}));

vi.mock("@/hooks/useAcademicHierarchy", () => ({
  useAcademicHierarchy: () => ({
    allSubjects: [{
      id: "subject-id-110",
      code: "ITPC 110",
      description: "Computer Networking 2 - Advance",
      category_name: "Major",
      specialization_name: "IT",
    }],
  }),
}));

vi.mock("@/hooks/useCollaborativeEditing", () => ({
  useCollaborativeEditing: () => ({
    users: [],
    isConnected: true,
    currentUser: null,
    broadcastChange: mocks.broadcastChange,
  }),
}));

vi.mock("@/hooks/useRealtime", () => ({ useRealtime: vi.fn() }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: "test-user" } } })) },
    from: mocks.from,
  },
}));

vi.mock("@/services/db/questions", () => ({
  Questions: { create: mocks.create, update: vi.fn() },
}));

vi.mock("sonner", () => ({
  toast: { error: mocks.toastError, success: mocks.toastSuccess, info: vi.fn() },
}));

import { CollaborativeQuestionBank } from "./CollaborativeQuestionBank";

afterEach(cleanup);

describe("CollaborativeQuestionBank subject validation", () => {
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
    mocks.toastSuccess.mockReset();
  });

  it("creates with the selected registered subject and UUID metadata", async () => {
    mocks.create.mockResolvedValue({
      id: "new-question",
      question_text: "Explain the network routing scenario.",
      topic: "Networking",
    });
    const user = userEvent.setup();
    render(<CollaborativeQuestionBank />);

    await user.click(await screen.findByRole("button", { name: /Add Question/i }));
    const subjectSection = screen.getByText("Registered subject").parentElement;
    expect(subjectSection).not.toBeNull();
    await user.click(within(subjectSection as HTMLElement).getByRole("combobox"));
    await user.click(await screen.findByRole("option", {
      name: "ITPC 110 - Computer Networking 2 - Advance",
    }));
    await user.type(screen.getByPlaceholderText("Enter topic"), "Networking");
    await user.type(screen.getByPlaceholderText("Enter your question"), "Explain the network routing scenario.");
    await user.click(screen.getByRole("button", { name: /Save Question/i }));

    await waitFor(() => expect(mocks.create).toHaveBeenCalledOnce());
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      category: "Major",
      specialization: "IT",
      subject_code: "ITPC 110",
      subject_description: "Computer Networking 2 - Advance",
      metadata: { academic_subject_id: "subject-id-110" },
    }));
  }, 30000);

  it("surfaces canonical validation errors instead of claiming an incomplete save succeeded", async () => {
    mocks.create.mockRejectedValue(new Error("No registered academic subject was selected."));
    const user = userEvent.setup();
    render(<CollaborativeQuestionBank />);

    await user.click(await screen.findByRole("button", { name: /Add Question/i }));
    await user.type(screen.getByPlaceholderText("Enter topic"), "Networking");
    await user.type(screen.getByPlaceholderText("Enter your question"), "Explain the network routing scenario.");
    await user.click(screen.getByRole("button", { name: /Save Question/i }));

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith(
      "No registered academic subject was selected.",
    ));
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
  }, 30000);
});
