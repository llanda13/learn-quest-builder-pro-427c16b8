import { beforeEach, describe, expect, it, vi } from 'vitest';

const { invoke, from } = vi.hoisted(() => ({ invoke: vi.fn(), from: vi.fn() }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: { invoke },
    from
  }
}));

import { generateQuestionsWithAI, type TOSCriteria } from '../testGenerationService';
import { INSUFFICIENT_CREDITS_MESSAGE, isInsufficientCreditsMessage } from '../aiErrorHandling';

const criteria: TOSCriteria = {
  topic: 'Computer architecture',
  bloom_level: 'Understanding',
  difficulty: 'average',
  count: 5,
  question_type: 'mcq'
};

const http402 = (context: Response) => ({
  data: null,
  error: { context, message: 'Edge Function returned a non-2xx status code' }
});

const edge402Body = { success: false, code: 'insufficient_credits', error: INSUFFICIENT_CREDITS_MESSAGE };
const edge402Response = new Response(JSON.stringify(edge402Body), { status: 400 });

describe('HTTP 402 insufficient credits handling', () => {
  beforeEach(() => {
    invoke.mockReset();
    from.mockReset();
  });

  it('surfaces the clear insufficient-credits message exactly once and never saves', async () => {
    invoke.mockReturnValue(http402(edge402Response));

    await expect(generateQuestionsWithAI(criteria, 5, 'user-1')).rejects.toMatchObject({
      name: 'QuestionGenerationError',
      category: 'insufficient_credits',
      message: expect.stringContaining('AI provider has insufficient credits')
    });

    // No repeated retries: the edge function was invoked exactly once.
    expect(invoke).toHaveBeenCalledTimes(1);

    // No incomplete test or question-bank writes: no database access happened at all.
    expect(from).not.toHaveBeenCalled();
  });

  it('classifies a text-based 402 ("Not enough credits") as insufficient credits', async () => {
    invoke.mockReturnValue(
      http402(new Response(
        JSON.stringify({ success: false, error: 'AI provider returned HTTP 402: Not enough credits' }),
        { status: 400 }
      ))
    );

    await expect(generateQuestionsWithAI(criteria, 5, 'user-1')).rejects.toMatchObject({
      category: 'insufficient_credits',
      message: INSUFFICIENT_CREDITS_MESSAGE
    });

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(from).not.toHaveBeenCalled();
  });

  it('rejects 402 failures even when the edge function returns partial questions', async () => {
    invoke.mockReturnValue(
      http402(new Response(
        JSON.stringify({
          success: false,
          code: 'insufficient_credits',
          error: INSUFFICIENT_CREDITS_MESSAGE,
          questions: []
        }),
        { status: 400 }
      ))
    );

    await expect(generateQuestionsWithAI(criteria, 5, 'user-1')).rejects.toMatchObject({
      category: 'insufficient_credits'
    });
    expect(from).not.toHaveBeenCalled();
  });

  it('the shared message helper detects 402 variants and rejects retryable errors', () => {
    expect(isInsufficientCreditsMessage(INSUFFICIENT_CREDITS_MESSAGE)).toBe(true);
    expect(isInsufficientCreditsMessage('AI provider returned HTTP 402: payment_required')).toBe(true);
    expect(isInsufficientCreditsMessage('HTTP 429: rate limited')).toBe(false);
    expect(isInsufficientCreditsMessage('Request timeout')).toBe(false);
  });

  it('the user-facing message matches the required wording', () => {
    expect(INSUFFICIENT_CREDITS_MESSAGE).toBe(
      "AI question generation could not continue because the AI provider has insufficient credits. Please check the configured provider's billing or credits and try again."
    );
  });
});
