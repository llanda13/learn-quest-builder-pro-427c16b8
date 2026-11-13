import { describe, expect, it } from "vitest";
import { normalizeKnowledgeDimension } from "./knowledge";

describe("normalizeKnowledgeDimension", () => {
  it.each([
    ["Factual", "factual"],
    ["CONCEPTUAL", "conceptual"],
    ["Procedural", "procedural"],
    ["Metacognitive", "metacognitive"],
  ])("normalizes %s to %s", (input, expected) => {
    expect(normalizeKnowledgeDimension(input)).toBe(expected);
  });

  it("trims surrounding whitespace and case-normalizes", () => {
    expect(normalizeKnowledgeDimension("  mEtAcOgNiTiVe \t")).toBe("metacognitive");
  });

  it.each([null, undefined, "", "   ", "Remembering", "Bloom's Understanding", 42, {}])(
    "rejects invalid knowledge dimension input: %s",
    (input) => {
      expect(() => normalizeKnowledgeDimension(input)).toThrow(/knowledge dimension/i);
    }
  );
});
