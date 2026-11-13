import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * HIGHER ORDER BLOOM LEVELS - These FORBID generic listing
 */
const HIGHER_ORDER_BLOOMS = ['Analyzing', 'Evaluating', 'Creating'];

/**
 * Registry snapshot type for enforcement
 */
interface RegistrySnapshot {
  usedIntents: string[];
  usedConcepts: Record<string, string[]>;
  usedOperations: Record<string, string[]>;
  usedPairs: string[];
}

/**
 * Intent payload with assigned constraints
 */
interface IntentPayload {
  answer_type: string;
  answer_type_constraint: string;
  assigned_concept: string;
  assigned_operation: string;
  forbidden_patterns: string[];
}

/**
 * FIX #4: Forbidden patterns for higher-order Bloom levels
 */
const FORBIDDEN_LISTING_PATTERNS = [
  /\b(include|includes)\b/i,
  /\bsuch as\b/i,
  /\bfactors\s+(are|include)\b/i,
  /\bkey\s+(factors|elements|components)\s+(are|include)\b/i,
  /\bthe\s+(main|key|primary)\s+\w+\s+(are|include)\b/i,
  /\bthese\s+(are|include)\b/i,
];

const BLOOM_INSTRUCTIONS: Record<string, string> = {
  'Remembering': 'Focus on recall and recognition. Use verbs: define, list, identify, name, state, recall, recognize.',
  'Understanding': 'Focus on comprehension and explanation. Use verbs: explain, summarize, describe, interpret, classify.',
  'Applying': 'Focus on using knowledge in new situations. Use verbs: apply, solve, implement, demonstrate, use, execute.',
  'Analyzing': 'Focus on breaking down information and relationships. Use verbs: analyze, compare, differentiate, examine, deconstruct. NEVER use generic listing.',
  'Evaluating': 'Focus on making judgments with justification. Use verbs: evaluate, justify, critique, assess, defend. MUST include a verdict.',
  'Creating': 'Focus on producing new or original work. Use verbs: design, create, compose, formulate, construct. MUST produce tangible output.'
};

const KNOWLEDGE_INSTRUCTIONS: Record<string, string> = {
  'factual': 'Target FACTUAL knowledge: terminology, specific details, basic elements.',
  'conceptual': 'Target CONCEPTUAL knowledge: theories, principles, models, classifications.',
  'procedural': 'Target PROCEDURAL knowledge: methods, techniques, algorithms, processes.',
  'metacognitive': 'Target METACOGNITIVE knowledge: self-awareness, strategic thinking, reflection.'
};

const DIFFICULTY_INSTRUCTIONS: Record<string, string> = {
  'Easy': 'Simple, straightforward questions with clear answers.',
  'Average': 'Moderate complexity requiring thought and understanding.',
  'Difficult': 'Complex questions requiring deep analysis or synthesis.'
};

/**
 * FIX #2 & #3: Answer Type Structure Prompts
 * Each answer type has explicit structural requirements
 */
const ANSWER_TYPE_STRUCTURES: Record<string, {
  requirement: string;
  forbiddenPatterns: string[];
  structuralRule: string;
}> = {
  'definition': {
    requirement: 'State what something IS - terminology, facts, specific details.',
    forbiddenPatterns: [],
    structuralRule: 'Direct statement of meaning or identification. May use listing.',
  },
  'explanation': {
    requirement: 'Describe HOW or WHY something works, occurs, or is connected.',
    forbiddenPatterns: ['include', 'such as'],
    structuralRule: 'Must show cause-effect or mechanism. Cannot merely enumerate.',
  },
  'comparison': {
    requirement: 'Explicitly compare at least TWO elements. State BOTH similarities AND differences.',
    forbiddenPatterns: ['include', 'such as', 'factors'],
    structuralRule: 'Must mention Element A vs Element B. Cannot list features of only one.',
  },
  'procedure': {
    requirement: 'Outline ordered STEPS or PROCESSES to accomplish something.',
    forbiddenPatterns: ['include', 'such as'],
    structuralRule: 'Must be sequential (Step 1, Step 2...). Cannot be unordered list.',
  },
  'application': {
    requirement: 'USE knowledge to solve a new problem or address a specific scenario.',
    forbiddenPatterns: ['include', 'such as', 'factors are'],
    structuralRule: 'Must reference the specific scenario. Cannot be abstract.',
  },
  'evaluation': {
    requirement: 'Make a JUDGMENT based on criteria. State whether something is effective, valid, or optimal.',
    forbiddenPatterns: ['include', 'such as', 'factors'],
    structuralRule: 'Must contain a verdict (better/worse, effective/ineffective). Cannot merely describe.',
  },
  'justification': {
    requirement: 'Provide REASONS and EVIDENCE for a position, decision, or approach.',
    forbiddenPatterns: ['include', 'such as'],
    structuralRule: 'Must contain "because", "therefore", "this works because". Cannot merely list points.',
  },
  'analysis': {
    requirement: 'BREAK DOWN information into components and explain their RELATIONSHIPS.',
    forbiddenPatterns: ['include', 'such as', 'key factors'],
    structuralRule: 'Must identify parts AND how they interact. Cannot list parts without relationships.',
  },
  'design': {
    requirement: 'CREATE a plan, blueprint, or specification for something new.',
    forbiddenPatterns: ['include', 'such as'],
    structuralRule: 'Must have structure (sections, components) and purpose. Cannot be abstract description.',
  },
  'construction': {
    requirement: 'BUILD or PRODUCE something original and concrete.',
    forbiddenPatterns: ['include'],
    structuralRule: 'Must be a tangible output (example, prototype, solution). Cannot be theoretical.',
  },
};

/**
 * FIX #4: Check if answer violates structural constraints
 */
function shouldRejectAnswer(
  answerType: string,
  answer: string,
  bloomLevel: string
): { reject: boolean; reason?: string } {
  if (answerType === 'definition') {
    return { reject: false };
  }
  
  const isHigherOrder = HIGHER_ORDER_BLOOMS.includes(bloomLevel);
  
  if (isHigherOrder) {
    for (const pattern of FORBIDDEN_LISTING_PATTERNS) {
      if (pattern.test(answer)) {
        return {
          reject: true,
          reason: `Answer uses forbidden listing pattern for ${bloomLevel} level`
        };
      }
    }
  }
  
  const structure = ANSWER_TYPE_STRUCTURES[answerType];
  if (structure) {
    for (const forbidden of structure.forbiddenPatterns) {
      if (answer.toLowerCase().includes(forbidden.toLowerCase())) {
        return {
          reject: true,
          reason: `Answer uses pattern "${forbidden}" which is forbidden for ${answerType} type`
        };
      }
    }
  }
  
  return { reject: false };
}

/**
 * Check if concept::operation pair is already used
 */
function isPairUsedInRegistry(
  registry: RegistrySnapshot,
  concept: string,
  operation: string
): boolean {
  const pairKey = `${concept.toLowerCase()}::${operation.toLowerCase()}`;
  return registry.usedPairs.includes(pairKey);
}

/**
 * Check if concept is already used for topic
 */
function isConceptUsedInRegistry(
  registry: RegistrySnapshot,
  topic: string,
  concept: string
): boolean {
  const topicKey = topic.toLowerCase().trim();
  const concepts = registry.usedConcepts[topicKey] || [];
  return concepts.map(c => c.toLowerCase()).includes(concept.toLowerCase());
}

/**
 * Check if operation is already used for topic+bloom
 */
function isOperationUsedInRegistry(
  registry: RegistrySnapshot,
  topic: string,
  bloomLevel: string,
  operation: string
): boolean {
  const key = `${topic.toLowerCase()}_${bloomLevel.toLowerCase()}`;
  const operations = registry.usedOperations[key] || [];
  return operations.map(o => o.toLowerCase()).includes(operation.toLowerCase());
}

/**
 * Build answer constraint section for prompt
 */
function buildAnswerConstraint(answerType: string, bloomLevel: string): string {
  const structure = ANSWER_TYPE_STRUCTURES[answerType];
  if (!structure) return '';
  
  const isHigherOrder = HIGHER_ORDER_BLOOMS.includes(bloomLevel);
  
  return `
=== ANSWER STRUCTURE: ${answerType.toUpperCase()} (ENFORCED) ===
REQUIREMENT: ${structure.requirement}
STRUCTURAL RULE: ${structure.structuralRule}

${structure.forbiddenPatterns.length > 0 || isHigherOrder ? `
⛔ FORBIDDEN PATTERNS (WILL CAUSE REJECTION):
${isHigherOrder ? `- "include" / "includes"
- "such as"
- "Key factors include..."
- Generic enumeration of any kind` : ''}
${structure.forbiddenPatterns.map(p => `- "${p}"`).join('\n')}

If your answer contains ANY of these patterns, it WILL BE REJECTED and you must regenerate.
` : ''}`;
}

/**
 * Build the HARD CONSTRAINT section that makes redundancy structurally impossible
 */
function buildHardConstraintSection(
  intents: IntentPayload[],
  registry: RegistrySnapshot,
  topic: string,
  bloomLevel: string
): string {
  // Build list of already-used elements for GPT awareness
  const topicKey = topic.toLowerCase().trim();
  const usedConcepts = registry.usedConcepts[topicKey] || [];
  const bloomKey = `${topic.toLowerCase()}_${bloomLevel.toLowerCase()}`;
  const usedOperations = registry.usedOperations[bloomKey] || [];
  const usedPairs = registry.usedPairs;

  return `
🚨🚨🚨 HARD CONSTRAINTS - VIOLATION = IMMEDIATE REJECTION 🚨🚨🚨

You are a RENDERER, not a decision-maker. All decisions have been made.

=== ALREADY USED (DO NOT REUSE) ===
Previously used concepts for "${topic}": ${usedConcepts.length > 0 ? usedConcepts.join(', ') : 'none yet'}
Previously used operations for "${topic}/${bloomLevel}": ${usedOperations.length > 0 ? usedOperations.join(', ') : 'none yet'}
Previously used concept::operation pairs: ${usedPairs.length > 0 ? usedPairs.join(', ') : 'none yet'}

=== ASSIGNED CONSTRAINTS PER QUESTION ===
${intents.map((intent, idx) => `
Question ${idx + 1}:
  → ASSIGNED CONCEPT: "${intent.assigned_concept}" (MUST target exactly this)
  → ASSIGNED OPERATION: "${intent.assigned_operation}" (MUST require exactly this cognitive action)
  → ANSWER TYPE: "${intent.answer_type}" (MUST produce exactly this structure)
  → FORBIDDEN IN ANSWER: ${intent.forbidden_patterns.length > 0 ? intent.forbidden_patterns.join(', ') : 'none'}
`).join('\n')}

=== ENFORCEMENT RULES ===
1. Each question MUST target ONLY its assigned concept - no substitutions
2. Each question MUST require EXACTLY its assigned cognitive operation
3. Each answer MUST follow its assigned answer_type structure
4. If you cannot produce a valid question for the constraints, return {"error": "Cannot satisfy constraints"}
5. NEVER reuse a concept or operation that appears in "ALREADY USED"
6. NEVER produce two questions targeting the same concept or requiring the same operation

These are not suggestions. They are contract requirements.
`;
}

/**
 * Generate the prompt for intent-driven pipeline with HARD ENFORCEMENT
 */
function buildIntentDrivenPrompt(
  topic: string,
  bloomLevel: string,
  knowledgeDimension: string,
  difficulty: string,
  intents: IntentPayload[],
  registry: RegistrySnapshot,
  isMCQ: boolean
): string {
  const hardConstraints = buildHardConstraintSection(intents, registry, topic, bloomLevel);
  
  const questionsToGenerate = intents.map((intent, idx) => {
    const constraint = buildAnswerConstraint(intent.answer_type, bloomLevel);
    
    return `
--- Question ${idx + 1} Specification ---
ASSIGNED CONCEPT: "${intent.assigned_concept}"
REQUIRED COGNITIVE OPERATION: "${intent.assigned_operation}"  
ANSWER TYPE: "${intent.answer_type}"
${constraint}
${intent.answer_type_constraint}`;
  }).join('\n');

  return `Generate ${intents.length} DISTINCT exam question(s) using the INTENT-DRIVEN PIPELINE.

${hardConstraints}

=== TOPIC ===
${topic}

=== BLOOM'S LEVEL: ${bloomLevel} ===
${BLOOM_INSTRUCTIONS[bloomLevel] || BLOOM_INSTRUCTIONS['Understanding']}

=== KNOWLEDGE DIMENSION: ${knowledgeDimension.toUpperCase()} ===
${KNOWLEDGE_INSTRUCTIONS[knowledgeDimension.toLowerCase()]}

=== DIFFICULTY: ${difficulty} ===
${DIFFICULTY_INSTRUCTIONS[difficulty] || DIFFICULTY_INSTRUCTIONS['Average']}

=== QUESTION SPECIFICATIONS ===
${questionsToGenerate}

${isMCQ ? `=== MCQ FORMAT ===
- 4 choices (A, B, C, D)
- One correct answer
- Plausible distractors that test understanding of the ASSIGNED CONCEPT
- Correct answer must match the answer_type structure` : `=== ESSAY FORMAT ===
- Open-ended requiring extended response about the ASSIGNED CONCEPT
- Model answer must demonstrate the answer_type structure using the REQUIRED OPERATION`}

Return JSON:
{
  "questions": [
    {
      "text": "Question about [assigned_concept] requiring [assigned_operation]",
      ${isMCQ ? `"choices": {"A": "...", "B": "...", "C": "...", "D": "..."},
      "correct_answer": "A",` : `"rubric_points": ["Point 1", "Point 2"],`}
      "answer": "Model answer using ${intents[0]?.answer_type || 'assigned'} structure",
      "answer_type": "${intents[0]?.answer_type || 'explanation'}",
      "targeted_concept": "the exact concept this question targets",
      "cognitive_operation_used": "the exact operation required to answer",
      "why_unique": "Brief explanation of how this differs from other questions"
    }
  ]
}`;
}

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
 * Generate the legacy prompt (fallback when no intents provided)
 */
function buildLegacyPrompt(
  topic: string,
  bloomLevel: string,
  knowledgeDimension: string,
  difficulty: string,
  count: number,
  isMCQ: boolean
): string {
  return buildLegacyPromptMultiType(topic, bloomLevel, knowledgeDimension, difficulty, count, isMCQ ? 'mcq' : 'essay');
}

/**
 * Build legacy prompt supporting all question types
 */
function buildLegacyPromptMultiType(
  topic: string,
  bloomLevel: string,
  knowledgeDimension: string,
  difficulty: string,
  count: number,
  questionType: string
): string {
  const isHigherOrder = HIGHER_ORDER_BLOOMS.includes(bloomLevel);
  const defaultAnswerType = getDefaultAnswerType(bloomLevel);
  const answerConstraint = buildAnswerConstraint(defaultAnswerType, bloomLevel);
  
  let formatSection = '';
  
  switch (questionType) {
    case 'true_false':
      formatSection = `=== TRUE/FALSE FORMAT ===
- Each question is a statement that is either TRUE or FALSE
- Statements must be unambiguous — clearly true or clearly false
- Avoid double negatives and trick wording
- Approximately half should be TRUE and half FALSE
- correct_answer must be exactly "True" or "False"

Return JSON:
{
  "questions": [
    {
      "text": "Statement text here.",
      "correct_answer": "True",
      "answer": "True — explanation of why",
      "answer_type": "${defaultAnswerType}"
    }
  ]
}`;
      break;
    case 'fill_blank':
    case 'short_answer':
      formatSection = `=== FILL-IN-THE-BLANK FORMAT ===
- Each question contains a blank indicated by "__________"
- The blank should replace ONE key term or short phrase
- The correct answer must be 1-3 words, clear and specific
- Avoid blanks that could have multiple valid answers

Return JSON:
{
  "questions": [
    {
      "text": "The process of __________ ensures quality in ${topic}.",
      "correct_answer": "validation",
      "answer": "validation — because it verifies correctness",
      "answer_type": "${defaultAnswerType}"
    }
  ]
}`;
      break;
    case 'essay':
      formatSection = `=== ESSAY FORMAT ===
- Open-ended question requiring extended response
- Should require ${defaultAnswerType} type response
- Include rubric points for grading

Return JSON:
{
  "questions": [
    {
      "text": "Essay question text",
      "rubric_points": ["Point 1", "Point 2", "Point 3"],
      "correct_answer": "Model answer outline",
      "answer": "Model answer using ${defaultAnswerType} structure",
      "answer_type": "${defaultAnswerType}"
    }
  ]
}`;
      break;
    default: // mcq
      formatSection = `=== MCQ REQUIREMENTS ===
- 4 choices (A, B, C, D)
- One correct answer
- Plausible distractors
- Correct answer must demonstrate ${defaultAnswerType} structure

Return JSON:
{
  "questions": [
    {
      "text": "Question text",
      "choices": {"A": "...", "B": "...", "C": "...", "D": "..."},
      "correct_answer": "A",
      "answer": "Model answer following ${defaultAnswerType} structure",
      "answer_type": "${defaultAnswerType}",
      "bloom_alignment_note": "Alignment with ${bloomLevel}",
      "knowledge_alignment_note": "Targets ${knowledgeDimension} knowledge"
    }
  ]
}`;
      break;
  }
  
  return `Generate ${count} high-quality exam question(s).

=== TOPIC ===
${topic}

=== BLOOM'S LEVEL: ${bloomLevel} ===
${BLOOM_INSTRUCTIONS[bloomLevel] || BLOOM_INSTRUCTIONS['Understanding']}

=== KNOWLEDGE DIMENSION: ${knowledgeDimension.toUpperCase()} ===
${KNOWLEDGE_INSTRUCTIONS[knowledgeDimension.toLowerCase()]}

=== DIFFICULTY: ${difficulty} ===
${DIFFICULTY_INSTRUCTIONS[difficulty] || DIFFICULTY_INSTRUCTIONS['Average']}

=== REQUIRED ANSWER TYPE: ${defaultAnswerType.toUpperCase()} ===
${answerConstraint}

${isHigherOrder ? `
🚨 CRITICAL FOR ${bloomLevel.toUpperCase()} LEVEL 🚨
You are NOT allowed to answer using:
- "include" or "includes"
- "such as"
- "Key factors include..."
- Simple listing of factors or elements
- Generic enumeration

These patterns are FORBIDDEN. Your answer must demonstrate actual ${bloomLevel.toLowerCase()} thinking.
VIOLATION = REJECTION AND REGENERATION.
` : ''}

${formatSection}`;
}

/**
 * Validate that generated question matches its assigned constraints
 */
function validateQuestionMatchesIntent(
  question: any,
  intent: IntentPayload,
  topic: string,
  bloomLevel: string,
  registry: RegistrySnapshot
): { valid: boolean; reasons: string[] } {
  const reasons: string[] = [];
  
  // Check answer structure
  const answerRejection = shouldRejectAnswer(
    intent.answer_type,
    question.answer || '',
    bloomLevel
  );
  if (answerRejection.reject) {
    reasons.push(answerRejection.reason || 'Answer structure violation');
  }
  
  // Check if concept was already used
  if (isConceptUsedInRegistry(registry, topic, intent.assigned_concept)) {
    reasons.push(`Concept "${intent.assigned_concept}" was already used for this topic`);
  }
  
  // Check if operation was already used
  if (isOperationUsedInRegistry(registry, topic, bloomLevel, intent.assigned_operation)) {
    reasons.push(`Operation "${intent.assigned_operation}" was already used for this topic+bloom`);
  }
  
  // Check if pair was already used
  if (isPairUsedInRegistry(registry, intent.assigned_concept, intent.assigned_operation)) {
    reasons.push(`Concept::Operation pair already used`);
  }
  
  return {
    valid: reasons.length === 0,
    reasons
  };
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
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    const anonClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } });
    const authToken = authHeader.replace('Bearer ', '');
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

    const { 
      topic, 
      bloom_level, 
      knowledge_dimension,
      difficulty = 'Average',
      count = 1,
      question_type = 'mcq',
      intents,
      pipeline_mode,
      registry_snapshot,
      regeneration_context
    } = await req.json();

    if (!topic || !bloom_level || !knowledge_dimension) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: topic, bloom_level, knowledge_dimension' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const validDimensions = ['factual', 'conceptual', 'procedural', 'metacognitive'];
    if (!validDimensions.includes(knowledge_dimension.toLowerCase())) {
      return new Response(
        JSON.stringify({ error: `Invalid knowledge_dimension. Must be one of: ${validDimensions.join(', ')}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Try Lovable AI Gateway first, fall back to OpenAI
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
    
    const apiUrl = lovableApiKey 
      ? 'https://ai.gateway.lovable.dev/v1/chat/completions'
      : 'https://api.openai.com/v1/chat/completions';
    const apiKey = lovableApiKey || openAIApiKey;
    const modelName = lovableApiKey ? 'google/gemini-2.5-flash' : 'gpt-4o-mini';
    
    if (!apiKey) {
      console.error('No AI API key configured (checked LOVABLE_API_KEY and OPENAI_API_KEY)');
      return new Response(
        JSON.stringify({ error: 'AI service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Using AI provider: ${lovableApiKey ? 'Lovable Gateway' : 'OpenAI'}, model: ${modelName}`);

    const isMCQ = question_type === 'mcq';
    const isTrueFalse = question_type === 'true_false';
    const isFillBlank = question_type === 'fill_blank' || question_type === 'short_answer';
    const isEssay = question_type === 'essay';
    const isIntentDriven = pipeline_mode === 'intent_driven' && Array.isArray(intents) && intents.length > 0;
    
    // Initialize registry from snapshot or create empty
    const registry: RegistrySnapshot = registry_snapshot || {
      usedIntents: [],
      usedConcepts: {},
      usedOperations: {},
      usedPairs: []
    };

    // Build prompt based on pipeline mode
    const basePrompt = isIntentDriven
      ? buildIntentDrivenPrompt(topic, bloom_level, knowledge_dimension, difficulty, intents, registry, isMCQ)
      : buildLegacyPromptMultiType(topic, bloom_level, knowledge_dimension, difficulty, count, question_type);
    const rejectedQuestions = Array.isArray(regeneration_context?.rejected_questions)
      ? regeneration_context.rejected_questions
      : [];
    const regenerationPrompt = regeneration_context
      ? `

=== SLOT-LOCKED REGENERATION ===
Fill question number ${regeneration_context.question_number} only.
Required type: ${regeneration_context.question_type || question_type}.
Required topic: ${regeneration_context.topic || topic}.
Required Bloom level: ${regeneration_context.bloom_level || bloom_level}.
Required difficulty: ${regeneration_context.difficulty || difficulty}.
Required knowledge dimension: ${regeneration_context.knowledge_dimension || knowledge_dimension}.
${regeneration_context.essay_prompt_group_id
  ? `This is response slot ${regeneration_context.question_number} within shared Essay Prompt ${regeneration_context.essay_prompt_number}, covering item numbers ${regeneration_context.essay_prompt_start_number}-${regeneration_context.essay_prompt_end_number}. Keep this response slot distinct and aligned to its own TOS metadata.`
  : ''}
Keep every requirement above unchanged. Do not change the question type to make the Bloom level easier.
The following candidates were rejected; do NOT repeat them or merely reword them. Change the specific learning objective, scenario, and expected answer while staying within the same assigned topic and cognitive requirements:
${rejectedQuestions.map((entry: any, index: number) =>
  `${index + 1}. Rejected question: "${String(entry.question || '').slice(0, 500)}" | Reason: ${String(entry.reason || 'Rejected by final format or duplicate validation.').slice(0, 300)}`
).join('\n')}
Return only a replacement satisfying the original output schema.
=== END SLOT-LOCKED REGENERATION ===`
      : '';
    const prompt = `${basePrompt}${regenerationPrompt}`;

    const systemPrompt = isIntentDriven
      ? `You are an expert educational content RENDERER implementing a constrained question generation pipeline. You do NOT make creative decisions. All structural decisions (concept, operation, answer type) have been made for you. Your ONLY job is to render questions that exactly match the assigned constraints. If you cannot satisfy a constraint, you MUST return an error rather than deviate.`
      : `You are an expert educational content creator specializing in Bloom's taxonomy and knowledge dimensions.`;

    console.log(`[${isIntentDriven ? 'INTENT-DRIVEN' : 'LEGACY'}] Generating ${isIntentDriven ? intents.length : count} ${question_type} question(s): ${topic} / ${bloom_level} / ${knowledge_dimension}`);
    if (isIntentDriven) {
      console.log(`Registry state: ${registry.usedPairs.length} pairs, ${Object.keys(registry.usedConcepts).length} topic concepts`);
      intents.forEach((intent: IntentPayload, idx: number) => {
        console.log(`  Q${idx+1}: concept="${intent.assigned_concept}", op="${intent.assigned_operation}", type="${intent.answer_type}"`);
      });
    }

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: modelName,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt }
        ],
        response_format: { type: "json_object" },
        temperature: isIntentDriven ? 0.2 : 0.4,
        max_tokens: 3000
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('AI API error:', error);
      return new Response(
        JSON.stringify({ error: 'Failed to generate questions from AI service', details: error }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const aiResponse = await response.json();
    
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

    const questions = generatedQuestions.questions || [];
    
    // Track newly used elements to return to caller
    const newlyUsedPairs: string[] = [];
    const newlyUsedConcepts: string[] = [];
    const newlyUsedOperations: string[] = [];
    
    // Validate and process each question
    const validQuestions = questions
      .filter((q: any) => q.text && q.text.length > 10)
      .map((q: any, idx: number) => {
        const intent = isIntentDriven ? intents[idx] : null;
        const answerType = intent?.answer_type || q.answer_type || getDefaultAnswerType(bloom_level);
        const answer = q.answer || '';
        
        // Validate against intent if available
        let validation = { valid: true, reasons: [] as string[] };
        if (intent) {
          validation = validateQuestionMatchesIntent(q, intent, topic, bloom_level, registry);
        } else {
          // Legacy mode validation
          const rejection = shouldRejectAnswer(answerType, answer, bloom_level);
          if (rejection.reject) {
            validation = { valid: false, reasons: [rejection.reason || 'Structure violation'] };
          }
        }
        
        // Track what was used
        const concept = intent?.assigned_concept || q.targeted_concept || 'general';
        const operation = intent?.assigned_operation || q.cognitive_operation_used || 'explain';
        const pairKey = `${concept.toLowerCase()}::${operation.toLowerCase()}`;
        
        if (validation.valid) {
          newlyUsedPairs.push(pairKey);
          newlyUsedConcepts.push(concept);
          newlyUsedOperations.push(operation);
        }
        
        return {
          text: q.text,
          choices: q.choices,
          correct_answer: q.correct_answer,
          answer: q.answer,
          rubric_points: q.rubric_points,
          bloom_level,
          knowledge_dimension: knowledge_dimension.toLowerCase(),
          difficulty,
          topic,
          question_type,
          answer_type: answerType,
          targeted_concept: concept,
          cognitive_operation_used: operation,
          bloom_alignment_note: q.bloom_alignment_note,
          knowledge_alignment_note: q.knowledge_alignment_note,
          answer_type_note: q.answer_type_note,
          structure_validation: q.structure_validation,
          why_unique: q.why_unique,
          // Validation status
          structure_validated: validation.valid,
          rejection_reasons: validation.reasons.length > 0 ? validation.reasons : undefined,
          // Intent tracking
          assigned_concept: intent?.assigned_concept,
          assigned_operation: intent?.assigned_operation,
          intent_answer_type: intent?.answer_type
        };
      });
    
    const validCount = validQuestions.filter((q: any) => q.structure_validated).length;
    const rejectedCount = validQuestions.length - validCount;
    
    if (rejectedCount > 0) {
      console.warn(`⚠️ ${rejectedCount} question(s) failed validation:`);
      validQuestions
        .filter((q: any) => !q.structure_validated)
        .forEach((q: any) => console.warn(`  - ${q.rejection_reasons?.join(', ')}`));
    }

    console.log(`✅ Generated ${validQuestions.length} questions (${validCount} passed validation)`);

    // Return updated registry state for caller to persist
    const updatedRegistry: RegistrySnapshot = {
      usedIntents: [...registry.usedIntents],
      usedConcepts: { ...registry.usedConcepts },
      usedOperations: { ...registry.usedOperations },
      usedPairs: [...registry.usedPairs, ...newlyUsedPairs]
    };
    
    // Update concepts
    const topicKey = topic.toLowerCase().trim();
    updatedRegistry.usedConcepts[topicKey] = [
      ...(registry.usedConcepts[topicKey] || []),
      ...newlyUsedConcepts
    ];
    
    // Update operations
    const bloomKey = `${topic.toLowerCase()}_${bloom_level.toLowerCase()}`;
    updatedRegistry.usedOperations[bloomKey] = [
      ...(registry.usedOperations[bloomKey] || []),
      ...newlyUsedOperations
    ];

    return new Response(
      JSON.stringify({
        success: true,
        questions: validQuestions,
        pipeline_mode: isIntentDriven ? 'intent_driven' : 'legacy',
        validation_summary: {
          total: validQuestions.length,
          passed: validCount,
          failed: rejectedCount,
          newly_used_pairs: newlyUsedPairs,
          newly_used_concepts: newlyUsedConcepts,
          newly_used_operations: newlyUsedOperations
        },
        // CRITICAL: Return updated registry for session persistence
        updated_registry: updatedRegistry
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Unexpected error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: 'An unexpected error occurred', details: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
