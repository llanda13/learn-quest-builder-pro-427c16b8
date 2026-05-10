// AI-driven Topic identifier with strict taxonomy validation.
// Every returned topic is reconciled against the `academic_topics` table for the
// supplied subject. If the AI proposes something not in the taxonomy, we fall
// back to the nearest approved topic via the SQL `resolve_topic_for_subject`
// function (trigram similarity). Only when nothing reasonable matches do we
// return the AI candidate as a `needs_review = true` suggestion.

import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface IdentifyRequest {
  questions: { id?: string | number; question_text: string; current_topic?: string }[];
  subject_id?: string;             // NEW — preferred anchor for taxonomy
  category?: string;
  specialization?: string;
  subject_code?: string;
  subject_description?: string;
  // Legacy field retained for backward compatibility but ignored when subject_id given
  existing_topics?: string[];
}

interface ResolvedTopic {
  topic: string;
  topic_id: string | null;
  matched: boolean;        // true => mapped to an approved taxonomy entry
  confidence: number;      // 0..1
  needs_review: boolean;
  source: 'taxonomy' | 'fuzzy' | 'ai_new' | 'fallback';
}

const FUZZY_MIN = 0.45;     // accept fuzzy match above this
const FUZZY_SNAP = 0.65;    // snap silently above this
const NORMALIZE = (s: string) => s.toLowerCase().trim().replace(/\s+/g, ' ');

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const body = (await req.json()) as IdentifyRequest;
    const questions = (body.questions || []).filter(q => q && q.question_text && q.question_text.trim().length > 4);

    if (questions.length === 0) {
      return new Response(JSON.stringify({ topics: [], resolutions: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY is not configured');

    // User-scoped client (respects RLS)
    const authHeader = req.headers.get('Authorization') || '';
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    // Resolve subject_id from subject_code if not provided
    let subjectId = body.subject_id || null;
    if (!subjectId && body.subject_code) {
      const { data: subj } = await supabase
        .from('academic_subjects')
        .select('id')
        .ilike('code', body.subject_code.trim())
        .eq('deleted', false)
        .maybeSingle();
      subjectId = subj?.id || null;
    }

    // Load approved taxonomy for this subject
    let taxonomy: { id: string; name: string; aliases: string[] }[] = [];
    if (subjectId) {
      const { data } = await supabase
        .from('academic_topics')
        .select('id, name, aliases')
        .eq('subject_id', subjectId)
        .eq('approved', true)
        .order('usage_count', { ascending: false })
        .limit(200);
      taxonomy = (data || []).map(t => ({ id: t.id, name: t.name, aliases: t.aliases || [] }));
    }

    const taxonomyNames = taxonomy.map(t => t.name);
    const ctxLines = [
      body.category && `Category: ${body.category}`,
      body.specialization && `Specialization: ${body.specialization}`,
      body.subject_code && `Subject Code: ${body.subject_code}`,
      body.subject_description && `Subject Description: ${body.subject_description}`,
    ].filter(Boolean).join('\n');

    const systemPrompt = `You are an academic topic-tagging expert. For EACH question return ONE specific lesson/competency topic.

STRICT RULES:
1. Whenever possible, REUSE the EXACT string from the "Approved Topic Taxonomy" list below (case-sensitive). Reuse is strongly preferred.
2. Only propose a new topic name when the question clearly tests a lesson NOT covered by any approved topic. Mark such items with new_topic: true.
3. Topic must describe the lesson the question tests, NOT the subject title. 2-6 words, Title Case, no trailing punctuation.
4. Stay strictly within the given Subject context. Never invent off-topic competencies.
5. Never return empty, "General", "Unclassified", "N/A", or the subject title.

Subject context:
${ctxLines || '(none provided)'}

Approved Topic Taxonomy for this subject (${taxonomyNames.length} entries):
${taxonomyNames.length ? taxonomyNames.map(n => `- ${n}`).join('\n') : '(empty — taxonomy will be seeded from your suggestions; mark every item new_topic: true)'}`;

    const userPayload = questions.map((q, i) => ({ idx: i, text: q.question_text.slice(0, 800) }));

    const aiResp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Tag each question. Return one entry per question, preserving idx.\n\n${JSON.stringify(userPayload)}` },
        ],
        tools: [{
          type: 'function',
          function: {
            name: 'return_topics',
            description: 'Return per-question lesson topics with reuse signal',
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
                      new_topic: { type: 'boolean', description: 'true only when not in approved taxonomy' },
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

    let aiTopics: { idx: number; topic: string; new_topic?: boolean }[] = [];
    let aiAvailable = true;
    if (!aiResp.ok) {
      aiAvailable = false;
      console.error('AI gateway error:', aiResp.status, await aiResp.text().catch(() => ''));
    } else {
      const aiResult = await aiResp.json();
      const tc = aiResult.choices?.[0]?.message?.tool_calls?.[0];
      const args = tc?.function?.arguments;
      const parsed = typeof args === 'string' ? JSON.parse(args) : (args || {});
      aiTopics = parsed.topics || [];
    }

    // ============= VALIDATION & RESOLUTION LAYER =============
    const subjLower = NORMALIZE(body.subject_description || '');
    const banned = new Set(['', 'general', 'unclassified', 'general concepts', 'n/a', 'none']);

    // Build a fast lookup of taxonomy (name + aliases)
    const taxonomyLookup = new Map<string, { id: string; name: string }>();
    for (const t of taxonomy) {
      taxonomyLookup.set(NORMALIZE(t.name), { id: t.id, name: t.name });
      for (const a of t.aliases) taxonomyLookup.set(NORMALIZE(a), { id: t.id, name: t.name });
    }

    const resolveOne = async (candidate: string): Promise<ResolvedTopic> => {
      const norm = NORMALIZE(candidate);
      if (!norm || banned.has(norm) || norm === subjLower) {
        return { topic: '', topic_id: null, matched: false, confidence: 0, needs_review: true, source: 'fallback' };
      }

      // 1) exact taxonomy / alias match
      const direct = taxonomyLookup.get(norm);
      if (direct) {
        return { topic: direct.name, topic_id: direct.id, matched: true, confidence: 1, needs_review: false, source: 'taxonomy' };
      }

      // 2) DB-side fuzzy resolver (trigram)
      if (subjectId) {
        const { data: rows } = await supabase.rpc('resolve_topic_for_subject', {
          p_subject_id: subjectId,
          p_candidate: candidate,
          p_min_similarity: FUZZY_MIN,
        });
        const best = Array.isArray(rows) ? rows[0] : rows;
        if (best && best.topic_name && best.similarity >= FUZZY_SNAP) {
          return { topic: best.topic_name, topic_id: best.topic_id, matched: true, confidence: Number(best.similarity), needs_review: false, source: 'fuzzy' };
        }
        if (best && best.topic_name && best.similarity >= FUZZY_MIN) {
          // Borderline: snap but flag for admin review
          return { topic: best.topic_name, topic_id: best.topic_id, matched: true, confidence: Number(best.similarity), needs_review: true, source: 'fuzzy' };
        }
      }

      // 3) Genuinely new topic — keep AI candidate but mark for review
      const cleaned = candidate
        .replace(/[^\w\s\-/&()0-9]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .split(' ')
        .slice(0, 6)
        .map(w => w.length > 2 ? w[0].toUpperCase() + w.slice(1) : w)
        .join(' ');
      return { topic: cleaned || candidate.trim(), topic_id: null, matched: false, confidence: 0.3, needs_review: true, source: 'ai_new' };
    };

    const resolutions: ResolvedTopic[] = [];
    for (let i = 0; i < questions.length; i++) {
      const aiHit = aiTopics.find(t => t.idx === i);
      let candidate = (aiHit?.topic || '').trim();

      // If AI failed, take a salient phrase from the question as candidate
      if (!candidate) {
        const cap = questions[i].question_text.match(/\b([A-Z][A-Za-z0-9]*(?:\s+(?:[A-Z][A-Za-z0-9]*|\d+|de|of|the|and)){1,3})\b/);
        candidate = cap ? cap[1] : questions[i].question_text.split(/\s+/).slice(0, 4).join(' ');
      }

      const resolved = await resolveOne(candidate);

      // Final guarantee: never return empty topic
      if (!resolved.topic) {
        resolved.topic = taxonomyNames[0] || `${body.subject_code || 'Subject'} Concepts`;
        resolved.needs_review = true;
        resolved.source = 'fallback';
      }
      resolutions.push(resolved);
    }

    const topics = resolutions.map(r => r.topic);
    console.log(`identify-question-topics: subject_id=${subjectId} taxonomy=${taxonomy.length} matched=${resolutions.filter(r => r.matched).length}/${resolutions.length}`);

    return new Response(JSON.stringify({
      topics,
      resolutions,
      subject_id: subjectId,
      taxonomy_size: taxonomy.length,
      ai_available: aiAvailable,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('identify-question-topics error:', error);
    return new Response(JSON.stringify({ error: 'Failed to identify topics' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
