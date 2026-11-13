// Exclusive AI provider for question generation: Google Gemini direct API.
// Configured via AI_PRIMARY_PROVIDER=gemini and the GEMINI_API_KEY secret.
// There is deliberately NO fallback to the Lovable AI Gateway or OpenAI.
// Stable low-cost model: gemini-3.5-flash-lite.

import {
  AiInsufficientCreditsError,
  AiInvalidApiKeyError,
  AiModelUnavailableError,
  AiProviderAccessError,
  AiProviderConfigError,
  AiQuotaExhaustedError,
} from './errors.ts';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
export const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash-lite';
const MAX_QUOTA_RETRIES = 3;
const MAX_SERVER_ERROR_RETRIES = 1;

function sanitizeErrorText(message: string): string {
  return String(message || '')
    .replace(/Bearer\s+[^\s,;"']+/gi, 'Bearer [redacted]')
    .replace(/\b(sk-[A-Za-z0-9_-]{8,})\b/g, '[redacted]')
    .replace(/((?:api[_-]?key|authorization|token|secret)\s*[:=]\s*)[^\s,;"']+/gi, '$1[redacted]')
    .replace(/[\r\n\t]+/g, ' ')
    .slice(0, 500);
}

export function getPrimaryProvider(): string {
  return (Deno.env.get('AI_PRIMARY_PROVIDER') || '').trim().toLowerCase();
}

export function getGeminiModel(): string {
  return DEFAULT_GEMINI_MODEL;
}

export function isGeminiConfigured(): boolean {
  return getPrimaryProvider() === 'gemini' && Boolean(Deno.env.get('GEMINI_API_KEY'));
}

export function assertGeminiConfigured(): void {
  const provider = getPrimaryProvider();
  if (provider !== 'gemini') {
    throw new AiProviderConfigError(
      `AI_PRIMARY_PROVIDER must be set to "gemini" for question generation (current value: "${provider || 'not set'}").`
    );
  }
  if (!Deno.env.get('GEMINI_API_KEY')) {
    throw new AiProviderConfigError(
      'GEMINI_API_KEY is not configured in Supabase Edge Function secrets; question generation cannot start.'
    );
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface GeminiChatParams {
  system: string;
  user: string;
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  label: string;
}

function terminalProviderError(status: number, bodyText: string): Error | null {
  if (status === 402) return new AiInsufficientCreditsError();
  if (status === 401) {
    return new AiInvalidApiKeyError(`Gemini rejected the request credentials (HTTP ${status}): ${sanitizeErrorText(bodyText)}`);
  }
  if (status === 403) {
    return new AiProviderAccessError(`Gemini denied access to the configured project (HTTP 403): ${sanitizeErrorText(bodyText)}`);
  }
  if (status === 404) {
    return new AiModelUnavailableError(
      `Gemini model "${getGeminiModel()}" is not available for this API key (HTTP 404): ${sanitizeErrorText(bodyText)}`
    );
  }
  if (status === 400 && /API_KEY_INVALID|API key not valid/i.test(bodyText)) {
    return new AiInvalidApiKeyError(`Gemini rejected the configured API key (HTTP 400): ${sanitizeErrorText(bodyText)}`);
  }
  return null;
}

function extractRetryDelayMs(bodyText: string): number | null {
  try {
    const payload = JSON.parse(bodyText);
    const details = payload?.error?.details;
    if (Array.isArray(details)) {
      const retry = details.find((d: any) => typeof d?.retryDelay === 'string');
      if (retry) {
        const m = /^(\d+(?:\.\d+)?)s$/.exec(retry.retryDelay);
        if (m) return Math.min(30, parseFloat(m[1])) * 1000;
      }
    }
  } catch {
    // Non-JSON body; fall back to exponential backoff.
  }
  return null;
}

interface ExtractedContent {
  content: string;
  finishReason?: string;
}

function extractContent(payload: any): ExtractedContent | null {
  const candidate = payload?.candidates?.[0];
  if (!candidate) return null;
  const parts = candidate?.content?.parts;
  const text = Array.isArray(parts) ? parts.map((p: any) => p?.text ?? '').join('') : '';
  return { content: text, finishReason: candidate.finishReason };
}

// Calls Gemini generateContent and returns the assistant text content.
// 429 (free-tier quota) and 5xx are retried with backoff; auth, key, and model
// errors are terminal. There is no provider fallback path.
export async function callGeminiChat(params: GeminiChatParams): Promise<string> {
  assertGeminiConfigured();
  const apiKey = Deno.env.get('GEMINI_API_KEY')!;
  const model = getGeminiModel();
  const url = `${GEMINI_API_BASE}/models/${model}:generateContent`;

  const generationConfig: Record<string, unknown> = {
    temperature: params.temperature ?? 0.7,
    maxOutputTokens: params.maxTokens ?? 4000,
    responseMimeType: 'application/json',
  };
  if (params.topP !== undefined) generationConfig.topP = params.topP;

  const requestBody = {
    system_instruction: { parts: [{ text: params.system }] },
    contents: [{ role: 'user', parts: [{ text: params.user }] }],
    generationConfig,
  };

  let quotaRetries = 0;
  let serverRetries = 0;
  for (;;) {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify(requestBody),
    });
    const bodyText = await response.text();

    if (!response.ok) {
      console.error(`[gemini-provider] ${params.label} failed: HTTP ${response.status} ${sanitizeErrorText(bodyText).slice(0, 300)}`);
      const terminal = terminalProviderError(response.status, bodyText);
      if (terminal) throw terminal;

      if (response.status === 429) {
        if (quotaRetries >= MAX_QUOTA_RETRIES) {
          throw new AiQuotaExhaustedError(
            `Gemini quota exhausted (HTTP 429) after ${quotaRetries} backoff retries: ${sanitizeErrorText(bodyText)}`
          );
        }
        quotaRetries++;
        const delay = extractRetryDelayMs(bodyText) ?? Math.min(30000, 2000 * 2 ** (quotaRetries - 1));
        console.warn(`[gemini-provider] ${params.label} rate-limited; retry ${quotaRetries}/${MAX_QUOTA_RETRIES} in ${Math.round(delay / 1000)}s`);
        await sleep(delay);
        continue;
      }

      if (response.status >= 500 && serverRetries < MAX_SERVER_ERROR_RETRIES) {
        serverRetries++;
        console.warn(`[gemini-provider] ${params.label} transient server error (HTTP ${response.status}); retry ${serverRetries}/${MAX_SERVER_ERROR_RETRIES}`);
        await sleep(2000);
        continue;
      }

      throw new Error(`AI provider returned HTTP ${response.status} for ${params.label} generation: ${sanitizeErrorText(bodyText)}`);
    }

    let payload: any;
    try {
      payload = JSON.parse(bodyText);
    } catch {
      throw new Error(`AI provider returned a non-JSON response for ${params.label} generation`);
    }

    const extracted = extractContent(payload);
    const content = extracted?.content ?? '';
    const finishReason = extracted?.finishReason;
    if (!content.trim() || finishReason === 'SAFETY' || finishReason === 'RECITATION' || finishReason === 'BLOCKLIST') {
      console.warn(`[gemini-provider] ${params.label} returned empty/blocked content (finishReason=${finishReason ?? 'none'})`);
      throw new Error(`AI provider returned empty or blocked content for ${params.label} generation (finishReason=${finishReason ?? 'none'})`);
    }

    console.log(`[gemini-provider] ${params.label} OK model=${model} status=200 chars=${content.length}`);
    return content;
  }
}
