import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { normalizeKnowledgeDimension } from "../../../src/types/knowledge.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
};

type EnhancedClassificationInput = {
  text: string;
  type: 'mcq' | 'true_false' | 'essay' | 'short_answer';
  topic?: string;
  choices?: Record<string, string>;
};

type EnhancedClassificationOutput = {
  bloom_level: 'remembering' | 'understanding' | 'applying' | 'analyzing' | 'evaluating' | 'creating';
  difficulty: 'easy' | 'average' | 'difficult';
  knowledge_dimension: 'factual' | 'conceptual' | 'procedural' | 'metacognitive';
  confidence: number;
  needs_review: boolean;
  quality_score: number;
  readability_score: number;
  semantic_vector: number[];
  similar_questions: string[];
  validation_required: boolean;
};

// Enhanced classification with quality assessment
function enhancedClassifyQuestion(
  input: EnhancedClassificationInput,
  options: any
): EnhancedClassificationOutput {
  const text = input.text.toLowerCase();
  
  // Basic classification (reuse existing logic)
  const { bloom_level, knowledge_dimension, confidence } = classifyBasic(text, input.type);
  const difficulty = inferDifficulty(text, input.type, bloom_level);
  
  // Quality assessment
  const quality_score = assessQuality(input);
  const readability_score = calculateReadability(text);
  
  // Generate semantic vector (simplified)
  const semantic_vector = generateSemanticVector(text);
  
  // Determine if validation is required
  const validation_required = confidence < 0.7 || quality_score < 0.6;
  const needs_review = validation_required || readability_score > 12;

  return {
    bloom_level,
    difficulty,
    knowledge_dimension,
    confidence: Math.round(confidence * 100) / 100,
    needs_review,
    quality_score: Math.round(quality_score * 100) / 100,
    readability_score: Math.round(readability_score * 10) / 10,
    semantic_vector,
    similar_questions: [], // Would be populated by similarity check
    validation_required
  };
}

function classifyBasic(text: string, type: string) {
  // Reuse existing classification logic
  const bloomVerbs: Record<string, string> = {
    'define': 'remembering', 'list': 'remembering', 'recall': 'remembering',
    'explain': 'understanding', 'describe': 'understanding', 'summarize': 'understanding',
    'apply': 'applying', 'use': 'applying', 'implement': 'applying',
    'analyze': 'analyzing', 'compare': 'analyzing', 'examine': 'analyzing',
    'evaluate': 'evaluating', 'assess': 'evaluating', 'judge': 'evaluating',
    'create': 'creating', 'design': 'creating', 'develop': 'creating'
  };

  let bloom_level = 'understanding';
  let confidence = 0.5;

  // Check for verb matches
  for (const [verb, level] of Object.entries(bloomVerbs)) {
    if (text.includes(` ${verb} `) || text.startsWith(verb)) {
      bloom_level = level;
      confidence = 0.8;
      break;
    }
  }

  // Knowledge dimension inference
  let knowledge_dimension = 'conceptual';
  if (text.includes('define') || text.includes('what is')) {
    knowledge_dimension = 'factual';
    confidence += 0.1;
  } else if (text.includes('how to') || text.includes('procedure')) {
    knowledge_dimension = 'procedural';
    confidence += 0.1;
  } else if (text.includes('strategy') || text.includes('best approach')) {
    knowledge_dimension = 'metacognitive';
    confidence += 0.1;
  }

  return {
    bloom_level: bloom_level as any,
    knowledge_dimension: knowledge_dimension as any,
    confidence: Math.min(1, confidence)
  };
}

function inferDifficulty(text: string, type: string, bloom: string): 'easy' | 'average' | 'difficult' {
  const wordCount = text.split(/\s+/).length;
  const complexityScore = (text.match(/[,:;()-]/g)?.length ?? 0);
  
  // Explicit indicators
  if (text.includes('simple') || text.includes('basic')) return 'easy';
  if (text.includes('complex') || text.includes('advanced')) return 'difficult';
  
  // Length and complexity
  if (type === 'essay' || complexityScore > 6 || wordCount > 30) return 'difficult';
  if (wordCount > 15 || complexityScore > 3) return 'average';
  
  // Bloom-based
  if (['remembering', 'understanding'].includes(bloom)) return 'easy';
  if (['evaluating', 'creating'].includes(bloom)) return 'difficult';
  
  return 'average';
}

function assessQuality(input: EnhancedClassificationInput): number {
  let score = 1.0;
  const text = input.text;

  // Length check
  if (text.length < 10) score -= 0.3;
  if (text.length > 500) score -= 0.2;

  // Grammar check (basic)
  if (!/[.?!]$/.test(text.trim())) score -= 0.1;
  if (text.includes('  ')) score -= 0.05; // Double spaces

  // MCQ specific checks
  if (input.type === 'mcq' && input.choices) {
    const choices = Object.values(input.choices);
    if (choices.length < 3) score -= 0.3;
    if (choices.some(c => c.length < 3)) score -= 0.2;
    
    // Check for balanced choice lengths
    const lengths = choices.map(c => c.length);
    const avgLength = lengths.reduce((a, b) => a + b, 0) / lengths.length;
    const variance = lengths.reduce((acc, len) => acc + Math.pow(len - avgLength, 2), 0) / lengths.length;
    if (variance > 100) score -= 0.1;
  }

  // Educational appropriateness
  const educationalTerms = ['concept', 'principle', 'theory', 'method', 'analysis'];
  const hasEducationalTerms = educationalTerms.some(term => text.toLowerCase().includes(term));
  if (hasEducationalTerms) score += 0.1;

  return Math.max(0, Math.min(1, score));
}

function calculateReadability(text: string): number {
  const words = text.split(/\s+/).length;
  const sentences = text.split(/[.!?]+/).length;
  const syllables = estimateSyllables(text);
  
  // Flesch-Kincaid Grade Level
  if (sentences === 0 || words === 0) return 8.0;
  return 0.39 * (words / sentences) + 11.8 * (syllables / words) - 15.59;
}

function estimateSyllables(text: string): number {
  return text.toLowerCase()
    .replace(/[^a-z]/g, '')
    .replace(/[aeiou]{2,}/g, 'a')
    .replace(/[^aeiou]/g, '')
    .length || 1;
}

function generateSemanticVector(text: string): number[] {
  // Simplified semantic vector generation
  const words = text.toLowerCase().split(/\s+/);
  const vector = new Array(50).fill(0); // Smaller vector for demo
  
  words.forEach((word, index) => {
    const hash = simpleHash(word);
    vector[hash % 50] += 1;
  });
  
  // Normalize
  const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
  return magnitude > 0 ? vector.map(val => val / magnitude) : vector;
}

function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const anonClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } });
    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await anonClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Role check - teacher or admin only
    const roleClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!);
    const roleServiceClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: userRole } = await roleServiceClient.rpc('get_user_role', { user_id: claimsData.claims.sub });
    if (!userRole || !['admin', 'teacher'].includes(userRole)) {
      return new Response(JSON.stringify({ error: 'Insufficient permissions' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { questions, options = {}, saveToDatabase = false } = await req.json();
    
    if (!Array.isArray(questions)) {
      throw new Error('Expected array of questions');
    }

    // Input validation
    if (questions.length > 100) {
      throw new Error('Maximum 100 questions per request');
    }
    for (const q of questions) {
      if (q.text && q.text.length > 10000) {
        throw new Error('Each question text must be at most 10000 characters');
      }
    }

    // Initialize Supabase client if saving to database
    let supabaseClient;
    if (saveToDatabase) {
      supabaseClient = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      );
    }

    const results: EnhancedClassificationOutput[] = [];

    for (const question of questions) {
      const classification = enhancedClassifyQuestion(question, options);
      results.push(classification);

      // Save to database if enabled
      if (saveToDatabase && supabaseClient && question.id) {
        const autoApproveThreshold = options.autoApproveThreshold || 0.85;
        const autoApprove = classification.confidence >= autoApproveThreshold && !classification.needs_review;

        // Update question with classification
        const { error: updateError } = await supabaseClient
          .from('questions')
          .update({
            bloom_level: classification.bloom_level,
            difficulty: classification.difficulty,
            knowledge_dimension: normalizeKnowledgeDimension(classification.knowledge_dimension),
            classification_confidence: classification.confidence,
            semantic_vector: JSON.stringify(classification.semantic_vector),
            quality_score: classification.quality_score,
            readability_score: classification.readability_score,
            validation_status: autoApprove ? 'validated' : 'pending',
            needs_review: classification.needs_review,
            updated_at: new Date().toISOString()
          })
          .eq('id', question.id);

        if (updateError) {
          console.error('Error updating question:', updateError);
        }

        // If similarity checking is enabled, calculate and store similarities
        if (options.check_similarity && question.topic) {
          const { data: similarQuestions, error: similarError } = await supabaseClient
            .from('questions')
            .select('id, question_text')
            .eq('topic', question.topic)
            .neq('id', question.id)
            .limit(50);

          if (!similarError && similarQuestions) {
            for (const simQuestion of similarQuestions) {
              const similarity = calculateSimilarity(
                question.text,
                simQuestion.question_text
              );

              if (similarity >= (options.similarityThreshold || 0.7)) {
                await supabaseClient
                  .from('question_similarities')
                  .upsert({
                    question1_id: question.id,
                    question2_id: simQuestion.id,
                    similarity_score: similarity,
                    algorithm_used: 'cosine',
                    calculated_at: new Date().toISOString()
                  }, {
                    onConflict: 'question1_id,question2_id'
                  });
              }
            }
          }
        }
      }
    }

    return new Response(JSON.stringify({
      results,
      savedToDatabase: saveToDatabase,
      autoApprovedCount: results.filter(r => r.confidence >= 0.85 && !r.needs_review).length
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (error) {
    console.error('Enhanced classification error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: `Enhanced classification failed: ${message}` }), 
      { 
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      }
    );
  }
});

// Helper function to calculate text similarity
function calculateSimilarity(text1: string, text2: string): number {
  const vec1 = generateSemanticVector(text1);
  const vec2 = generateSemanticVector(text2);
  
  // Cosine similarity
  let dotProduct = 0;
  let mag1 = 0;
  let mag2 = 0;
  
  for (let i = 0; i < vec1.length; i++) {
    dotProduct += vec1[i] * vec2[i];
    mag1 += vec1[i] * vec1[i];
    mag2 += vec2[i] * vec2[i];
  }
  
  return dotProduct / (Math.sqrt(mag1) * Math.sqrt(mag2)) || 0;
}
