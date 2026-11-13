import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  getMcqChoiceValidationReasons,
  validateMcqChoices,
} from "./questionValidation.ts";

const arrayChoices = [
  "Central processing unit",
  "Random access memory",
  "Solid-state drive",
  "Power supply unit",
];

Deno.test("accepts exactly four valid MCQ choices supplied as an array", () => {
  assertEquals(getMcqChoiceValidationReasons(arrayChoices, "A"), []);
});

Deno.test("accepts exactly four valid MCQ choices supplied as an A-D object", () => {
  assertEquals(getMcqChoiceValidationReasons({
    A: "Central processing unit",
    B: "Random access memory",
    C: "Solid-state drive",
    D: "Power supply unit",
  }, "C"), []);
});

Deno.test("rejects missing and empty MCQ choices", () => {
  assertEquals(
    getMcqChoiceValidationReasons(["One", "Two", "Three", ""], "A"),
    ["quality:mcq_empty_choice"],
  );
  assertEquals(
    getMcqChoiceValidationReasons(["One", "Two", "Three"], "A"),
    ["quality:mcq_choice_count(expected=4,got=3)"],
  );
});

Deno.test("rejects duplicate MCQ choices", () => {
  assertEquals(
    getMcqChoiceValidationReasons(["One", "Two", "Two", "Four"], "A"),
    ["quality:mcq_duplicate_options"],
  );
});

Deno.test("rejects an MCQ answer key that does not identify a choice", () => {
  assertEquals(
    getMcqChoiceValidationReasons(arrayChoices, "E"),
    ["quality:mcq_correct_not_in_options"],
  );
});

Deno.test("accepts array choices at the generation gates and normalizes them to A-D", () => {
  assertEquals(validateMcqChoices(arrayChoices, "A"), {
    choices: {
      A: "Central processing unit",
      B: "Random access memory",
      C: "Solid-state drive",
      D: "Power supply unit",
    },
    reasons: [],
  });
});

Deno.test("accepts keyed choices at the generation gates in A-D order", () => {
  assertEquals(validateMcqChoices({
    D: "Power supply unit",
    B: "Random access memory",
    A: "Central processing unit",
    C: "Solid-state drive",
  }, "C"), {
    choices: {
      A: "Central processing unit",
      B: "Random access memory",
      C: "Solid-state drive",
      D: "Power supply unit",
    },
    reasons: [],
  });
});

Deno.test("generation-gate validation rejects missing, empty, duplicate, and invalid-answer choices", () => {
  assertEquals(validateMcqChoices(["One", "Two", "Three"], "A").choices, null);
  assertEquals(validateMcqChoices(["One", "Two", "Three", ""], "A").choices, null);
  assertEquals(validateMcqChoices(["One", "Two", "Two", "Four"], "A").choices, null);
  assertEquals(validateMcqChoices(arrayChoices, "E").choices, null);
  assertEquals(validateMcqChoices({ A: "One", B: "Two", C: "Three" }, "A").choices, null);
  assertEquals(validateMcqChoices({ A: "One", B: "Two", C: "Three", D: "" }, "A").choices, null);
  assertEquals(validateMcqChoices({ A: "One", B: "Two", C: "Two", D: "Four" }, "A").choices, null);
  assertEquals(validateMcqChoices({
    A: "Central processing unit",
    B: "Random access memory",
    C: "Solid-state drive",
    D: "Power supply unit",
  }, "E").choices, null);
});

Deno.test("repair-gate validation preserves the minimum option length", () => {
  assertEquals(validateMcqChoices(
    ["Option longer than five", "Option longer than five B", "Option longer than five C", "Option longer than five D"],
    "A",
    6,
  ).reasons, []);
  assertEquals(validateMcqChoices(["Short", "Option longer than five B", "Option longer than five C", "Option longer than five D"], "A", 6).choices, null);
});
