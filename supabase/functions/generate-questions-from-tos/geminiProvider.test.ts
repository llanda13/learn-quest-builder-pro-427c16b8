import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { callGeminiChat, DEFAULT_GEMINI_MODEL } from "./geminiProvider.ts";

Deno.test("calls the configured stable Gemini model with Google API-key authentication", async () => {
  const previousProvider = Deno.env.get("AI_PRIMARY_PROVIDER");
  const previousApiKey = Deno.env.get("GEMINI_API_KEY");
  const originalFetch = globalThis.fetch;

  Deno.env.set("AI_PRIMARY_PROVIDER", "gemini");
  Deno.env.set("GEMINI_API_KEY", "test-gemini-api-key");
  globalThis.fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    assertEquals(url.href, `https://generativelanguage.googleapis.com/v1beta/models/${DEFAULT_GEMINI_MODEL}:generateContent`);
    assertEquals(new Headers(init?.headers).get("x-goog-api-key"), "test-gemini-api-key");

    const requestBody = JSON.parse(String(init?.body));
    assertEquals(requestBody.system_instruction.parts[0].text, "You are writing one question.");
    assertEquals(requestBody.contents[0].parts[0].text, "Write one MCQ.");
    assertEquals(requestBody.generationConfig.responseMimeType, "application/json");
    assertEquals("thinkingConfig" in requestBody.generationConfig, false);
    assertEquals(JSON.stringify(requestBody).includes("thinkingBudget"), false);
    assertEquals("frequencyPenalty" in requestBody.generationConfig, false);
    assertEquals("presencePenalty" in requestBody.generationConfig, false);

    return new Response(JSON.stringify({
      candidates: [{
        content: { parts: [{ text: '{"questions":[{"text":"A real response"}]}' }] },
        finishReason: "STOP",
      }],
    }), { status: 200 });
  };

  try {
    const content = await callGeminiChat({
      system: "You are writing one question.",
      user: "Write one MCQ.",
      label: "MCQ test",
    });
    assertEquals(content, '{"questions":[{"text":"A real response"}]}');
  } finally {
    globalThis.fetch = originalFetch;
    if (previousProvider === undefined) Deno.env.delete("AI_PRIMARY_PROVIDER");
    else Deno.env.set("AI_PRIMARY_PROVIDER", previousProvider);
    if (previousApiKey === undefined) Deno.env.delete("GEMINI_API_KEY");
    else Deno.env.set("GEMINI_API_KEY", previousApiKey);
  }
});
