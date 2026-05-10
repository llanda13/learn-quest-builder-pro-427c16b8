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

    const systemPrompt = `You are an academic topic-tagging expert. For EACH question you MUST output ONE specific lesson/sub-topic/competency string. NEVER return an empty string.

CRITICAL RULES:
1. The topic must describe the actual lesson/competency the question tests — NOT the subject title.
   BAD: "Life and Works of Rizal", "Introduction to Computing", "Programming", "General", "Unclassified"
   GOOD examples for Rizal subject: "Rizal Law (RA 1425)", "Noli Me Tangere", "El Filibusterismo",
        "Rizal's Childhood and Family", "19th Century Philippines", "Rizal in Europe",
        "Rizal's Exile in Dapitan", "Rizal's Trial and Execution", "Propaganda Movement",
        "Rizal's Poems and Essays", "Spanish Colonial Society", "La Liga Filipina"
   GOOD examples for Programming: "Variables and Data Types", "For Loops", "Conditional Statements",
        "Functions and Parameters", "Arrays and Lists", "Object-Oriented Programming"
2. Use 2-6 words. Title Case. No trailing punctuation.
3. Stay strictly within the given Specialization and Subject context. Never assign a topic that belongs to a different specialization.
4. If an existing topic from the provided list closely matches the question's lesson, REUSE the exact existing topic string (case-sensitive).
5. You MUST return a non-empty topic for every question. If a question is generic or unclear, infer the closest plausible lesson from the question wording within the subject context. Never return "", "General", "Unclassified", or the subject title.

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
        model: 'google/gemini-3-flash-preview',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Tag each of the following questions with its specific lesson/competency topic. Return one entry per question, preserving idx. Every topic field MUST be a non-empty 2-6 word phrase:\n\n${JSON.stringify(userPayload)}` },
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
      // Graceful degradation: return heuristic topics so the UI never shows blank Topic column
      const fallback = heuristicTopics(questions, existingList, body.subject_description);
      const reason = response.status === 402 ? 'AI credits exhausted' : response.status === 429 ? 'Rate limited' : `AI gateway ${response.status}`;
      return new Response(JSON.stringify({ topics: fallback, fallback: true, reason }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const aiResult = await response.json();
    const toolCall = aiResult.choices?.[0]?.message?.tool_calls?.[0];
    const args = toolCall?.function?.arguments;
    const parsed = typeof args === 'string' ? JSON.parse(args) : (args || {});
    const topicsArr: { idx: number; topic: string }[] = parsed.topics || [];

    const fb = heuristicTopics(questions, existingList, body.subject_description);

    const subjLower = (body.subject_description || '').trim().toLowerCase();
    const banned = new Set(['', 'general', 'unclassified', 'general concepts', 'n/a', 'none']);

    // Map idx -> topic, ordered to match input; guarantee NO empty topic ever leaves the server.
    const result: string[] = questions.map((q, i) => {
      const found = topicsArr.find(t => t.idx === i);
      let topic = (found?.topic || '').trim();
      if (subjLower && topic.toLowerCase() === subjLower) topic = '';
      if (banned.has(topic.toLowerCase())) topic = '';
      if (!topic) topic = (fb[i] || '').trim();
      if (!topic || banned.has(topic.toLowerCase())) {
        // Last-resort: take first 4 capitalized/meaningful words from question text
        const words = (q.question_text || '').replace(/[^\w\s]/g, ' ').split(/\s+/).filter(w => w.length > 3).slice(0, 4);
        topic = words.length ? words.map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ') : 'Subject Concepts';
      }
      return topic;
    });

    console.log(`identify-question-topics: returned ${result.length} topics, sample: ${result.slice(0, 3).join(' | ')}`);
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

// Heuristic topic extraction — used when the AI is unavailable or returns empty.
// Strategy: (1) match against existing question-bank topics by keyword overlap;
// (2) extract a salient noun phrase / capitalized phrase from the question.
function heuristicTopics(
  questions: { question_text: string }[],
  existingTopics: string[],
  subjectDescription?: string,
): string[] {
  const stop = new Set(['the','a','an','of','in','on','for','to','and','or','is','are','was','were','be','been','by','with','as','at','from','that','this','which','what','who','when','where','how','why','it','its','their','his','her','they','them','these','those','than','then','into','about','after','before','during','between','also','not','no','do','does','did','can','could','should','would','will','may','might','have','has','had','one','two','first','second','following','question','statement']);
  const subjLower = (subjectDescription || '').toLowerCase();

  const tokenize = (s: string) => s.toLowerCase().replace(/[^\w\s-]/g, ' ').split(/\s+/).filter(w => w.length > 2 && !stop.has(w));

  // Pre-tokenize existing topics
  const existingTokens = existingTopics.map(t => ({ topic: t, tokens: new Set(tokenize(t)) }));

  return questions.map(q => {
    const text = q.question_text || '';
    const qTokens = tokenize(text);
    const qSet = new Set(qTokens);

    // (1) Best existing-topic match by token overlap
    let best = { topic: '', score: 0 };
    for (const et of existingTokens) {
      if (!et.tokens.size) continue;
      let overlap = 0;
      et.tokens.forEach(t => { if (qSet.has(t)) overlap++; });
      const score = overlap / et.tokens.size;
      if (score > best.score) best = { topic: et.topic, score };
    }
    if (best.score >= 0.5) return best.topic;

    // (2) Extract first capitalized multi-word phrase (e.g., "RA 1425", "Noli Me Tangere")
    const capMatch = text.match(/\b([A-Z][A-Za-z0-9]*(?:\s+(?:[A-Z][A-Za-z0-9]*|\d+|de|of|the|and))+)\b/);
    if (capMatch) {
      const phrase = capMatch[1].replace(/\s+/g, ' ').trim();
      if (phrase.length <= 60 && phrase.toLowerCase() !== subjLower) return phrase;
    }

    // (3) Top 2-3 salient tokens from the question
    const freq = new Map<string, number>();
    qTokens.forEach(t => freq.set(t, (freq.get(t) || 0) + 1));
    const top = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([t]) => t);
    if (top.length) {
      const phrase = top.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      if (phrase.toLowerCase() !== subjLower) return phrase;
    }

    return 'General Concepts';
  });
}

