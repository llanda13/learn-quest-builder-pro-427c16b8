import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface ScoreSubmissionRequest {
  question_id: string;
  test_id?: string;
  student_id?: string;
  student_name?: string;
  scores: Record<string, number>; // criterion_id -> score
  comments?: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check for all operations
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    const anonClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } })
    const token = authHeader.replace('Bearer ', '')
    const { data: claimsData, error: claimsError } = await anonClient.auth.getClaims(token)
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Role check - teacher or admin only
    const roleCheckClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data: userRole } = await roleCheckClient.rpc('get_user_role', { user_id: claimsData.claims.sub })
    if (!userRole || !['admin', 'teacher'].includes(userRole)) {
      return new Response(JSON.stringify({ error: 'Insufficient permissions' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const url = new URL(req.url)
    console.log(`${req.method} ${url.pathname}`)

    switch (req.method) {
      case 'GET': {
        const questionId = url.searchParams.get('question_id')
        const testId = url.searchParams.get('test_id')
        const studentId = url.searchParams.get('student_id')

        let query = supabase
          .from('rubric_scores')
          .select('*')
          .order('created_at', { ascending: false })

        if (questionId) {
          query = query.eq('question_id', questionId)
        }
        if (testId) {
          query = query.eq('test_id', testId)
        }
        if (studentId) {
          query = query.eq('student_id', studentId)
        }

        const { data, error } = await query

        if (error) {
          console.error('Error fetching scores:', error)
          return new Response(
            JSON.stringify({ error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        return new Response(
          JSON.stringify(data),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      case 'POST': {
        const body: ScoreSubmissionRequest = await req.json()

        if (!body.question_id || !body.scores) {
          return new Response(
            JSON.stringify({ error: 'question_id and scores are required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        // Get current user
        const { data: { user }, error: userError } = await supabase.auth.getUser()
        if (userError || !user) {
          return new Response(
            JSON.stringify({ error: 'User not authenticated' }),
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        // Calculate total score based on criteria weights
        let totalScore = 0
        
        // Get criteria for the question's rubric
        const { data: criteria, error: criteriaError } = await supabase
          .from('rubric_criteria')
          .select('id, weight, max_score')

        if (!criteriaError && criteria) {
          for (const criterion of criteria) {
            const score = body.scores[criterion.id] || 0
            totalScore += score * criterion.weight
          }
        }

        // Create score record
        const { data: scoreRecord, error: scoreError } = await supabase
          .from('rubric_scores')
          .insert({
            question_id: body.question_id,
            test_id: body.test_id,
            student_id: body.student_id,
            student_name: body.student_name,
            scorer_id: user.id,
            scores: body.scores,
            total_score: totalScore,
            comments: body.comments
          })
          .select()
          .single()

        if (scoreError) {
          console.error('Error creating score:', scoreError)
          return new Response(
            JSON.stringify({ error: scoreError.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        return new Response(
          JSON.stringify(scoreRecord),
          { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      case 'PUT': {
        const scoreId = url.pathname.split('/').pop()
        if (!scoreId) {
          return new Response(
            JSON.stringify({ error: 'Score ID required for update' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        const body: Partial<ScoreSubmissionRequest> = await req.json()

        // Calculate total score if scores are being updated
        let totalScore: number | undefined
        if (body.scores) {
          totalScore = 0
          const { data: criteria } = await supabase
            .from('rubric_criteria')
            .select('id, weight, max_score')

          if (criteria) {
            for (const criterion of criteria) {
              const score = body.scores[criterion.id] || 0
              totalScore += score * criterion.weight
            }
          }
        }

        const updateData: any = {
          ...(body.scores && { scores: body.scores }),
          ...(totalScore !== undefined && { total_score: totalScore }),
          ...(body.comments && { comments: body.comments })
        }

        const { data, error } = await supabase
          .from('rubric_scores')
          .update(updateData)
          .eq('id', scoreId)
          .select()
          .single()

        if (error) {
          console.error('Error updating score:', error)
          return new Response(
            JSON.stringify({ error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        return new Response(
          JSON.stringify(data),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      case 'DELETE': {
        const scoreId = url.pathname.split('/').pop()
        if (!scoreId) {
          return new Response(
            JSON.stringify({ error: 'Score ID required for deletion' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        const { error } = await supabase
          .from('rubric_scores')
          .delete()
          .eq('id', scoreId)

        if (error) {
          console.error('Error deleting score:', error)
          return new Response(
            JSON.stringify({ error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        return new Response(
          JSON.stringify({ message: 'Score deleted successfully' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      default:
        return new Response(
          JSON.stringify({ error: 'Method not allowed' }),
          { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }
  } catch (error) {
    console.error('Unexpected error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})