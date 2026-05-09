import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ParsedQuestion {
  question_text: string;
  question_type: 'mcq' | 'true_false' | 'essay' | 'short_answer';
  choices?: Record<string, string>;
  correct_answer?: string;
  bloom_level?: string;
  difficulty?: string;
  topic?: string;
}

interface ParseRequest {
  raw_text: string;
  existing_topics?: string[];
  metadata?: Record<string, string>;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { raw_text, existing_topics = [], metadata = {} } = await req.json() as ParseRequest;

    if (!raw_text || raw_text.trim().length < 20) {
      return new Response(JSON.stringify({ error: 'Insufficient text to parse' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    // Truncate text if extremely large (keep first ~30000 chars for token limits)
    const truncatedText = raw_text.length > 30000 ? raw_text.substring(0, 30000) : raw_text;

    const topicContext = existing_topics.length > 0
      ? `\n\nAvailable topics from the question bank (assign the most relevant one to each question): ${existing_topics.join(', ')}`
      : '';

    const metaContext = Object.keys(metadata).length > 0
      ? `\n\nDocument metadata: ${JSON.stringify(metadata)}`
      : '';

    const systemPrompt = `You are a precise academic question parser. Your job is to extract structured multiple-choice and other question types from raw PDF text, AND assign each question a SPECIFIC LESSON / SUB-TOPIC.

EXTRACTION RULES:
1. Extract ONLY actual questions - ignore headers, metadata labels, instructions, page numbers, footers.
2. For each question, extract: clean question text (no numbering prefixes), all answer choices (A, B, C, D), the correct answer letter if indicated, and the question type.
3. Question types: "mcq" (has A-D choices), "true_false" (True/False options), "essay" (long-form), "short_answer" (brief answer needed).
4. Do NOT include numbering like "Q1.", "1.", "(Q1)" in question_text - strip all prefixes.
5. If the correct answer is marked with *, ✓, "Answer: X", or bold formatting, capture it.
6. If no correct answer is identifiable, set correct_answer to empty string "".
7. Lines like "Category:", "Subject Code:", "Cognitive Level:", "Points Value:" are metadata - do NOT treat as questions.
8. Reconstruct multi-line questions / choices into single coherent strings.

TOPIC RULES (CRITICAL):
- The "topic" field MUST describe the SPECIFIC LESSON or COMPETENCY the question covers — NOT the subject title.
  BAD: "Life and Works of Rizal", "Introduction to Computing", "Multimedia"
  GOOD: "RA 1425 Rizal Law", "Noli Me Tangere", "Rizal's Childhood",
        "Variables and Data Types", "For Loops", "Image File Formats", "Color Theory"
- Stay strictly within the provided Specialization / Subject context. Never assign topics from other specializations.
- 2–6 words, Title Case, no trailing punctuation.
- If an existing topic from the provided list closely matches, REUSE the exact existing string.
- If you genuinely cannot determine a specific lesson, return "" — never echo the subject description.${topicContext}${metaContext}

Return a JSON object with this exact structure:
{
  "questions": [
    {
      "question_text": "Clean question text without numbering",
      "question_type": "mcq",
      "choices": {"A": "choice text", "B": "choice text", "C": "choice text", "D": "choice text"},
      "correct_answer": "B",
      "bloom_level": "",
      "difficulty": "",
      "topic": "specific lesson / competency, NOT the subject title"
    }
  ],
  "detected_metadata": {
    "category": "",
    "specialization": "",
    "subject_code": "",
    "subject_description": "",
    "total_questions_found": 0
  }
}`;

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
          { role: 'user', content: `Parse the following PDF text into structured questions:\n\n${truncatedText}` },
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: 'return_parsed_questions',
              description: 'Return the parsed questions extracted from PDF text',
              parameters: {
                type: 'object',
                properties: {
                  questions: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        question_text: { type: 'string' },
                        question_type: { type: 'string', enum: ['mcq', 'true_false', 'essay', 'short_answer'] },
                        choices: {
                          type: 'object',
                          properties: {
                            A: { type: 'string' },
                            B: { type: 'string' },
                            C: { type: 'string' },
                            D: { type: 'string' },
                          },
                        },
                        correct_answer: { type: 'string' },
                        bloom_level: { type: 'string' },
                        difficulty: { type: 'string' },
                        topic: { type: 'string' },
                      },
                      required: ['question_text', 'question_type'],
                    },
                  },
                  detected_metadata: {
                    type: 'object',
                    properties: {
                      category: { type: 'string' },
                      specialization: { type: 'string' },
                      subject_code: { type: 'string' },
                      subject_description: { type: 'string' },
                      total_questions_found: { type: 'number' },
                    },
                  },
                },
                required: ['questions', 'detected_metadata'],
              },
            },
          },
        ],
        tool_choice: { type: 'function', function: { name: 'return_parsed_questions' } },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('AI gateway error:', response.status, errText);

      if (response.status === 429) {
        return new Response(JSON.stringify({ error: 'Rate limited. Please try again in a moment.' }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: 'AI credits exhausted. Please add funds.' }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      throw new Error(`AI gateway returned ${response.status}`);
    }

    const aiResult = await response.json();
    
    // Extract tool call result
    const toolCall = aiResult.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall || !toolCall.function?.arguments) {
      // Fallback: try to parse from content
      const content = aiResult.choices?.[0]?.message?.content || '';
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return new Response(JSON.stringify(parsed), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      throw new Error('AI did not return structured output');
    }

    const parsed = typeof toolCall.function.arguments === 'string'
      ? JSON.parse(toolCall.function.arguments)
      : toolCall.function.arguments;

    // Validate and clean each question
    const cleanedQuestions = (parsed.questions || []).filter((q: any) => {
      if (!q.question_text || q.question_text.trim().length < 5) return false;
      // Filter out metadata that AI might have missed
      const lower = q.question_text.toLowerCase();
      const metaPatterns = ['category:', 'subject code:', 'specialization:', 'cognitive level:', 'points value:'];
      if (metaPatterns.some(p => lower.includes(p))) return false;
      return true;
    }).map((q: any) => ({
      ...q,
      question_text: q.question_text.trim(),
      correct_answer: q.correct_answer || '',
      choices: q.question_type === 'mcq' ? (q.choices || {}) : undefined,
    }));

    console.log(`AI parsed ${cleanedQuestions.length} questions from PDF text`);

    return new Response(JSON.stringify({
      questions: cleanedQuestions,
      detected_metadata: parsed.detected_metadata || {},
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Parse PDF questions error:', error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Failed to parse PDF questions',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
