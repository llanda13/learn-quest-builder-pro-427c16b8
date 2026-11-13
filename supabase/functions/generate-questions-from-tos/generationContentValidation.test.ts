import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildTopicBloomPrompt,
  detectBloomFromText,
  hasMeaningfulScenarioCue,
  validateAnalyzingQuestion,
  validateApplyingQuestion,
  validateQuestionContent,
  validateTopicRelevance,
} from "./generationContentValidation.ts";

Deno.test("accepts an analyzing question with a relevant evidence-based scenario", () => {
  const stem = "A lab technician connects a USB keyboard, but the workstation records no keystrokes while the mouse works. Examine the observations and differentiate whether the keyboard or USB port is failing.";
  assertEquals(hasMeaningfulScenarioCue(stem), true);
  assertEquals(validateAnalyzingQuestion(stem).valid, true);
  assertEquals(validateQuestionContent("Input devices", stem, "Analyzing", "mcq").valid, true);
});

Deno.test("rejects analyzing questions that lack substantive scenario details", () => {
  assertEquals(
    validateAnalyzingQuestion("Analyze how keyboards and USB ports differ."),
    {
      valid: false,
      reason: "Analyzing items require a concrete case, dataset, or problem situation with relevant details",
    },
  );
  assertEquals(
    validateAnalyzingQuestion("In a scenario about keyboards, analyze their functions.").valid,
    false,
  );
  assertEquals(
    hasMeaningfulScenarioCue("Given a scenario, analyze the input devices."),
    false,
  );
  assertEquals(
    hasMeaningfulScenarioCue("A keyboard appears in a scenario; examine how it works."),
    false,
  );
  assertEquals(
    validateQuestionContent(
      "Input devices",
      "Analyze how keyboards and USB ports differ.",
      "Analyzing",
      "mcq",
    ).valid,
    false,
  );
});

Deno.test("accepts topic-specific terminology and rejects unrelated subject vocabulary", () => {
  assertEquals(
    validateTopicRelevance(
      "Input devices",
      "During a lab test, a USB keyboard is connected but no keystrokes appear on the screen.",
    ).valid,
    true,
  );
  assertEquals(
    validateTopicRelevance(
      "Input devices",
      "During a lab test, the processor overheats but the cooling fan keeps running.",
    ).valid,
    false,
  );
  assertEquals(
    validateTopicRelevance(
      "Photosynthesis",
      "A biology experiment shows reduced glucose production when the plant receives less light.",
    ).valid,
    true,
  );
  assertEquals(
    validateTopicRelevance(
      "Database normalization",
      "A customer table repeats the same address in several rows; identify the functional dependency before splitting the relation.",
    ).valid,
    true,
  );
  assertEquals(
    validateTopicRelevance(
      "Network security",
      "A firewall blocks repeated login attempts from an unknown host.",
    ).valid,
    true,
  );
  assertEquals(
    validateTopicRelevance(
      "Photosynthesis",
      "A firewall blocks repeated login attempts from an unknown host.",
    ).valid,
    false,
  );
});

Deno.test("accepts practical Applying questions and rejects recall assigned to Applying", () => {
  const applyingStem = "During a lab exercise, a user connects a USB keyboard, but the workstation records no keystrokes. Use the input settings to determine which connection the technician should test first.";
  assertEquals(validateApplyingQuestion(applyingStem).valid, true);
  assertEquals(validateQuestionContent("Input devices", applyingStem, "Applying", "mcq").valid, true);
  assertEquals(detectBloomFromText(applyingStem).level, "applying");
  assertEquals(
    validateApplyingQuestion(
      "A technician is asked to identify what a keyboard is after the workstation stops responding.",
    ).valid,
    false,
  );
  assertEquals(
    validateApplyingQuestion("Given this keyboard, use it to identify an input device."),
    {
      valid: false,
      reason: "Applying items require a concrete practical situation or problem with contextual details",
    },
  );
  assertEquals(
    validateQuestionContent(
      "Input devices",
      "A technician is asked to identify what a keyboard is after the workstation stops responding.",
      "Applying",
      "mcq",
    ).valid,
    false,
  );
});

Deno.test("classifies explicit recall as Remembering rather than Applying", () => {
  assertEquals(
    detectBloomFromText("Identify the function of a keyboard used in a computer lab."),
    { level: "remembering", score: 1 },
  );
});

Deno.test("validates topic-specific practical reasoning using terms beyond the topic label", () => {
  const examples = [
    {
      topic: "Input devices",
      bloom: "Applying",
      stem: "During a workstation test, the barcode reader returns no characters although its indicator is lit. Which connection check should a technician perform before replacing the scanner?",
    },
    {
      topic: "Photosynthesis",
      bloom: "Applying",
      stem: "In a greenhouse trial, a plant receives adequate water but its leaves get little light and measured oxygen output falls. Which condition should the grower adjust to restore photosynthesis?",
    },
    {
      topic: "Database normalization",
      bloom: "Analyzing",
      stem: "A customer table repeats one address across four rows, and changing only three rows creates conflicting addresses. Examine the functional dependency and distinguish which attribute determines the address.",
    },
  ];

  for (const example of examples) {
    assertEquals(
      validateQuestionContent(example.topic, example.stem, example.bloom, "mcq").valid,
      true,
      `${example.topic} should pass content validation`,
    );
  }
});

Deno.test("initial acceptance, repair, and final validation share content rules", () => {
  const valid = {
    topic: "Network security",
    text: "During an incident review, a firewall records repeated login attempts from one external address while legitimate users remain connected. Examine the event pattern and distinguish a password-guessing attack from a service outage.",
    bloom: "Analyzing",
    type: "mcq",
  };
  const invalid = {
    topic: "Network security",
    text: "Analyze how a firewall and encryption differ.",
    bloom: "Analyzing",
    type: "mcq",
  };

  for (const stage of ["initial acceptance", "repair", "final validation"]) {
    assertEquals(
      validateQuestionContent(valid.topic, valid.text, valid.bloom, valid.type).valid,
      true,
      `${stage} should accept valid content`,
    );
    assertEquals(
      validateQuestionContent(invalid.topic, invalid.text, invalid.bloom, invalid.type).valid,
      false,
      `${stage} should reject missing scenario details`,
    );
  }
});

Deno.test("generation prompts require topic-specific stems and meaningful scenario demands", () => {
  const analyzingPrompt = buildTopicBloomPrompt("Input devices", "Analyzing");
  assertStringIncludes(analyzingPrompt, 'stem itself must name "Input devices"');
  assertStringIncludes(analyzingPrompt, "concrete, topic-relevant case");
  assertStringIncludes(analyzingPrompt, "evidence must be necessary to answer");

  const applyingPrompt = buildTopicBloomPrompt("Input devices", "Applying");
  assertStringIncludes(applyingPrompt, "realistic, topic-relevant task");
  assertStringIncludes(applyingPrompt, "merely to define, identify, name, or recall");
});
