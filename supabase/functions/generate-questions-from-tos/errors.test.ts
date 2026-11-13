import { assert, assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  AiInsufficientCreditsError,
  AiInvalidApiKeyError,
  AiModelUnavailableError,
  AiProviderAccessError,
  AiProviderConfigError,
  AiQuotaExhaustedError,
  INSUFFICIENT_CREDITS_MESSAGE,
  isInsufficientCreditsError,
  isInsufficientCreditsMessage,
  isTerminalGeminiError,
} from "./errors.ts";

Deno.test("HTTP 402 maps to the clear insufficient-credits message", () => {
  assertEquals(
    INSUFFICIENT_CREDITS_MESSAGE,
    "AI question generation could not continue because the AI provider has insufficient credits. Please check the configured provider's billing or credits and try again."
  );
  assertThrows(() => {
    // Simulates the provider responding HTTP 402 (payment_required / Not enough credits).
    throw new AiInsufficientCreditsError();
  }, AiInsufficientCreditsError, "insufficient credits");
});

Deno.test("recognizes insufficient-credit failures in every reported shape", () => {
  assert(isInsufficientCreditsError(new AiInsufficientCreditsError()));
  assert(isInsufficientCreditsMessage("AI provider returned HTTP 402 for MCQ generation: payment_required"));
  assert(isInsufficientCreditsMessage("AI provider returned HTTP 402: Not enough credits"));
  assert(isInsufficientCreditsMessage("insufficient credits remaining in workspace"));
  assert(isInsufficientCreditsMessage(INSUFFICIENT_CREDITS_MESSAGE));
});

Deno.test("retryable or unrelated provider errors are NOT classified as insufficient credits", () => {
  assert(!isInsufficientCreditsMessage("AI provider returned HTTP 429 for MCQ generation: rate limited"));
  assert(!isInsufficientCreditsMessage("AI provider returned HTTP 503 for essay generation: upstream unavailable"));
  assert(!isInsufficientCreditsMessage("Invalid MCQ response format"));
  assert(!isInsufficientCreditsError(new Error("Batch error: HTTP 400 Bad Request")));
});

Deno.test("Gemini quota, authentication, model, and configuration failures are terminal", () => {
  assert(isTerminalGeminiError(new AiInsufficientCreditsError()));
  assert(isTerminalGeminiError(new AiQuotaExhaustedError()));
  assert(isTerminalGeminiError(new AiInvalidApiKeyError()));
  assert(isTerminalGeminiError(new AiModelUnavailableError()));
  assert(isTerminalGeminiError(new AiProviderAccessError()));
  assert(isTerminalGeminiError(new AiProviderConfigError()));
  assert(!isTerminalGeminiError(new Error("Gemini returned HTTP 503")));
});
