import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSubjects: vi.fn(),
  from: vi.fn(),
  tosRecord: null as Record<string, string> | null,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: mocks.from },
}));

vi.mock("@/services/db/academicHierarchy", () => ({
  AcademicHierarchy: {
    getSubjects: mocks.getSubjects,
  },
}));

import {
  resolveGeneratedQuestionSubject,
  resolveSubjectMetadata,
} from "../subjectMetadataResolver";

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

describe("resolveSubjectMetadata", () => {
  beforeEach(() => {
    mocks.getSubjects.mockReset();
    mocks.getSubjects.mockResolvedValue(subjects);
    mocks.tosRecord = {
      subject_no: "ITPC 101",
      course: "Computer System Servicing",
      description: "Computer System Servicing",
    };
    mocks.from.mockImplementation(() => {
      const builder = {
        select: () => builder,
        eq: () => builder,
        single: async () => ({ data: mocks.tosRecord, error: null }),
      };
      return builder;
    });
  });

  it("uses the registered subject code rather than the question topic", async () => {
    await expect(resolveSubjectMetadata({
      subject_code: "itpc 101",
      subject_description: "Computer System Servicing",
      topic: "Hardware Basic",
      category: "Major",
      specialization: "IT",
    })).resolves.toEqual({
      academic_subject_id: "subject-id-101",
      category: "Major",
      specialization: "IT",
      subject_code: "ITPC 101",
      subject_description: "Computer System Servicing",
    });

    expect(mocks.getSubjects).toHaveBeenCalled();
  });

  it("keeps ITPC 101 and ITPC 110 mapped to their own official records", async () => {
    await expect(resolveSubjectMetadata({ subject_code: "ITPC 101", topic: "Hardware Basic" }))
      .resolves.toMatchObject({ subject_code: "ITPC 101", subject_description: "Computer System Servicing" });
    await expect(resolveSubjectMetadata({ subject_code: "ITPC 110", topic: "Hardware Basic" }))
      .resolves.toMatchObject({ subject_code: "ITPC 110", subject_description: "Computer Networking 2 - Advance" });
  });

  it("rejects unregistered subjects without deriving a code from the topic", async () => {
    mocks.getSubjects.mockResolvedValue([]);

    await expect(resolveSubjectMetadata({ topic: "Hardware Basic" }))
      .rejects.toThrow('Subject "Hardware Basic" is not registered');
  });

  it("rejects subject code and official description conflicts", async () => {
    await expect(resolveSubjectMetadata({
      subject_code: "ITPC 101",
      subject_description: "Computer Networking 2 - Advance",
    })).rejects.toThrow('does not match subject description');
  });

  it("uses an explicitly selected academic subject UUID to disambiguate duplicate codes", async () => {
    mocks.getSubjects.mockResolvedValue([
      ...subjects,
      { ...subjects[0], id: "subject-id-101-other", category_name: "Minor", specialization_name: "GE" },
    ]);

    await expect(resolveSubjectMetadata({
      academic_subject_id: "subject-id-101-other",
      subject_code: "ITPC 101",
      subject_description: "Computer System Servicing",
      category: "Minor",
      specialization: "GE",
    })).resolves.toMatchObject({
      academic_subject_id: "subject-id-101-other",
      category: "Minor",
    });
  });

  it("rejects duplicate subject codes without enough registered metadata to disambiguate", async () => {
    mocks.getSubjects.mockResolvedValue([
      ...subjects,
      { ...subjects[0], id: "subject-id-101-other", category_name: "Minor", specialization_name: "GE" },
    ]);

    await expect(resolveSubjectMetadata({ subject_code: "ITPC 101" }))
      .rejects.toThrow("matches multiple academic subjects");
  });

  it("uses the registered TOS subject and rejects conflicting generated subject metadata", async () => {
    await expect(resolveGeneratedQuestionSubject({
      subject_code: "ITPC 110",
    }, "tos-101")).rejects.toThrow('conflicts with TOS subject "ITPC 101"');
  });

  it("rejects a TOS that does not contain a registered subject code", async () => {
    mocks.tosRecord = { subject_no: "", course: "", description: "" };

    await expect(resolveGeneratedQuestionSubject({}, "tos-missing"))
      .rejects.toThrow("has no registered subject code");
  });
});
