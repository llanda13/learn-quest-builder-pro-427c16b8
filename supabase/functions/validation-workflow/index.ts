import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { normalizeKnowledgeDimension } from "../../../src/types/knowledge.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

    // Role check - teacher or admin only
    const anonClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } });
    const jwtToken = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await anonClient.auth.getClaims(jwtToken);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const roleClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: userRole } = await roleClient.rpc('get_user_role', { user_id: claimsData.claims.sub });
    if (!userRole || !['admin', 'teacher'].includes(userRole)) {
      return new Response(JSON.stringify({ error: 'Insufficient permissions' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { action, questionId, classification, confidence, notes } = await req.json();

    // Input validation
    if (!action || typeof action !== 'string') {
      return new Response(JSON.stringify({ error: 'action is required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (!questionId || typeof questionId !== 'string') {
      return new Response(JSON.stringify({ error: 'questionId is required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: { user } } = await supabaseClient.auth.getUser(jwtToken);

    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    switch (action) {
      case 'validate': {
        // Whitelist allowed classification fields to prevent mass assignment
        const safeClassification: Record<string, unknown> = {};
        const allowedFields = ['bloom_level', 'knowledge_dimension', 'difficulty', 'cognitive_level'];
        if (classification && typeof classification === 'object') {
          for (const field of allowedFields) {
            if (field in classification && typeof classification[field] === 'string') {
              safeClassification[field] = classification[field];
            }
          }
        }

        // Validate confidence is a number between 0 and 1
        const safeConfidence = typeof confidence === 'number'
          ? Math.min(1, Math.max(0, confidence))
          : 0;

        // Get original classification
        const { data: question } = await supabaseClient
          .from('questions')
          .select('bloom_level, knowledge_dimension, difficulty')
          .eq('id', questionId)
          .single();

        // Log validation
        await supabaseClient
          .from('classification_validations')
          .insert({
            question_id: questionId,
            original_classification: question,
            validated_classification: safeClassification,
            validator_id: user.id,
            validation_confidence: safeConfidence,
            notes: typeof notes === 'string' ? notes.slice(0, 2000) : null,
            validation_type: 'manual'
          });

        // Update question with only whitelisted fields
        await supabaseClient
          .from('questions')
          .update({
            ...safeClassification,
            knowledge_dimension: normalizeKnowledgeDimension(safeClassification.knowledge_dimension),
            validation_status: 'validated',
            validated_by: user.id,
            validation_timestamp: new Date().toISOString(),
            classification_confidence: safeConfidence,
            needs_review: false
          })
          .eq('id', questionId);

        return new Response(
          JSON.stringify({ success: true, message: 'Classification validated' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'reject': {
        await supabaseClient
          .from('questions')
          .update({
            validation_status: 'rejected',
            validated_by: user.id,
            validation_timestamp: new Date().toISOString(),
            needs_review: true,
            metadata: { rejection_notes: notes }
          })
          .eq('id', questionId);

        return new Response(
          JSON.stringify({ success: true, message: 'Classification rejected' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'batch_validate': {
        const { questionIds, autoApproveThreshold = 0.9 } = await req.json();

        const results = {
          validated: 0,
          needsReview: 0,
          rejected: 0
        };

        for (const qId of questionIds) {
          const { data: q } = await supabaseClient
            .from('questions')
            .select('classification_confidence')
            .eq('id', qId)
            .single();

          if (q && q.classification_confidence >= autoApproveThreshold) {
            await supabaseClient
              .from('questions')
              .update({
                validation_status: 'validated',
                validated_by: user.id,
                validation_timestamp: new Date().toISOString()
              })
              .eq('id', qId);
            results.validated++;
          } else {
            results.needsReview++;
          }
        }

        return new Response(
          JSON.stringify({ success: true, results }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      default:
        throw new Error('Invalid action');
    }
  } catch (error) {
    console.error('Error in validation-workflow:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
