import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { normalizeKnowledgeDimension } from "../../../src/types/knowledge.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * HIGHER ORDER BLOOM LEVELS - These FORBID generic listing
 */
const HIGHER_ORDER_BLOOMS = ['Analyzing', 'Evaluating', 'Creating'];

/**
 * FIX #4: Forbidden patterns for higher-order Bloom levels
 */
const FORBIDDEN_LISTING_PATTERNS = [
  /\b(include|includes)\b/i,
  /\bsuch as\b/i,
  /\bfactors\s+(are|include)\b/i,
  /\bkey\s+(factors|elements|components)\s+(are|include)\b/i,
];

/**
 * Get default answer type based on Bloom level
 */
function getDefaultAnswerType(bloomLevel: string): string {
  const defaults: Record<string, string> = {
    'Remembering': 'definition',
    'Understanding': 'explanation',
    'Applying': 'application',
    'Analyzing': 'analysis',
    'Evaluating': 'evaluation',
    'Creating': 'design',
  };
  return defaults[bloomLevel] || 'explanation';
}

/**
 * FIX #4: Check if answer violates structural constraints
 */
function shouldRejectAnswer(answerType: string, answer: string, bloomLevel: string): boolean {
  if (answerType === 'definition') return false;
  
  const isHigherOrder = HIGHER_ORDER_BLOOMS.includes(bloomLevel);
  if (isHigherOrder) {
    for (const pattern of FORBIDDEN_LISTING_PATTERNS) {
      if (pattern.test(answer)) return true;
    }
  }
  return false;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  let generationSuccess = true;
  let errorType = '';

  try {
    // Auth check
    const authHeaderCheck = req.headers.get('Authorization');
    if (!authHeaderCheck?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const { createClient: createAnonClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    const anonClient = createAnonClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeaderCheck } } });
    const authToken = authHeaderCheck.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await anonClient.auth.getClaims(authToken);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Role check - teacher or admin only
    const roleClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: userRole } = await roleClient.rpc('get_user_role', { user_id: claimsData.claims.sub });
    if (!userRole || !['admin', 'teacher'].includes(userRole)) {
      return new Response(JSON.stringify({ error: 'Insufficient permissions' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { tos_id, request } = await req.json();
    
    // Validate input
    if (!request || (!tos_id && !request.subject_code)) {
      return new Response(
        JSON.stringify({ error: 'Provide a registered subject_code or an active tos_id, together with request.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { topic, bloom_level, difficulty, count = 5 } = request;

    // Input validation
    if (count > 50) {
      return new Response(
        JSON.stringify({ error: 'Maximum 50 questions per request' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    if (topic && topic.length > 500) {
      return new Response(
        JSON.stringify({ error: 'Topic must be at most 500 characters' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Generating questions for:', { tos_id, topic, bloom_level, difficulty, count });

    // Initialize Supabase client
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const normalizeSubject = (value: string | null | undefined) => (value || '').trim().replace(/\s+/g, ' ').toLowerCase();
    let tosRow: { subject_no: string; course: string; description: string } | null = null;
    if (tos_id) {
      const { data, error: tosError } = await supabase
        .from('tos_entries')
        .select('subject_no, course, description')
        .eq('id', tos_id)
        .maybeSingle();
      if (tosError) throw tosError;
      tosRow = data;
      if (!tosRow) {
        return new Response(JSON.stringify({ error: `TOS "${tos_id}" was not found.` }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }
    const requestedSubjectCode = tosRow?.subject_no?.trim() || request.subject_code?.trim();
    if (!requestedSubjectCode) {
      return new Response(JSON.stringify({ error: 'The active TOS has no subject code.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    if (tosRow?.subject_no?.trim() && request.subject_code?.trim()
      && normalizeSubject(tosRow.subject_no) !== normalizeSubject(request.subject_code)) {
      return new Response(JSON.stringify({ error: 'Requested subject code conflicts with the active TOS subject.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { data: subjectRows, error: subjectsError } = await supabase
      .from('academic_subjects')
      .select('id, code, description, specialization_id')
      .ilike('code', requestedSubjectCode)
      .eq('deleted', false);
    if (subjectsError) throw subjectsError;
    let subjectMatches = subjectRows || [];
    if (subjectMatches.length > 1) {
      const officialDescriptions = [
        normalizeSubject(request.subject_description),
        normalizeSubject(tosRow?.course),
        normalizeSubject(tosRow?.description),
      ].filter(Boolean);
      subjectMatches = subjectMatches.filter(subject => officialDescriptions.includes(normalizeSubject(subject.description)));
    }
    if (subjectMatches.length !== 1) {
      return new Response(JSON.stringify({ error: `Subject code "${requestedSubjectCode}" does not resolve to exactly one registered academic subject.` }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    const { data: specialization, error: specializationError } = await supabase
      .from('academic_specializations')
      .select('name, category_id')
      .eq('id', subjectMatches[0].specialization_id)
      .eq('deleted', false)
      .single();
    if (specializationError) throw specializationError;
    const { data: category, error: categoryError } = await supabase
      .from('academic_categories')
      .select('name')
      .eq('id', specialization.category_id)
      .eq('deleted', false)
      .single();
    if (categoryError) throw categoryError;
    if (request.subject_description && normalizeSubject(request.subject_description) !== normalizeSubject(subjectMatches[0].description)) {
      return new Response(JSON.stringify({ error: `Subject description does not match registered subject "${subjectMatches[0].code}".` }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    if (request.category && normalizeSubject(request.category) !== normalizeSubject(category.name)) {
      return new Response(JSON.stringify({ error: `Category does not match registered subject "${subjectMatches[0].code}".` }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    if (request.specialization && normalizeSubject(request.specialization) !== normalizeSubject(specialization.name)) {
      return new Response(JSON.stringify({ error: `Specialization does not match registered subject "${subjectMatches[0].code}".` }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    const canonicalSubject = {
      id: subjectMatches[0].id,
      code: subjectMatches[0].code,
      description: subjectMatches[0].description,
      specialization: specialization.name,
      category: category.name,
    };

    // Get OpenAI API key
    const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openAIApiKey) {
      console.error('OpenAI API key not configured');
      return new Response(
        JSON.stringify({ error: 'Service temporarily unavailable' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // FIX #1 & #2: Bloom instructions now forbid generic listing for higher levels
    const bloomInstructions: Record<string, string> = {
      'Remembering': 'Focus on recall, recognition, and basic facts. Use verbs like define, list, identify, state. Answer type: definition.',
      'Understanding': 'Focus on comprehension and explanation. Use verbs like explain, summarize, describe, interpret. Answer type: explanation.',
      'Applying': 'Focus on using knowledge in new situations. Use verbs like apply, use, implement, solve. Answer type: application.',
      'Analyzing': 'Focus on breaking down information and relationships. Use verbs like analyze, compare, differentiate, examine. Answer type: analysis. FORBIDDEN: generic listing, "include", "such as".',
      'Evaluating': 'Focus on making judgments with justification. Use verbs like evaluate, justify, critique, assess. Answer type: evaluation. FORBIDDEN: generic listing, "include", "such as". MUST include a verdict.',
      'Creating': 'Focus on producing new work. Use verbs like design, create, compose, formulate. Answer type: design. FORBIDDEN: generic listing. MUST produce tangible output.'
    };

    const difficultyInstructions = {
      'Easy': 'Simple, straightforward questions with obvious answers.',
      'Average': 'Moderate complexity requiring some thought and understanding.',
      'Difficult': 'Complex questions requiring deep analysis and critical thinking.'
    };

    const prompt = `Generate ${count} multiple-choice questions for the topic "${topic}" at Bloom's taxonomy level "${bloom_level}" with "${difficulty}" difficulty.

Bloom's Level Instructions: ${bloomInstructions[bloom_level as keyof typeof bloomInstructions] || bloomInstructions['Understanding']}

Difficulty Instructions: ${difficultyInstructions[difficulty as keyof typeof difficultyInstructions] || difficultyInstructions['Average']}

Requirements:
1. Each question must have exactly 4 choices (A, B, C, D)
2. Only one correct answer per question
3. Distractors must be plausible but clearly incorrect
4. No "All of the above" or "None of the above" options
5. Choices should be similar in length and grammatical structure
6. Questions should align with the specified Bloom's level and difficulty

Return a JSON object with an "items" array containing questions in this exact format:
{
  "items": [
    {
      "text": "Question text here?",
      "choices": {
        "A": "First choice",
        "B": "Second choice", 
        "C": "Third choice",
        "D": "Fourth choice"
      },
      "correct_answer": "A",
      "bloom_level": "${bloom_level}",
      "difficulty": "${difficulty}",
      "knowledge_dimension": "Conceptual"
    }
  ]
}`;

    console.log('Sending prompt to OpenAI...');

    // Call OpenAI API
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are an expert educational content creator specializing in generating high-quality multiple-choice questions that align with Bloom\'s taxonomy and educational standards.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        response_format: { type: "json_object" },
        temperature: 0.4,
        max_tokens: 3000
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('OpenAI API error:', error);
      return new Response(
        JSON.stringify({ error: 'Failed to generate questions from AI service' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const aiResponse = await response.json();
    console.log('OpenAI response received');

    let generatedQuestions;
    try {
      const content = aiResponse.choices[0].message.content;
      generatedQuestions = JSON.parse(content);
    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError);
      return new Response(
        JSON.stringify({ error: 'Invalid response format from AI service' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const items = generatedQuestions.items || [];
    console.log(`Generated ${items.length} questions`);

    // Validate and filter questions
    const validQuestions = items.filter((q: any) => {
      return (
        q.text && q.text.length > 10 &&
        q.choices && 
        ['A', 'B', 'C', 'D'].every(key => q.choices[key] && q.choices[key].length > 0) &&
        ['A', 'B', 'C', 'D'].includes(q.correct_answer)
      );
    });

    console.log(`${validQuestions.length} questions passed validation`);

    if (validQuestions.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No valid questions were generated' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get current user from auth header
    const authHeader = req.headers.get('authorization');
    let userId = null;
    
    if (authHeader) {
      try {
        const token = authHeader.replace('Bearer ', '');
        const { data: { user } } = await supabase.auth.getUser(token);
        userId = user?.id;
      } catch (authError) {
        console.error('Auth error:', authError);
      }
    }

    // Prepare questions for database insertion
    const questionsToInsert = validQuestions.map((q: any) => ({
      tos_id: tos_id || null,
      topic,
      question_text: q.text,
      question_type: 'multiple-choice',
      choices: q.choices,
      correct_answer: q.correct_answer,
      bloom_level: q.bloom_level || bloom_level,
      difficulty: q.difficulty || difficulty,
      knowledge_dimension: normalizeKnowledgeDimension(q.knowledge_dimension),
      subject: `${canonicalSubject.code} - ${canonicalSubject.description}`,
      subject_code: canonicalSubject.code,
      subject_description: canonicalSubject.description,
      category: canonicalSubject.category,
      specialization: canonicalSubject.specialization,
      created_by: 'ai',
      approved: false,
      confidence_score: 0.8,
      owner: userId,
      metadata: { academic_subject_id: canonicalSubject.id, tos_id: tos_id || null }
    }));

    // Insert questions into database
    const { data: insertedQuestions, error: insertError } = await supabase
      .from('questions')
      .insert(questionsToInsert)
      .select('*');

    if (insertError) {
      console.error('Database insertion error:', insertError);
      return new Response(
        JSON.stringify({ error: 'Failed to save questions to database', details: insertError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Successfully inserted ${insertedQuestions?.length || 0} questions`);

    // Record metrics
    const duration = Date.now() - startTime;
    const avgQuality = validQuestions.reduce((sum: number, q: any) => sum + (q.quality_score || 0.8), 0) / validQuestions.length;

    // Record metrics (fire and forget)
    supabase.from('performance_benchmarks').insert({
      operation_name: 'generate_questions',
      min_response_time: duration,
      average_response_time: duration,
      max_response_time: duration,
      error_rate: 0,
      throughput: validQuestions.length,
      measurement_period_minutes: 1
    });

    supabase.from('quality_metrics').insert({
      entity_type: 'question_generation',
      characteristic: 'Functional Completeness',
      metric_name: 'generation_success_rate',
      value: (insertedQuestions?.length || 0) / count,
      unit: 'ratio',
      automated: true
    });

    supabase.from('system_metrics').insert({
      metric_category: 'performance',
      metric_name: 'question_generation_time',
      metric_value: duration,
      metric_unit: 'ms',
      dimensions: {
        count: validQuestions.length,
        avg_quality: avgQuality,
        bloom_level,
        difficulty
      }
    });

    return new Response(
      JSON.stringify({
        success: true,
        generated_count: validQuestions.length,
        inserted_count: insertedQuestions?.length || 0,
        questions: insertedQuestions
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    generationSuccess = false;
    errorType = error instanceof Error ? error.name : 'UnknownError';
    console.error('Unexpected error:', error);
    
    const duration = Date.now() - startTime;
    const message = error instanceof Error ? error.message : 'Unknown error';

    // Record error metrics
    try {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      );

      await supabase.from('performance_benchmarks').insert({
        operation_name: 'generate_questions',
        min_response_time: duration,
        average_response_time: duration,
        max_response_time: duration,
        error_rate: 1,
        throughput: 0,
        measurement_period_minutes: 1
      });

      await supabase.from('system_metrics').insert({
        metric_category: 'reliability',
        metric_name: 'error_occurrence',
        metric_value: 1,
        dimensions: {
          error_type: errorType,
          error_message: message,
          operation: 'generate_questions'
        }
      });
    } catch (metricsError) {
      console.error('Failed to record error metrics:', metricsError);
    }

    return new Response(
      JSON.stringify({ error: 'An unexpected error occurred', details: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});