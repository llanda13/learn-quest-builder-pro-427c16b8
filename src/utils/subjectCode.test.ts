import { describe, expect, it } from "vitest";
import { matchesSubjectCodeFilter, normalizeSubjectCode } from "./subjectCode";

describe("normalizeSubjectCode", () => {
  it("normalizes lowercase and surrounding whitespace", () => {
    expect(normalizeSubjectCode("  itcc 100  ")).toBe("ITCC 100");
  });

  it("handles null and undefined safely", () => {
    expect(normalizeSubjectCode(null)).toBe("");
    expect(normalizeSubjectCode(undefined)).toBe("");
  });

  it("preserves internal spacing", () => {
    expect(normalizeSubjectCode("ITCC 100")).toBe("ITCC 100");
    expect(normalizeSubjectCode("IS 201")).toBe("IS 201");
  });
});

describe("matchesSubjectCodeFilter", () => {
  it("trims and ignores casing without removing meaningful internal whitespace", () => {
    expect(matchesSubjectCodeFilter("  itpc 101 ", "ITPC 101")).toBe(true);
    expect(matchesSubjectCodeFilter("ITPC101", "ITPC 101")).toBe(false);
    expect(matchesSubjectCodeFilter(null, "ITPC 101")).toBe(false);
  });
});
