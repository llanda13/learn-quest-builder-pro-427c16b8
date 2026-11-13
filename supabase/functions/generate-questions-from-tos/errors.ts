// Gemini provider failures are terminal after the provider's own transient retries.

export const INSUFFICIENT_CREDITS_MESSAGE =
  "AI question generation could not continue because the AI provider has insufficient credits. Please check the configured provider's billing or credits and try again.";

export class AiInsufficientCreditsError extends Error {
  constructor() {
    super(INSUFFICIENT_CREDITS_MESSAGE);
    this.name = 'AiInsufficientCreditsError';
  }
}

export function isInsufficientCreditsError(err: unknown): boolean {
  if (err instanceof AiInsufficientCreditsError) return true;
  const message = err instanceof Error ? err.message : String(err ?? '');
  return isInsufficientCreditsMessage(message);
}

export function isInsufficientCreditsMessage(message: string): boolean {
  return /\bHTTP 402\b|payment_required|not enough credits|insufficient credits/i.test(message || '');
}

// ============= PROVIDER ERROR TAXONOMY (Gemini direct API) =============
// Gemini (generativelanguage.googleapis.com) is the exclusive provider for
// question generation. There is no fallback to the Lovable AI Gateway or
// OpenAI. Each provider failure mode gets its own terminal classification so
// quota exhaustion, invalid keys, and credit shortages are never confused.

export const QUOTA_EXHAUSTED_MESSAGE =
  "AI question generation stopped because the configured Gemini API quota has been exhausted. Please wait for the quota to reset or raise the provider's quota, then try again.";

export const INVALID_API_KEY_MESSAGE =
  "AI question generation could not continue because the configured Gemini API key was rejected. Please verify the GEMINI_API_KEY secret in Supabase Edge Function settings.";

export const PROVIDER_NOT_CONFIGURED_MESSAGE =
  "AI question generation is not available because the Gemini provider is not configured. Please set the GEMINI_API_KEY secret in Supabase Edge Function settings.";

export const MODEL_UNAVAILABLE_MESSAGE =
  "AI question generation could not continue because Gemini model gemini-3.5-flash-lite is not available for this API key. Verify this model is enabled for the configured Gemini project.";

export const PROVIDER_ACCESS_DENIED_MESSAGE =
  "AI question generation could not continue because Gemini denied access to the configured project. Verify that the Gemini API is enabled and the API key has access to this project.";

export class AiQuotaExhaustedError extends Error {
  constructor(message = QUOTA_EXHAUSTED_MESSAGE) {
    super(message);
    this.name = 'AiQuotaExhaustedError';
  }
}

export class AiInvalidApiKeyError extends Error {
  constructor(message = INVALID_API_KEY_MESSAGE) {
    super(message);
    this.name = 'AiInvalidApiKeyError';
  }
}

export class AiProviderConfigError extends Error {
  constructor(message = PROVIDER_NOT_CONFIGURED_MESSAGE) {
    super(message);
    this.name = 'AiProviderConfigError';
  }
}

export class AiModelUnavailableError extends Error {
  constructor(message = MODEL_UNAVAILABLE_MESSAGE) {
    super(message);
    this.name = 'AiModelUnavailableError';
  }
}

export class AiProviderAccessError extends Error {
  constructor(message = PROVIDER_ACCESS_DENIED_MESSAGE) {
    super(message);
    this.name = 'AiProviderAccessError';
  }
}

export function isQuotaExhaustedMessage(message: string): boolean {
  return /\bHTTP 429\b|RESOURCE_EXHAUSTED|quota.{0,20}(exhaust|exceed)|rate.?limit.{0,20}exceed/i.test(message || '');
}

export function isInvalidApiKeyMessage(message: string): boolean {
  return /API_KEY_INVALID|API key not valid|invalid api key|\bHTTP 40[13]\b/i.test(message || '');
}

export function isProviderNotConfiguredMessage(message: string): boolean {
  return /provider is not configured|GEMINI_API_KEY|AI_PRIMARY_PROVIDER/i.test(message || '');
}

export function isTerminalGeminiError(err: unknown): boolean {
  return err instanceof AiInsufficientCreditsError ||
    err instanceof AiQuotaExhaustedError ||
    err instanceof AiInvalidApiKeyError ||
    err instanceof AiModelUnavailableError ||
    err instanceof AiProviderAccessError ||
    err instanceof AiProviderConfigError;
}
