import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface IdentifyRequest {
  questions: { id?: string | number; question_text: string; current_topic?: string }[];
  category?: string;
  specialization?: string;
  subject_code?: string;
  subject_description?: string;
  existing_topics?: string[];
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const body = (await req.json()) as IdentifyRequest;
    const questions = (body.questions || []).filter(q => q && q.question_text && q.question_text.trim().length > 4);

    if (questions.length === 0) {
      return new Response(JSON.stringify({ topics: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY is not configured');

    const ctxLines = [
      body.category && `Category: ${body.category}`,
      body.specialization && `Specialization: ${body.specialization}`,
      body.subject_code && `Subject Code: ${body.subject_code}`,
      body.subject_description && `Subject Description: ${body.subject_description}`,
    ].filter(Boolean).join('\n');

    const existingList = (body.existing_topics || []).slice(0, 80);

    const systemPrompt = `You are an academic topic-tagging expert. For each question, identify the SPECIFIC LESSON, SUB-TOPIC, or COMPETENCY that the question covers.

CRITICAL RULES:
1. The topic must describe the actual lesson/competency the question tests — NOT the subject title.
   BAD: "Life and Works of Rizal", "Introduction to Computing", "Programming"
   GOOD: "RA 1425 Rizal Law", "Noli Me Tangere", "Rizal's Childhood",
         "Variables and Data Types", "For Loops", "Image File Formats", "Color Theory"
2. Use 2-6 words. Title Case. No trailing punctuation.
3. Stay strictly within the given Specialization and Subject context. Never assign a topic that belongs to a different specialization (e.g., do not give a Programming topic to a Rizal question).
4. If an existing topic from the provided list closely matches the question's lesson, REUSE the exact existing topic string (case-sensitive) instead of inventing a new variant.
5. If you truly cannot determine a specific lesson, return an empty string "" — never default to the subject description.

Subject context:
${ctxLines || '(none provided)'}

${existingList.length ? `Existing topics in the question bank (prefer reusing these when they fit):\n- ${existingList.join('\n- ')}` : ''}`;

    const userPayload = questions.map((q, i) => ({ idx: i, text: q.question_text.slice(0, 800) }));

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Tag each of the following questions with its specific lesson/competency topic. Return one entry per question, preserving idx:\n\n${JSON.stringify(userPayload)}` },
        ],
        tools: [{
          type: 'function',
          function: {
            name: 'return_topics',
            description: 'Return per-question specific lesson topics',
            parameters: {
              type: 'object',
              properties: {
                topics: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      idx: { type: 'number' },
                      topic: { type: 'string' },
                    },
                    required: ['idx', 'topic'],
                  },
                },
              },
              required: ['topics'],
            },
          },
        }],
        tool_choice: { type: 'function', function: { name: 'return_topics' } },
      }),
    });

    if (!response.ok) {
      const t = await response.text();
      console.error('AI gateway error:', response.status, t);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: 'Rate limited' }), { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: 'AI credits exhausted' }), { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      throw new Error(`AI gateway ${response.status}`);
    }

    const aiResult = await response.json();
    const toolCall = aiResult.choices?.[0]?.message?.tool_calls?.[0];
    const args = toolCall?.function?.arguments;
    const parsed = typeof args === 'string' ? JSON.parse(args) : (args || {});
    const topicsArr: { idx: number; topic: string }[] = parsed.topics || [];

    // Map idx -> topic, ordered to match input
    const result: string[] = questions.map((_, i) => {
      const found = topicsArr.find(t => t.idx === i);
      const topic = (found?.topic || '').trim();
      // Guard: never echo subject description back
      if (body.subject_description && topic.toLowerCase() === body.subject_description.toLowerCase()) return '';
      return topic;
    });

    return new Response(JSON.stringify({ topics: result }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('identify-question-topics error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Failed' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
