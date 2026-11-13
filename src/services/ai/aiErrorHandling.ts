// Shared insufficient-credits (HTTP 402) error handling for the frontend.
// Mirrors supabase/functions/generate-questions-from-tos/errors.ts: a 402 from the
// AI provider is terminal — show the clear message, never retry, never fall back.

export const INSUFFICIENT_CREDITS_MESSAGE =
  "AI question generation could not continue because the AI provider has insufficient credits. Please check the configured provider's billing or credits and try again.";

export function isInsufficientCreditsMessage(message: unknown): boolean {
  return /\bHTTP 402\b|payment_required|not enough credits|insufficient credits/i.test(String(message ?? ''));
}
