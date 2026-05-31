import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
};

// ============= UUID GENERATOR =============
function generateUUID(): string {
  // Try native crypto.randomUUID first (preferred)
  if (typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  // Fallback to RFC 4122 v4 UUID generation
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// ============= TYPES =============

interface TopicDistribution {
  topic: string;
  counts: {
    remembering: number;
    understanding: number;
    applying: number;
    analyzing: number;
    evaluating: number;
    creating: number;
    difficulty: { easy: number; average: number; difficult: number };
  };
}

interface GenerationInput {
  tos_id: string;
  total_items: number;
  distributions: TopicDistribution[];
  allow_unapproved?: boolean;
  prefer_existing?: boolean;
  force_ai_generation?: boolean;
}

/**
 * SUBJECT CONTEXT: Re-injected into EVERY batch prompt to prevent AI drift
 * during long generation sequences (especially for technical subjects).
 */
interface SubjectContext {
  subjectCode: string;
  courseName: string;
  description: string;
  technicalKeywords: string[];
  isTechnical: boolean;
  // Transient — set per-batch so the SUBJECT ANCHOR can include item position and
  // checkpoint reinforcement to prevent context exhaustion on long generations.
  position?: { current: number; total: number; checkpoint?: boolean };
}

/**
 * Heuristic technical-domain detection so the AI persona stays anchored
 * for Programming/Multimedia/IT-style courses.
 */
const TECHNICAL_DOMAIN_HINTS = [
  'programming', 'program', 'code', 'coding', 'software', 'algorithm',
  'data structure', 'database', 'sql', 'web', 'multimedia', 'graphics',
  'network', 'security', 'system', 'computer', 'java', 'python', 'c++',
  'javascript', 'html', 'css', 'engineering', 'electronics', 'hardware',
  'cloud', 'devops', 'mobile', 'animation', 'design', 'compiler', 'os'
];

function buildSubjectContext(
  subjectCode: string,
  courseName: string,
  description: string,
  topics: string[]
): SubjectContext {
  const corpus = `${subjectCode} ${courseName} ${description} ${topics.join(' ')}`.toLowerCase();
  const isTechnical = TECHNICAL_DOMAIN_HINTS.some(h => corpus.includes(h));

  // Extract technical keywords from course title + description + topic names
  const stop = new Set(['the','and','for','with','from','into','that','this','course','subject','general','about','using','introduction','fundamentals','principles']);
  const tokenSet = new Set<string>();
  [courseName, description, ...topics].forEach(src => {
    String(src || '')
      .toLowerCase()
      .replace(/[^a-z0-9+#\s-]/g, ' ')
      .split(/\s+/)
      .forEach(w => { if (w.length >= 4 && !stop.has(w)) tokenSet.add(w); });
  });
  TECHNICAL_DOMAIN_HINTS.forEach(h => { if (corpus.includes(h)) tokenSet.add(h); });

  return {
    subjectCode: subjectCode || 'N/A',
    courseName: courseName || 'N/A',
    description: description || '',
    technicalKeywords: Array.from(tokenSet).slice(0, 20),
    isTechnical
  };
}

function renderSubjectAnchor(ctx: SubjectContext): string {
  const position = ctx.position;
  const positionLine = position
    ? `\nITEM POSITION: items ${position.current}-${Math.min(position.current + 5, position.total)} of ${position.total}` +
      (position.checkpoint
        ? `\n🔄 CHECKPOINT REINFORCEMENT: ${position.current - 1} items already generated. RESET focus — next items MUST stay in the "${ctx.courseName}" technical domain. Do NOT drift to generic administrative, motherhood, or filler content. Do NOT repeat previously generated stems verbatim.`
        : '')
    : '';
  return `=== SUBJECT ANCHOR (RE-INJECTED EVERY BATCH — DO NOT DRIFT) ===
COURSE CODE: ${ctx.subjectCode}
COURSE NAME: ${ctx.courseName}
COURSE DESCRIPTION: ${ctx.description || '(not provided)'}
DOMAIN TYPE: ${ctx.isTechnical ? 'TECHNICAL — questions MUST use precise technical terminology, code/system concepts, and discipline-specific vocabulary' : 'THEORETICAL/GENERAL'}
REQUIRED VOCABULARY (use at least 1-2 per question): ${ctx.technicalKeywords.join(', ') || '(none)'}
PERSONA: You are a subject-matter expert teaching "${ctx.courseName}". Stay strictly within this course's scope. Do NOT produce generic, off-topic, or cross-subject content.${positionLine}
=== END SUBJECT ANCHOR ===`;
}

// Batch size for segmented generation — keeps AI context fresh and prevents drift.
// Technical subjects use a smaller batch so the subject anchor is re-injected more often,
// preventing context exhaustion / "logic bleeding" on long (50+ item) generations.
const AI_BATCH_SIZE = 6;
const AI_BATCH_SIZE_TECHNICAL = 4;
// After every N globally-emitted items, the next batch prompt includes an explicit
// "checkpoint reinforcement" reminder of the technical persona.
const PROMPT_REINJECTION_INTERVAL = 15;

/**
 * SLOT: A predefined requirement from the TOS
 * The TOS is law - slots define what MUST exist
 */
interface Slot {
  id: string;
  topic: string;
  bloomLevel: string;
  difficulty: string;
  knowledgeDimension: string;
  questionType: 'mcq' | 'true_false' | 'short_answer' | 'essay';  // Question type assignment
  points: number;  // Point value
  filled: boolean;
  question?: any;
  source?: 'bank' | 'ai';
  // Matrix-Driven Selection: every slot is an explicit (Topic × Cognitive Level)
  // coordinate. The engine queries/generates to satisfy BOTH constraints
  // simultaneously instead of looping linearly from 1..N.
  coordinate: { topic: string; cognitive_level: string; index: number };
}

/**
 * Registry for tracking used concepts/operations across entire session.
 *
 * `compiledItemStems` is the runtime Zero-Redundancy Filter blacklist:
 * every accepted question's normalized stem is appended and every new
 * candidate must pass a literal + semantic-similarity check against it
 * before being written to the final questionnaire.
 */
interface GenerationRegistry {
  usedConcepts: Record<string, string[]>;
  usedOperations: Record<string, string[]>;
  usedPairs: string[];
  usedQuestionTexts: string[];
  compiledItemStems: string[];
}

// Higher-order Bloom levels require a situational case / scenario / dataset cue
// in the stem (Taxonomy-Based Stem Conditioning).
const HIGHER_ORDER_BLOOM = new Set(['applying', 'analyzing', 'evaluating', 'creating']);
const SCENARIO_CUE_PATTERNS: RegExp[] = [
  /\bgiven\b/i, /\bscenario\b/i, /\bsuppose\b/i, /\bconsider\s+(a|the|an)\b/i,
  /\bcase\s+study\b/i, /\busing\s+the\s+(following|dataset|data|code|figure|table)/i,
  /\bif\s+a\b/i, /\bwhen\s+a\b/i, /\bin\s+a\s+(situation|project|company|team|system|class|lab)/i,
  /\b(dataset|sample|excerpt|snippet|diagram|figure|table|chart|log)\b/i,
  /\bthe\s+following\b/i, /\bbased\s+on\s+the\b/i, /\bdesign\s+a\b/i, /\bdevelop\s+a\b/i,
  /\bplan\s+a\b/i, /\bcompare\s+\w+\s+and\s+\w+/i, /\bevaluate\s+the\b/i
];
function hasScenarioCue(text: string): boolean {
  return SCENARIO_CUE_PATTERNS.some(p => p.test(text));
}

// Literal-stem normalization for the deduplication blacklist.
function normalizeStemForDedup(text: string): string {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Strict session-blacklist check used during AI per-slot acceptance.
// Returns the offending prior stem when a duplicate (literal or semantic) is found.
function findDuplicateInBlacklist(
  candidateText: string,
  blacklist: string[],
  semanticThreshold = 0.72
): { hit: true; offender: string; similarity: number } | { hit: false } {
  const norm = normalizeStemForDedup(candidateText);
  if (!norm) return { hit: false };
  for (const prior of blacklist) {
    const priorNorm = normalizeStemForDedup(prior);
    if (!priorNorm) continue;
    if (priorNorm === norm) {
      return { hit: true, offender: prior, similarity: 1 };
    }
    const sim = calculateTextSimilarity(norm, priorNorm);
    if (sim >= semanticThreshold) {
      return { hit: true, offender: prior, similarity: sim };
    }
  }
  return { hit: false };
}

// ============= CONSTANTS =============

/**
 * Extract JSON from AI response that may be wrapped in markdown code blocks
 */
function extractJSON(text: string): any {
  // Try direct parse first
  try { return JSON.parse(text); } catch {}
  // Strip markdown code blocks
  const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (match) {
    try { return JSON.parse(match[1].trim()); } catch {}
  }
  // Try finding first { to last }
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end > start) {
    try { return JSON.parse(text.slice(start, end + 1)); } catch {}
  }
  throw new Error('Could not extract JSON from AI response');
}

const BLOOM_LEVELS = ['remembering', 'understanding', 'applying', 'analyzing', 'evaluating', 'creating'];

const BLOOM_KNOWLEDGE_MAPPING: Record<string, string> = {
  'remembering': 'factual',
  'understanding': 'conceptual',
  'applying': 'procedural',
  'analyzing': 'conceptual',
  'evaluating': 'metacognitive',
  'creating': 'metacognitive'
};

/**
 * BLOOM'S COGNITIVE OPERATIONS - These define REQUIRED mental actions, not labels
 * Each operation MUST be demonstrated in the question stem and required for correct answering
 */
const BLOOM_COGNITIVE_OPERATIONS_ENHANCED: Record<string, { 
  verbs: string[]; 
  requirement: string; 
  forbiddenPatterns: RegExp[];
  questionTemplate: string;
}> = {
  'remembering': {
    verbs: ['recall', 'recognize', 'identify', 'list', 'name', 'define', 'state'],
    requirement: 'Student must retrieve specific information from memory',
    forbiddenPatterns: [],
    questionTemplate: 'Requires direct recall of facts, terms, or definitions'
  },
  'understanding': {
    verbs: ['explain', 'summarize', 'interpret', 'classify', 'compare', 'describe', 'paraphrase'],
    requirement: 'Student must demonstrate comprehension by explaining in own words',
    forbiddenPatterns: [/^list\s/i, /^name\s/i, /^identify\s/i],
    questionTemplate: 'Requires explanation of meaning, not just recall'
  },
  'applying': {
    verbs: ['execute', 'implement', 'solve', 'use', 'demonstrate', 'apply', 'calculate'],
    requirement: 'Student must USE knowledge to solve a NEW problem or scenario',
    forbiddenPatterns: [/^define\s/i, /^list\s/i, /^what\s+is\s/i],
    questionTemplate: 'Must include a specific scenario or problem to solve'
  },
  'analyzing': {
    verbs: ['differentiate', 'organize', 'attribute', 'deconstruct', 'examine', 'contrast', 'distinguish'],
    requirement: 'Student must BREAK DOWN information and identify RELATIONSHIPS between parts',
    forbiddenPatterns: [/key\s+factors?\s+(are|include)/i, /such\s+as/i, /includes?:/i],
    questionTemplate: 'Must require identifying components AND their interactions'
  },
  'evaluating': {
    verbs: ['check', 'critique', 'judge', 'prioritize', 'justify', 'assess', 'defend', 'evaluate'],
    requirement: 'Student must make JUDGMENTS with CRITERIA and provide JUSTIFICATION',
    forbiddenPatterns: [/key\s+factors?\s+(are|include)/i, /such\s+as/i, /includes?:/i, /^describe\s/i],
    questionTemplate: 'Must require a verdict (better/worse, effective/not) with reasoning'
  },
  'creating': {
    verbs: ['generate', 'plan', 'produce', 'design', 'construct', 'formulate', 'compose', 'develop'],
    requirement: 'Student must PRODUCE something NEW - a design, plan, or solution',
    forbiddenPatterns: [/key\s+factors?\s+(are|include)/i, /such\s+as/i, /includes?:/i, /^explain\s/i, /^describe\s/i],
    questionTemplate: 'Must require creating a tangible output, not just describing'
  }
};

// Legacy format for backwards compatibility
const BLOOM_COGNITIVE_OPERATIONS: Record<string, string[]> = {
  'remembering': BLOOM_COGNITIVE_OPERATIONS_ENHANCED.remembering.verbs,
  'understanding': BLOOM_COGNITIVE_OPERATIONS_ENHANCED.understanding.verbs,
  'applying': BLOOM_COGNITIVE_OPERATIONS_ENHANCED.applying.verbs,
  'analyzing': BLOOM_COGNITIVE_OPERATIONS_ENHANCED.analyzing.verbs,
  'evaluating': BLOOM_COGNITIVE_OPERATIONS_ENHANCED.evaluating.verbs,
  'creating': BLOOM_COGNITIVE_OPERATIONS_ENHANCED.creating.verbs
};

/**
 * CONCEPT POOL - Specific focus areas, not generic labels
 * These must be used as actual content targets, not filler
 */
const CONCEPT_POOL = [
  'core principles', 'key components', 'fundamental concepts', 'main processes',
  'critical factors', 'essential elements', 'primary functions', 'basic mechanisms',
  'important relationships', 'significant characteristics', 'defining features', 'crucial aspects',
  'major categories', 'fundamental distinctions', 'core applications', 'primary considerations',
  'essential requirements', 'key differences', 'important limitations', 'critical constraints',
  'implementation strategies', 'operational procedures', 'design patterns', 'evaluation criteria',
  'causal relationships', 'structural components', 'functional dependencies', 'integration points'
];

const ANSWER_TYPE_BY_BLOOM: Record<string, string[]> = {
  'remembering': ['definition', 'identification'],
  'understanding': ['explanation', 'comparison', 'interpretation'],
  'applying': ['application', 'procedure', 'demonstration'],
  'analyzing': ['analysis', 'differentiation', 'organization'],
  'evaluating': ['evaluation', 'justification', 'critique'],
  'creating': ['design', 'construction', 'synthesis']
};

// POINT VALUES
const POINTS = {
  mcq: 1,
  true_false: 1,
  short_answer: 1,
  essay: 5
};

// Randomly choose either True/False OR Short Answer for each exam (mutually exclusive)
function chooseSecondaryQuestionType(): 'true_false' | 'short_answer' {
  return Math.random() < 0.5 ? 'true_false' : 'short_answer';
}

// ============= SUPABASE CLIENT =============

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

// ============= QUESTION TYPE DISTRIBUTION =============

/**
 * Calculate how many of each question type to generate
 * Rules:
 * - Essay: 5 points each, calculated based on total points target
 *   - For 46-50 total points: 1 essay (5 points)
 *   - For 100+ total items: max 2 essays (10 points)
 * - True/False OR Short Answer: 1 point each, ~15-20% of remaining items (MUTUALLY EXCLUSIVE)
 * - MCQ: 1 point each, majority (remaining items)
 * 
 * Point calculation example:
 * - 50 questions total → target ~50 points
 * - 1 essay (5 pts) + 49 MCQ/TF (49 pts) = 54 total points
 */
interface QuestionTypeDistribution {
  mcq: number;
  true_false: number;
  short_answer: number;
  essay: number;
  secondaryType: 'true_false' | 'short_answer';
  totalPoints: number;
}

function calculateQuestionTypeDistribution(totalItems: number): QuestionTypeDistribution {
  // Essay allocation based on total items and point balance
  // Rule: Essay questions should not dominate the total points
  // Essay = 5 pts, so max essays = floor((totalItems * 0.10) / 5) = ~10% of total points from essays
  
  let essayCount = 0;
  
  // For very small exams (< 20 items), no essay
  if (totalItems < 20) {
    essayCount = 0;
  }
  // For 20-59 items: 1 essay max
  else if (totalItems < 60) {
    essayCount = 1;
  }
  // For 60-99 items: 1 essay, could be 2
  else if (totalItems < 100) {
    essayCount = 1;
  }
  // For 100+ items: 2 essays max
  else {
    essayCount = 2;
  }
  
  const remainingAfterEssay = totalItems - essayCount;
  
  // Choose either True/False OR Short Answer (mutually exclusive per exam)
  const secondaryType = chooseSecondaryQuestionType();
  
  // Secondary type (T/F or Short Answer): ~15-20% of remaining, minimum 0
  const secondaryCount = Math.max(0, Math.floor(remainingAfterEssay * 0.18));
  
  // MCQ: Everything else (majority)
  const mcqCount = remainingAfterEssay - secondaryCount;
  
  // Calculate total points
  const totalPoints = (mcqCount * POINTS.mcq) + 
                      (secondaryCount * (secondaryType === 'true_false' ? POINTS.true_false : POINTS.short_answer)) + 
                      (essayCount * POINTS.essay);
  
  console.log(`📊 Question type distribution for ${totalItems} items:`);
  console.log(`   MCQ: ${mcqCount} (${mcqCount * POINTS.mcq} pts)`);
  console.log(`   ${secondaryType === 'true_false' ? 'T/F' : 'Short Answer'}: ${secondaryCount} (${secondaryCount} pts)`);
  console.log(`   Essay: ${essayCount} (${essayCount * POINTS.essay} pts)`);
  console.log(`   Total Points: ${totalPoints}`);
  
  return {
    mcq: mcqCount,
    true_false: secondaryType === 'true_false' ? secondaryCount : 0,
    short_answer: secondaryType === 'short_answer' ? secondaryCount : 0,
    essay: essayCount,
    secondaryType,
    totalPoints
  };
}

// ============= SLOT GENERATION =============

/**
 * STEP 1: Lock the TOS and expand into slots with question types
 */
function expandTOSToSlots(distributions: TopicDistribution[], totalItems: number): Slot[] {
  const slots: Slot[] = [];
  let slotId = 1;

  // Calculate question type distribution
  const typeDistribution = calculateQuestionTypeDistribution(totalItems);
  
  // Track how many of each type we've assigned
  let assignedEssay = 0;
  let assignedSecondary = 0; // Either T/F or Short Answer (mutually exclusive)
  const secondaryType = typeDistribution.secondaryType; // 'true_false' or 'short_answer'
  const secondaryCount = secondaryType === 'true_false' ? typeDistribution.true_false : typeDistribution.short_answer;

  for (const dist of distributions) {
    const topic = dist.topic;
    
    for (const bloom of BLOOM_LEVELS) {
      const count = dist.counts[bloom as keyof typeof dist.counts] as number;
      if (!count || count <= 0) continue;

      // Distribute across difficulty levels using largest-remainder method to preserve exact count
      const { easy, average, difficult } = dist.counts.difficulty;
      const totalDiff = Math.max(1, easy + average + difficult);
      
      // Use largest-remainder method (Hamilton's method) to avoid rounding errors
      const rawEasy = count * (easy / totalDiff);
      const rawAverage = count * (average / totalDiff);
      const rawDifficult = count * (difficult / totalDiff);
      
      let easyCount = Math.floor(rawEasy);
      let averageCount = Math.floor(rawAverage);
      let difficultCount = Math.floor(rawDifficult);
      
      // Distribute remainders to reach exact count
      let remainder = count - easyCount - averageCount - difficultCount;
      const remainders = [
        { key: 'easy', frac: rawEasy - easyCount },
        { key: 'average', frac: rawAverage - averageCount },
        { key: 'difficult', frac: rawDifficult - difficultCount }
      ].sort((a, b) => b.frac - a.frac);
      
      for (const r of remainders) {
        if (remainder <= 0) break;
        if (r.key === 'easy') easyCount++;
        else if (r.key === 'average') averageCount++;
        else difficultCount++;
        remainder--;
      }

      const difficulties = [
        { level: 'easy', count: easyCount },
        { level: 'average', count: averageCount },
        { level: 'difficult', count: difficultCount }
      ];

      for (const { level, count: diffCount } of difficulties) {
        for (let i = 0; i < diffCount; i++) {
          const knowledgeDimension = BLOOM_KNOWLEDGE_MAPPING[bloom] || 'conceptual';
          
          // Assign question type based on bloom level and remaining quotas
          let questionType: 'mcq' | 'true_false' | 'short_answer' | 'essay' = 'mcq';
          let points = POINTS.mcq;
          
          // Essay: Only for higher-order blooms (evaluating, creating) and difficult
          if (assignedEssay < typeDistribution.essay && 
              (bloom === 'evaluating' || bloom === 'creating') && 
              level === 'difficult') {
            questionType = 'essay';
            points = POINTS.essay;
            assignedEssay++;
          }
          // Secondary type (either T/F OR Short Answer - mutually exclusive per exam)
          else if (assignedSecondary < secondaryCount) {
            // True/False: Good for remembering/understanding, easy/average difficulty
            if (secondaryType === 'true_false' && 
                (bloom === 'remembering' || bloom === 'understanding') && 
                (level === 'easy' || level === 'average')) {
              questionType = 'true_false';
              points = POINTS.true_false;
              assignedSecondary++;
            }
            // Short Answer: Good for applying/analyzing, average difficulty
            else if (secondaryType === 'short_answer' && 
                     (bloom === 'applying' || bloom === 'understanding' || bloom === 'analyzing') && 
                     (level === 'average' || level === 'easy')) {
              questionType = 'short_answer';
              points = POINTS.short_answer;
              assignedSecondary++;
            }
          }
          // MCQ: Default for everything else
          
          slots.push({
            id: `slot_${slotId++}`,
            topic,
            bloomLevel: bloom,
            difficulty: level,
            knowledgeDimension,
            questionType,
            points,
            filled: false,
            coordinate: { topic, cognitive_level: bloom, index: slotId - 1 }
          });
        }
      }
    }
  }

  // If we haven't filled essay quota, convert some difficult MCQs
  if (assignedEssay < typeDistribution.essay) {
    const difficultMCQs = slots.filter(s => 
      s.questionType === 'mcq' && 
      s.difficulty === 'difficult' &&
      (s.bloomLevel === 'analyzing' || s.bloomLevel === 'evaluating' || s.bloomLevel === 'creating')
    );
    
    for (const slot of difficultMCQs) {
      if (assignedEssay >= typeDistribution.essay) break;
      slot.questionType = 'essay';
      slot.points = POINTS.essay;
      assignedEssay++;
    }
  }

  // If we haven't filled secondary quota, convert some easy/average MCQs
  if (assignedSecondary < secondaryCount) {
    const eligibleMCQs = slots.filter(s => 
      s.questionType === 'mcq' && 
      (s.difficulty === 'easy' || s.difficulty === 'average')
    );
    
    for (const slot of eligibleMCQs) {
      if (assignedSecondary >= secondaryCount) break;
      slot.questionType = secondaryType;
      slot.points = secondaryType === 'true_false' ? POINTS.true_false : POINTS.short_answer;
      assignedSecondary++;
    }
  }

  // ============= SLOT COUNT ENFORCEMENT =============
  // If rounding caused fewer slots than totalItems, add MCQ slots to fill
  while (slots.length < totalItems) {
    const dist = distributions[slots.length % distributions.length];
    slots.push({
      id: `slot_${slotId++}`,
      topic: dist.topic,
      bloomLevel: 'understanding',
      difficulty: 'average',
      knowledgeDimension: 'conceptual',
      questionType: 'mcq',
      points: POINTS.mcq,
      filled: false,
      coordinate: { topic: dist.topic, cognitive_level: 'understanding', index: slotId - 1 }
    });
  }
  // If rounding created more slots than totalItems, trim
  if (slots.length > totalItems) {
    slots.length = totalItems;
  }

  const typeCounts = {
    mcq: slots.filter(s => s.questionType === 'mcq').length,
    true_false: slots.filter(s => s.questionType === 'true_false').length,
    short_answer: slots.filter(s => s.questionType === 'short_answer').length,
    essay: slots.filter(s => s.questionType === 'essay').length
  };
  
  console.log(`📋 Expanded TOS into ${slots.length} slots (required: ${totalItems}):`);
  console.log(`   MCQ: ${typeCounts.mcq}`);
  console.log(`   ${secondaryType === 'true_false' ? 'T/F' : 'Short Answer'}: ${secondaryType === 'true_false' ? typeCounts.true_false : typeCounts.short_answer}`);
  console.log(`   Essay: ${typeCounts.essay}`);
  console.log(`   (Note: Only ${secondaryType === 'true_false' ? 'True/False' : 'Short Answer'} used - mutually exclusive)`);
  
  return slots;
}

// ============= BANK RETRIEVAL =============

async function fillSlotsFromBank(
  slots: Slot[],
  registry: GenerationRegistry,
  allowUnapproved: boolean
): Promise<{ filled: Slot[]; unfilled: Slot[] }> {
  const filled: Slot[] = [];
  const unfilled: Slot[] = [];

  // Group slots by topic+bloom+difficulty+type for efficient querying
  const slotGroups = new Map<string, Slot[]>();
  for (const slot of slots) {
    const key = `${slot.topic}::${slot.bloomLevel}::${slot.difficulty}::${slot.questionType}`;
    if (!slotGroups.has(key)) {
      slotGroups.set(key, []);
    }
    slotGroups.get(key)!.push(slot);
  }

  for (const [key, groupSlots] of slotGroups) {
    const [topic, bloom, difficulty, questionType] = key.split('::');
    
    const normalizedBloom = bloom.charAt(0).toUpperCase() + bloom.slice(1).toLowerCase();
    const bloomVariants = Array.from(new Set([bloom, bloom.toLowerCase(), normalizedBloom]));

    let query = supabase
      .from('questions')
      .select('*')
      .eq('deleted', false)
      .eq('difficulty', difficulty)
      .eq('question_type', questionType)
      .ilike('topic', `%${topic}%`)
      .in('bloom_level', bloomVariants)
      .order('used_count', { ascending: true });

    if (!allowUnapproved) {
      query = query.eq('approved', true);
    }

    const { data: bankQuestions, error } = await query.limit(groupSlots.length * 3);

    if (error) {
      console.error(`Error querying bank for ${key}:`, error);
      unfilled.push(...groupSlots);
      continue;
    }

    const availableQuestions = [...(bankQuestions || [])];
    
    for (const slot of groupSlots) {
      const selectedQuestion = selectNonRedundantQuestion(
        availableQuestions,
        registry,
        slot.topic,
        slot.questionType
      );

      if (selectedQuestion) {
        const idx = availableQuestions.findIndex(q => q.id === selectedQuestion.id);
        if (idx > -1) availableQuestions.splice(idx, 1);
        
        registerQuestion(registry, slot.topic, slot.bloomLevel, selectedQuestion);
        
        slot.filled = true;
        slot.question = selectedQuestion;
        slot.source = 'bank';
        filled.push(slot);
      } else {
        unfilled.push(slot);
      }
    }
  }

  console.log(`📚 Filled ${filled.length} slots from bank, ${unfilled.length} need AI generation`);
  return { filled, unfilled };
}

function selectNonRedundantQuestion(
  candidates: any[],
  registry: GenerationRegistry,
  topic: string,
  questionType: string
): any | null {
  for (const candidate of candidates) {
    // For MCQ, validate options exist
    if (questionType === 'mcq') {
      const choices = candidate.choices;
      if (!choices || typeof choices !== 'object') continue;
      const hasAllOptions = ['A', 'B', 'C', 'D'].every(key => choices[key] && choices[key].trim().length > 0);
      if (!hasAllOptions) continue;
      if (!['A', 'B', 'C', 'D'].includes(candidate.correct_answer)) continue;
    }
    
    const text = candidate.question_text?.toLowerCase() || '';
    
    const isSimilar = registry.usedQuestionTexts.some(usedText => {
      const similarity = calculateTextSimilarity(text, usedText);
      return similarity > 0.7;
    });

    if (!isSimilar) {
      return candidate;
    }
  }
  
  return null;
}

function registerQuestion(
  registry: GenerationRegistry,
  topic: string,
  bloomLevel: string,
  question: any
): void {
  const text = question.question_text?.toLowerCase() || '';
  registry.usedQuestionTexts.push(text);
  // Zero-Redundancy Filter: every accepted stem is added to the compiled-item
  // blacklist used by subsequent per-slot validation.
  if (text) registry.compiledItemStems.push(text);
  
  const concept = question.targeted_concept || extractConcept(text);
  if (concept) {
    if (!registry.usedConcepts[topic]) {
      registry.usedConcepts[topic] = [];
    }
    registry.usedConcepts[topic].push(concept.toLowerCase());
  }
}

/**
 * Calculate semantic text similarity using enhanced Jaccard with n-grams
 */
function calculateTextSimilarity(text1: string, text2: string): number {
  const normalize = (t: string) => t.toLowerCase().replace(/[^\w\s]/g, '').trim();
  const n1 = normalize(text1);
  const n2 = normalize(text2);
  
  // Word-level similarity
  const words1 = new Set(n1.split(/\s+/).filter(w => w.length > 3));
  const words2 = new Set(n2.split(/\s+/).filter(w => w.length > 3));
  
  if (words1.size === 0 || words2.size === 0) return 0;
  
  let intersection = 0;
  words1.forEach(w => { if (words2.has(w)) intersection++; });
  const wordSimilarity = intersection / Math.min(words1.size, words2.size);
  
  // Bigram similarity for better semantic matching
  const getBigrams = (s: string) => {
    const tokens = s.split(/\s+/).filter(w => w.length > 2);
    const bigrams = new Set<string>();
    for (let i = 0; i < tokens.length - 1; i++) {
      bigrams.add(`${tokens[i]}_${tokens[i + 1]}`);
    }
    return bigrams;
  };
  
  const bigrams1 = getBigrams(n1);
  const bigrams2 = getBigrams(n2);
  
  if (bigrams1.size === 0 || bigrams2.size === 0) return wordSimilarity;
  
  let bigramIntersection = 0;
  bigrams1.forEach(b => { if (bigrams2.has(b)) bigramIntersection++; });
  const bigramSimilarity = bigramIntersection / Math.min(bigrams1.size, bigrams2.size);
  
  // Combined similarity (weighted)
  return (wordSimilarity * 0.4) + (bigramSimilarity * 0.6);
}

function extractConcept(text: string): string | null {
  const patterns = [
    /(?:define|explain|describe|analyze)\s+(?:the\s+)?(?:concept\s+of\s+)?["']?([^"'.?]+)/i,
    /(?:what\s+is|what\s+are)\s+(?:the\s+)?["']?([^"'.?]+)/i,
    /(?:how\s+does|how\s+do)\s+["']?([^"'.?]+)/i
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      return match[1].trim().substring(0, 50);
    }
  }
  
  return null;
}

/**
 * NORMALIZATION: Clean question text by removing artifacts
 */
function normalizeQuestionText(text: string): string {
  if (!text) return '';
  
  let normalized = text;
  
  // Remove "(Question X)" artifacts
  normalized = normalized.replace(/^\s*\(Question\s+\d+\)\s*/i, '');
  normalized = normalized.replace(/^\s*Question\s+\d+[:.]\s*/i, '');
  normalized = normalized.replace(/^\s*Q\d+[:.]\s*/i, '');
  
  // Remove number prefixes like "1.", "1)", "1:"
  normalized = normalized.replace(/^\s*\d+[.):\s]+/i, '');
  
  // Remove leading/trailing whitespace
  normalized = normalized.trim();
  
  // Ensure question ends with proper punctuation
  if (normalized && !/[.?!]$/.test(normalized)) {
    normalized += '?';
  }
  
  // Capitalize first letter
  if (normalized.length > 0) {
    normalized = normalized.charAt(0).toUpperCase() + normalized.slice(1);
  }
  
  return normalized;
}

/**
 * SEMANTIC SIMILARITY CHECK: Reject questions too similar to existing ones
 */
function checkSemanticRedundancy(
  newQuestion: string,
  existingQuestions: string[],
  threshold: number = 0.65
): { isRedundant: boolean; mostSimilar?: string; similarity?: number } {
  const normalizedNew = newQuestion.toLowerCase();
  
  for (const existing of existingQuestions) {
    const similarity = calculateTextSimilarity(normalizedNew, existing.toLowerCase());
    if (similarity >= threshold) {
      return {
        isRedundant: true,
        mostSimilar: existing.substring(0, 100),
        similarity
      };
    }
  }
  
  return { isRedundant: false };
}

/**
 * BLOOM ENFORCEMENT: Validate that question actually requires the specified cognitive operation
 */
function validateBloomEnforcement(
  questionText: string,
  bloomLevel: string
): { valid: boolean; reason?: string } {
  const config = BLOOM_COGNITIVE_OPERATIONS_ENHANCED[bloomLevel.toLowerCase()];
  if (!config) return { valid: true };
  
  const lowerText = questionText.toLowerCase();
  
  // Check for forbidden patterns (e.g., "key factors include" for higher-order blooms)
  if (config.forbiddenPatterns && Array.isArray(config.forbiddenPatterns)) {
    for (const pattern of config.forbiddenPatterns) {
      if (pattern.test(questionText)) {
        return {
          valid: false,
          reason: `Question uses forbidden pattern for ${bloomLevel} level: ${pattern.toString()}`
        };
      }
    }
  }
  
  // For higher-order blooms, ensure question isn't just asking for a list
  if (['analyzing', 'evaluating', 'creating'].includes(bloomLevel.toLowerCase())) {
    const listingPatterns = [
      /^(list|name|identify|state)\s+/i,
      /what\s+are\s+the\s+(main|key|primary)\s+\w+\s+of/i,
      /the\s+factors\s+include/i
    ];
    
    for (const pattern of listingPatterns) {
      if (pattern.test(questionText)) {
        return {
          valid: false,
          reason: `${bloomLevel} question should not ask for simple listing`
        };
      }
    }
  }
  
  return { valid: true };
}

// ============= AI GENERATION =============

async function fillSlotsWithAI(
  slots: Slot[],
  registry: GenerationRegistry,
  subjectCtx?: SubjectContext
): Promise<Slot[]> {
  if (slots.length === 0) return [];

  const aiApiKey = Deno.env.get('LOVABLE_API_KEY') || Deno.env.get('OPENAI_API_KEY');
  if (!aiApiKey) {
    console.error('No AI API key configured (LOVABLE_API_KEY or OPENAI_API_KEY); using deterministic fallback for every slot');
    return slots.map((slot, index) => ({
      ...slot,
      filled: true,
      source: 'ai' as const,
      question: createFallbackQuestion(slot, 'No AI API key configured', index)
    }));
  }

  // ============= SEGMENTED BATCHING =============
  // Group slots by (topic, bloom, type) so each batch shares the same prompt template,
  // then split into small batches (AI_BATCH_SIZE) so the subject anchor is re-injected
  // frequently and the AI never loses technical context across long generation runs.
  const groups = new Map<string, Slot[]>();
  for (const slot of slots) {
    const key = `${slot.topic}::${slot.bloomLevel}::${slot.questionType}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(slot);
  }

  const filledSlots: Slot[] = [];
  const MAX_BATCH_RETRIES = 2;       // retry the whole batch if the API call itself fails
  const MAX_PER_SLOT_RETRIES = 3;    // per-question regeneration when validation fails

  // Dynamic batch size: technical subjects get smaller batches so the SUBJECT ANCHOR
  // is re-injected more frequently — core fix for "context exhaustion" where the AI
  // drifts to generic admin templates after the first ~30 items.
  const batchSize = subjectCtx?.isTechnical ? AI_BATCH_SIZE_TECHNICAL : AI_BATCH_SIZE;

  let batchNumber = 0;
  let globalItemPosition = 1;      // 1-indexed across the ENTIRE generation run
  let lastCheckpointAt = 0;
  const totalSlots = slots.length;
  const totalBatches = Array.from(groups.values())
    .reduce((sum, gs) => sum + Math.ceil(gs.length / batchSize), 0);

  for (const [key, groupSlots] of groups) {
    const [topic, bloom, qType] = key.split('::');

    for (let offset = 0; offset < groupSlots.length; offset += batchSize) {
      batchNumber++;
      const batch = groupSlots.slice(offset, offset + batchSize);

      // Trigger a checkpoint reinforcement every PROMPT_REINJECTION_INTERVAL items
      const crossedCheckpoint =
        globalItemPosition - lastCheckpointAt >= PROMPT_REINJECTION_INTERVAL;
      const position = {
        current: globalItemPosition,
        total: totalSlots,
        checkpoint: crossedCheckpoint
      };
      if (crossedCheckpoint) {
        lastCheckpointAt = globalItemPosition;
        console.log(`   🔄 Checkpoint reinforcement at item ${globalItemPosition}/${totalSlots}`);
      }

      console.log(`\n📦 Batch ${batchNumber}/${totalBatches} — topic="${topic}" bloom=${bloom} type=${qType} size=${batch.length} (items ${globalItemPosition}-${globalItemPosition + batch.length - 1}/${totalSlots})`);

      // Build intents for this batch (subject anchor will be re-injected in the prompt)
      const intents = batch.map(slot => {
        const concept = selectNextConcept(registry, slot.topic);
        const operation = selectNextOperation(registry, slot.topic, slot.bloomLevel);
        const answerType = selectAnswerType(slot.bloomLevel);
        markConceptUsed(registry, slot.topic, concept);
        markOperationUsed(registry, slot.topic, slot.bloomLevel, operation);
        markPairUsed(registry, concept, operation);
        return {
          slot, concept, operation, answerType,
          difficulty: slot.difficulty,
          knowledgeDimension: slot.knowledgeDimension,
          questionType: slot.questionType,
          points: slot.points
        };
      });

      // Try the batch up to MAX_BATCH_RETRIES times (handles transient API failures)
      let batchQuestions: any[] = [];
      let batchError: any = null;
      for (let attempt = 1; attempt <= MAX_BATCH_RETRIES; attempt++) {
        try {
          batchQuestions = await generateQuestionsWithIntents(
            topic, bloom, intents, aiApiKey, registry, subjectCtx, position
          );
          batchError = null;
          break;
        } catch (err) {
          batchError = err;
          console.warn(`⚠️ Batch ${batchNumber} attempt ${attempt}/${MAX_BATCH_RETRIES} failed: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      // PER-BATCH validation + per-slot retry. We NEVER abandon a slot — at worst we
      // fall back to a deterministic question so the TOS count is always honored.
      for (let i = 0; i < batch.length; i++) {
        const slot = batch[i];
        let candidate = batchQuestions[i];
        let rejection = candidate
          ? getQuestionRejectionReason(candidate, slot, subjectCtx, registry)
          : (batchError
              ? `Batch error: ${batchError instanceof Error ? batchError.message : String(batchError)}`
              : 'No question returned');

        let perSlotAttempt = 0;
        while (rejection && perSlotAttempt < MAX_PER_SLOT_RETRIES) {
          perSlotAttempt++;
          console.warn(`   🔁 Slot ${slot.id} rejected (${rejection}) — regenerating ${perSlotAttempt}/${MAX_PER_SLOT_RETRIES} [coord=${slot.coordinate?.topic}×${slot.coordinate?.cognitive_level}]`);
          try {
            // Force a checkpoint on every retry so the persona is re-anchored
            const single = await generateQuestionsWithIntents(
              topic, bloom, [intents[i]], aiApiKey, registry, subjectCtx,
              { current: globalItemPosition + i, total: totalSlots, checkpoint: true }
            );
            candidate = single[0];
            rejection = candidate ? getQuestionRejectionReason(candidate, slot, subjectCtx, registry) : 'Empty regeneration';
          } catch (err) {
            rejection = `Regeneration error: ${err instanceof Error ? err.message : String(err)}`;
          }
        }

        if (rejection || !candidate) {
          console.warn(`   🛟 Slot ${slot.id} using fallback after ${perSlotAttempt} retries: ${rejection}`);
          candidate = createFallbackQuestion(slot, rejection || 'Unknown', filledSlots.length);
        } else {
          console.log(`   ✅ Slot ${slot.id} accepted (batch ${batchNumber}, retries=${perSlotAttempt})`);
        }

        candidate.slot_id = slot.id;
        candidate.matrix_coordinate = slot.coordinate;
        candidate.metadata = { ...(candidate.metadata || {}), matrix_coordinate: slot.coordinate };
        registerQuestion(registry, slot.topic, slot.bloomLevel, candidate);
        slot.filled = true;
        slot.question = candidate;
        slot.source = 'ai';
        filledSlots.push(slot);
      }

      globalItemPosition += batch.length;
    }
  }

  console.log(`🤖 AI filled ${filledSlots.length}/${slots.length} slots (segmented batching)`);
  return filledSlots;
}

function getTopicKeywords(topic: string): string[] {
  const stopWords = new Set(['the', 'and', 'for', 'with', 'from', 'into', 'that', 'this', 'course', 'subject', 'general']);
  return topic
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length >= 4 && !stopWords.has(word));
}

// Patterns that indicate the AI drifted to generic admin/template filler instead
// of producing real subject content (the main failure mode for technical courses
// after context exhaustion).
const GENERIC_TEMPLATE_PATTERNS = [
  /which (of the following|statement) (is|best) (true|correct|describes|defines)\??$/i,
  /^(what|which) is the (main|primary|best) (purpose|goal|objective)\b.*\?$/i,
  /^(what|which) is (the )?most (important|effective|appropriate)\b.*\?$/i,
  /\b(administrative|policy|procedure|guideline|protocol)\b.*\b(used|applied|followed)\b/i,
  /\bin general\b.*\b(important|useful|necessary)\b/i,
];

function isGenericTemplate(text: string): boolean {
  const t = text.trim();
  return GENERIC_TEMPLATE_PATTERNS.some(p => p.test(t));
}

function getQuestionRejectionReason(
  question: any,
  slot: Slot,
  subjectCtx?: SubjectContext,
  registry?: GenerationRegistry
): string | null {
  if (!question) return 'Empty AI response for slot';
  const questionText = String(question.question_text || question.text || '').trim();
  if (questionText.length < 10) return 'Question text is missing or too short';

  const lowerText = questionText.toLowerCase();
  const topicKeywords = getTopicKeywords(slot.topic);
  if (topicKeywords.length > 0 && !topicKeywords.some(keyword => lowerText.includes(keyword))) {
    return `Missing topic keyword for "${slot.topic}"`;
  }

  // Taxonomy-Based Stem Conditioning: higher-order Bloom levels MUST present a
  // situational case, technical scenario, or analytical-constraint problem.
  // Essays already require extended response, so skip the cue check for them.
  if (
    slot.questionType !== 'essay' &&
    HIGHER_ORDER_BLOOM.has(String(slot.bloomLevel).toLowerCase()) &&
    !hasScenarioCue(questionText)
  ) {
    return `Higher-order Bloom (${slot.bloomLevel}) requires a scenario/case/dataset cue in the stem`;
  }

  // Zero-Redundancy Filter: literal + semantic match against the session
  // compiled-item blacklist. Any hit forces a fresh generation session for
  // this coordinate.
  if (registry && registry.compiledItemStems.length > 0) {
    const dup = findDuplicateInBlacklist(questionText, registry.compiledItemStems, 0.72);
    if (dup.hit) {
      return `Duplicate/similar stem already in session blacklist (sim=${dup.similarity.toFixed(2)})`;
    }
  }

  // For TECHNICAL subjects, also enforce technical-vocabulary presence and reject
  // obvious generic-template stems (the main "context exhaustion" failure mode).
  if (subjectCtx?.isTechnical) {
    if (isGenericTemplate(questionText)) {
      return 'Generic administrative/template stem (technical content required)';
    }
    const vocab = subjectCtx.technicalKeywords || [];
    if (vocab.length > 0) {
      const optionsText = (() => {
        if (slot.questionType === 'mcq') {
          const choices = question.choices || question.options;
          if (!choices) return '';
          return Object.values(choices).join(' ');
        }
        return String(question.correct_answer || question.answer || '');
      })().toLowerCase();
      const combined = `${lowerText} ${optionsText}`;
      const hit = vocab.some(v => combined.includes(v.toLowerCase()));
      if (!hit) return 'Missing required technical vocabulary for this course';
    }
  }

  if (slot.questionType === 'mcq') {
    const choices = question.choices || (Array.isArray(question.options) ? question.options : null);
    if (!choices) return 'MCQ missing choices/options';
    const optionValues = Array.isArray(choices) ? choices : Object.values(choices);
    const validOptionCount = optionValues.filter((value: any) => String(value || '').trim().length > 0).length;
    if (validOptionCount < 2) return 'MCQ has fewer than two valid options';
  }

  if (slot.questionType === 'true_false') {
    const answer = String(question.correct_answer || '').toLowerCase();
    if (!['true', 'false'].includes(answer)) return 'True/False answer must be True or False';
  }

  if (slot.questionType === 'short_answer' && !question.correct_answer && !question.answer) {
    return 'Short-answer item missing correct answer';
  }

  return null;
}

function createFallbackQuestion(slot: Slot, reason: string, sequence: number): any {
  const bloom = slot.bloomLevel.toLowerCase();
  const bloomLabel = bloom.charAt(0).toUpperCase() + bloom.slice(1);
  const topic = slot.topic || 'the topic';
  const focus = ['core concept', 'instructional purpose', 'practical use', 'key relationship', 'evaluation criterion'][sequence % 5];
  const stemByBloom: Record<string, string> = {
    remembering: `Which statement best identifies the ${focus} of ${topic}?`,
    understanding: `Which explanation best shows why ${topic} is important in this lesson?`,
    applying: `In a classroom scenario involving ${topic}, which action best applies the concept?`,
    analyzing: `Which option best analyzes how ${topic} relates to its supporting ideas?`,
    evaluating: `Which criterion best evaluates the effectiveness of an approach to ${topic}?`,
    creating: `Which plan best demonstrates creating a solution based on ${topic}?`
  };

  const correct = `A focused response that directly applies ${topic} using relevant evidence, accurate reasoning, and the required ${bloomLabel.toLowerCase()} skill`;
  const distractors = [
    `A response that mentions ${topic} but relies mainly on unrelated details and unsupported assumptions`,
    `A response that treats ${topic} as a memorized label without connecting it to the required task`,
    `A response that ignores the lesson context and gives a broad answer that could apply to any subject`
  ];
  const { choices, correctAnswer } = randomizeAnswerPosition(correct, distractors);

  const base = {
    id: generateUUID(),
    slot_id: slot.id,
    question_text: stemByBloom[bloom] || `Which answer best demonstrates understanding of ${topic}?`,
    topic,
    bloom_level: bloomLabel,
    difficulty: slot.difficulty,
    knowledge_dimension: slot.knowledgeDimension,
    points: slot.points,
    created_by: 'ai',
    approved: true,
    ai_confidence_score: 0.65,
    needs_review: true,
    validation_notes: `Fallback generated: ${reason}`,
    metadata: {
      generated_by: 'deterministic_fallback',
      pipeline_version: '4.0',
      fallback_reason: reason,
      slot_id: slot.id
    }
  };

  if (slot.questionType === 'true_false') {
    return {
      ...base,
      question_type: 'true_false',
      question_text: `${topic} requires context-specific reasoning rather than copying a general subject description.`,
      choices: { True: 'True', False: 'False' },
      correct_answer: 'True'
    };
  }

  if (slot.questionType === 'short_answer') {
    return {
      ...base,
      question_type: 'short_answer',
      question_text: `State one specific way ${topic} can be explained or applied in this lesson.`,
      correct_answer: `By connecting ${topic} to a specific lesson concept, example, and evidence-based explanation`,
      acceptable_answers: [`Connect ${topic} to a specific concept and supporting example`]
    };
  }

  if (slot.questionType === 'essay') {
    return {
      ...base,
      question_type: 'essay',
      question_text: `Discuss ${topic} by explaining its key ideas, supporting evidence, and implications for the lesson.`,
      correct_answer: null,
      answer: `A strong answer explains ${topic}, uses relevant examples, analyzes relationships, and supports conclusions with clear reasoning.`,
      rubric: 'Assesses topic accuracy, use of evidence, organization, and alignment with the requested Bloom level.'
    };
  }

  return {
    ...base,
    question_type: 'mcq',
    choices,
    correct_answer: correctAnswer,
    explanation: `This item is a simplified fallback that still targets ${topic} and the ${bloomLabel} level.`
  };
}

/**
 * Validate question structure based on type
 */
function validateQuestion(question: any, questionType: string): boolean {
  if (!question.question_text || question.question_text.length < 10) {
    return false;
  }

  if (questionType === 'mcq') {
    // RELAXED: accept if choices object exists with at least 2 options; downstream phase
    // will backfill missing options and flag for review. This prevents over-rejection
    // from blocking TOS completion.
    let choices = question.choices;
    if (!choices || typeof choices !== 'object') {
      if (Array.isArray((question as any).options) && (question as any).options.length >= 2) {
        choices = {};
        ['A', 'B', 'C', 'D'].forEach((k, i) => {
          if ((question as any).options[i]) choices[k] = String((question as any).options[i]);
        });
        question.choices = choices;
      } else {
        console.warn('MCQ missing choices object');
        return false;
      }
    }
    const optionCount = ['A', 'B', 'C', 'D'].filter(
      key => choices[key] && typeof choices[key] === 'string' && choices[key].trim().length > 0
    ).length;
    if (optionCount < 2) {
      console.warn('MCQ has fewer than 2 options');
      return false;
    }
    // Default invalid correct_answer to A (will be flagged downstream)
    if (!['A', 'B', 'C', 'D'].includes(question.correct_answer)) {
      question.correct_answer = 'A';
    }
  }

  if (questionType === 'true_false') {
    // ENFORCE: correct_answer must be "True" or "False"
    if (!['True', 'False', 'true', 'false'].includes(String(question.correct_answer))) {
      console.warn(`T/F has invalid correct_answer: ${question.correct_answer}`);
      return false;
    }
  }

  if (questionType === 'short_answer') {
    // ENFORCE: Must have a correct_answer or model answer
    if (!question.correct_answer && !question.answer) {
      console.warn('Short answer missing correct_answer');
      return false;
    }
  }

  if (questionType === 'essay') {
    // Essay should have rubric or model answer
    if (!question.answer && !question.rubric) {
      console.warn('Essay missing model answer or rubric');
      // Don't reject, just warn - essays are harder to generate
    }
  }

  return true;
}

function selectNextConcept(registry: GenerationRegistry, topic: string): string {
  const used = registry.usedConcepts[topic] || [];
  const available = CONCEPT_POOL.filter(c => !used.includes(c.toLowerCase()));
  return available.length > 0 ? available[0] : CONCEPT_POOL[used.length % CONCEPT_POOL.length];
}

function selectNextOperation(registry: GenerationRegistry, topic: string, bloom: string): string {
  const key = `${topic.toLowerCase()}_${bloom.toLowerCase()}`;
  const used = registry.usedOperations[key] || [];
  const available = (BLOOM_COGNITIVE_OPERATIONS[bloom] || ['explain'])
    .filter(op => !used.includes(op.toLowerCase()));
  return available.length > 0 ? available[0] : BLOOM_COGNITIVE_OPERATIONS[bloom][0];
}

function selectAnswerType(bloom: string): string {
  const types = ANSWER_TYPE_BY_BLOOM[bloom] || ['explanation'];
  return types[Math.floor(Math.random() * types.length)];
}

function markConceptUsed(registry: GenerationRegistry, topic: string, concept: string): void {
  if (!registry.usedConcepts[topic]) {
    registry.usedConcepts[topic] = [];
  }
  registry.usedConcepts[topic].push(concept.toLowerCase());
}

function markOperationUsed(registry: GenerationRegistry, topic: string, bloom: string, operation: string): void {
  const key = `${topic.toLowerCase()}_${bloom.toLowerCase()}`;
  if (!registry.usedOperations[key]) {
    registry.usedOperations[key] = [];
  }
  registry.usedOperations[key].push(operation.toLowerCase());
}

function markPairUsed(registry: GenerationRegistry, concept: string, operation: string): void {
  registry.usedPairs.push(`${concept.toLowerCase()}::${operation.toLowerCase()}`);
}

/**
 * Generate questions using intent-driven prompt with strict format enforcement
 */
async function generateQuestionsWithIntents(
  topic: string,
  bloom: string,
  intents: Array<{
    slot: Slot;
    concept: string;
    operation: string;
    answerType: string;
    difficulty: string;
    knowledgeDimension: string;
    questionType: string;
    points: number;
  }>,
  apiKey: string,
  registry: GenerationRegistry,
  subjectCtx?: SubjectContext,
  position?: { current: number; total: number; checkpoint?: boolean }
): Promise<any[]> {
  const normalizedBloom = bloom.charAt(0).toUpperCase() + bloom.slice(1).toLowerCase();

  // Inject the per-batch position into the SubjectContext so renderSubjectAnchor
  // can include the checkpoint reinforcement line for technical subjects.
  const ctxWithPos: SubjectContext | undefined = subjectCtx
    ? { ...subjectCtx, position }
    : undefined;
  subjectCtx = ctxWithPos;

  // Group by question type for appropriate prompts
  const mcqIntents = intents.filter(i => i.questionType === 'mcq');
  const tfIntents = intents.filter(i => i.questionType === 'true_false');
  const shortAnswerIntents = intents.filter(i => i.questionType === 'short_answer');
  const essayIntents = intents.filter(i => i.questionType === 'essay');

  const allQuestions: any[] = [];

  if (mcqIntents.length > 0) {
    allQuestions.push(...await generateMCQQuestions(topic, normalizedBloom, mcqIntents, apiKey, registry, subjectCtx));
  }
  if (tfIntents.length > 0) {
    allQuestions.push(...await generateTrueFalseQuestions(topic, normalizedBloom, tfIntents, apiKey, registry, subjectCtx));
  }
  if (shortAnswerIntents.length > 0) {
    allQuestions.push(...await generateShortAnswerQuestions(topic, normalizedBloom, shortAnswerIntents, apiKey, registry, subjectCtx));
  }
  if (essayIntents.length > 0) {
    allQuestions.push(...await generateEssayQuestions(topic, normalizedBloom, essayIntents, apiKey, registry, subjectCtx));
  }

  return allQuestions;
}

/**
 * Shuffle an array using Fisher-Yates algorithm
 */
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Randomize correct answer position for MCQ
 * Takes the correct answer and distractors, shuffles them, returns choices object and correct answer letter
 */
function randomizeAnswerPosition(correctText: string, distractors: string[]): { choices: Record<string, string>; correctAnswer: string } {
  const allOptions = [
    { text: correctText, isCorrect: true },
    ...distractors.slice(0, 3).map(d => ({ text: d, isCorrect: false }))
  ];
  
  // Ensure we have exactly 4 options
  while (allOptions.length < 4) {
    allOptions.push({ text: `Additional option ${allOptions.length + 1}`, isCorrect: false });
  }
  
  // Shuffle the options
  const shuffled = shuffleArray(allOptions);
  
  const letters = ['A', 'B', 'C', 'D'];
  const choices: Record<string, string> = {};
  let correctAnswer = 'A';
  
  shuffled.forEach((opt, idx) => {
    choices[letters[idx]] = opt.text;
    if (opt.isCorrect) {
      correctAnswer = letters[idx];
    }
  });
  
  return { choices, correctAnswer };
}

/**
 * Generate MCQ questions with ENFORCED cognitive operations and RANDOMIZED correct answer position
 */
async function generateMCQQuestions(
  topic: string,
  bloom: string,
  intents: any[],
  apiKey: string,
  registry: GenerationRegistry,
  subjectCtx?: SubjectContext
): Promise<any[]> {
  // Get the enhanced bloom configuration for cognitive enforcement
  const bloomConfig = BLOOM_COGNITIVE_OPERATIONS_ENHANCED[bloom.toLowerCase()] || 
                      BLOOM_COGNITIVE_OPERATIONS_ENHANCED.understanding;
  
  const questionsSpec = intents.map((intent, idx) => `
Question ${idx + 1}:
  FOCUS CONCEPT: "${intent.concept}"
  REQUIRED COGNITIVE OPERATION: "${intent.operation}"
  COGNITIVE REQUIREMENT: ${bloomConfig.requirement}
  DIFFICULTY: "${intent.difficulty}"
  
  The question MUST require students to actually ${intent.operation} - not just recall or describe.
  The correct answer must demonstrate ${intent.operation} was performed, not just pattern matching.
`).join('\n');

  const usedTexts = registry.usedQuestionTexts.slice(-15).map(t => t.substring(0, 120));
  
  // Bloom-specific question structure requirements
  const bloomRequirements: Record<string, string> = {
    'Remembering': `Questions must ask for direct recall of specific facts, definitions, or terms.
    FORMAT: "What is...?", "Which term describes...?", "Define..."`,
    
    'Understanding': `Questions must require explaining MEANING or SIGNIFICANCE, not just naming.
    FORMAT: "Why is X important?", "What does X mean in the context of...?", "Explain the relationship between..."
    FORBIDDEN: Simple identification or listing`,
    
    'Applying': `Questions MUST present a specific SCENARIO or PROBLEM to solve.
    FORMAT: "Given [scenario], how would you...?", "In the following situation..., what approach...?"
    REQUIRED: A concrete situation where knowledge must be USED
    FORBIDDEN: Abstract questions without scenarios`,
    
    'Analyzing': `Questions MUST require breaking down and identifying RELATIONSHIPS between components.
    FORMAT: "How does X relate to Y?", "What distinguishes X from Y?", "Examine the interaction between..."
    REQUIRED: Comparison, contrast, or relationship identification
    FORBIDDEN: "What are the key factors?" or any listing pattern`,
    
    'Evaluating': `Questions MUST require making a JUDGMENT or ASSESSMENT with criteria.
    FORMAT: "Which approach is MOST effective for...?", "Evaluate the advantages of X over Y for..."
    REQUIRED: A verdict (best, most appropriate, most effective) WITH justification
    FORBIDDEN: Questions that merely ask to describe or list`,
    
    'Creating': `Questions MUST require DESIGNING, PLANNING, or PRODUCING something new.
    FORMAT: "Design a solution for...", "How would you construct...?", "Develop an approach to..."
    REQUIRED: Tangible output - a design, plan, or new combination
    FORBIDDEN: Questions that only ask to explain or describe existing concepts`
  };
  
  const subjectAnchor = subjectCtx ? renderSubjectAnchor(subjectCtx) + '\n\n' : '';

  const prompt = `${subjectAnchor}Generate ${intents.length} PROFESSIONAL Multiple Choice Questions for an academic examination.

🚨 ABSOLUTE REQUIREMENT: REAL CONTENT ONLY - NO PLACEHOLDERS 🚨

TOPIC: ${topic}
BLOOM'S TAXONOMY LEVEL: ${bloom}

=== BLOOM COGNITIVE REQUIREMENT FOR ${bloom.toUpperCase()} ===
${bloomRequirements[bloom] || bloomRequirements['Understanding']}

=== CRITICAL CONTENT RULES ===
You MUST provide COMPLETE, SUBSTANTIVE content for every field.

FORBIDDEN CONTENT (will cause automatic rejection):
❌ "Correct answer related to ${topic}"
❌ "Plausible distractor about ${topic}"
❌ "Another distractor for ${topic}"
❌ "Option A for ${topic}"
❌ "First/Second/Third option text"
❌ Any meta-description of what an answer SHOULD be

REQUIRED CONTENT:
✅ Each option must be a COMPLETE, SPECIFIC statement
✅ Options must be 15-80 words each
✅ All options must be grammatically parallel
✅ Correct answer must be demonstrably correct
✅ Distractors must be plausible but clearly incorrect when analyzed

=== EXAMPLE OF CORRECT FORMAT ===
Question: "In software development, which practice most effectively ensures code maintainability?"
correct_option: "Implementing consistent coding standards with automated linting, comprehensive documentation, and modular architecture that separates concerns"
distractors: [
  "Writing code as quickly as possible to meet deadlines, then refactoring only when bugs are discovered in production",
  "Using the latest programming frameworks regardless of team expertise, assuming newer technology is always better",
  "Minimizing code comments to reduce file size and relying on self-documenting variable names exclusively"
]

=== ALREADY GENERATED (AVOID SEMANTIC OVERLAP) ===
${usedTexts.length > 0 ? usedTexts.map((t, i) => `${i + 1}. "${t}..."`).join('\n') : 'None yet - first batch'}

=== QUESTION SPECIFICATIONS ===
${questionsSpec}

=== OUTPUT FORMAT ===
Return ONLY valid JSON with COMPLETE content:
{
  "questions": [
    {
      "text": "[Complete question stem - specific to topic, no numbering]",
      "correct_option": "[FULL SUBSTANTIVE ANSWER - 15-80 words, specific content]",
      "distractors": [
        "[FULL SUBSTANTIVE WRONG ANSWER 1 - 15-80 words]",
        "[FULL SUBSTANTIVE WRONG ANSWER 2 - 15-80 words]",
        "[FULL SUBSTANTIVE WRONG ANSWER 3 - 15-80 words]"
      ],
      "explanation": "[Why correct option is right and others are wrong]",
      "cognitive_verification": "[How this tests ${bloom.toLowerCase()} thinking]"
    }
  ]
}`;

  console.log(`🤖 Generating ${intents.length} MCQ questions for ${topic}/${bloom}`);

  const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'google/gemini-3-flash-preview',
      messages: [
        {
          role: 'system',
          content: `You are an expert educational assessment designer creating questions for university-level examinations. 

CRITICAL RULES:
1. Generate COMPLETE, SPECIFIC content - never use placeholders or generic text
2. Each answer option must be a real, substantive response (not "Correct answer about X" or "Distractor for X")
3. Questions must test actual knowledge, not just pattern recognition
4. For higher Bloom's levels, use scenarios and application-based questions
5. All options should be plausible to someone with partial knowledge
6. Return the correct answer separately from distractors so they can be randomized`
        },
        { role: 'user', content: prompt }
      ],

      temperature: 0.6,
      max_tokens: 4000
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('OpenAI API error for MCQ:', error);
    throw new Error('Failed to generate MCQ questions');
  }

  const aiResponse = await response.json();
  
  let generatedQuestions;
  try {
    const content = aiResponse.choices[0].message.content;
    generatedQuestions = extractJSON(content);
  } catch (parseError) {
    console.error('Failed to parse MCQ response:', parseError);
    throw new Error('Invalid MCQ response format');
  }

  // ENHANCED PLACEHOLDER DETECTION - More comprehensive patterns
  const placeholderPatterns = [
    /correct answer (related to|about|for)/i,
    /plausible distractor/i,
    /another distractor/i,
    /final option (regarding|about|for)/i,
    /option [a-d] (for|about|regarding)/i,
    /first option text/i,
    /second option text/i,
    /third option text/i,
    /fourth option text/i,
    /wrong (but plausible )?option/i,
    /\[.*answer.*\]/i,
    /\[.*option.*\]/i,
    /\[.*distractor.*\]/i,
    /example (answer|option|response)/i,
    /placeholder/i,
    /insert.*here/i,
    /your.*answer.*here/i,
    /describe.*here/i
  ];

  // DOMAIN-SPECIFIC FALLBACK CONTENT for when AI produces placeholders
  const fallbackContent: Record<string, { correct: string; distractors: string[] }> = {
    'Remembering': {
      correct: 'A systematic methodology establishing foundational principles that ensure consistent implementation and reliable outcomes across varied contexts',
      distractors: [
        'An optional consideration that applies only in specialized scenarios without broader implications for standard practice',
        'A theoretical framework primarily used for academic discussion rather than practical implementation',
        'A deprecated approach that has been superseded by more modern methodologies in current practice'
      ]
    },
    'Understanding': {
      correct: 'It provides a structured framework enabling systematic analysis, facilitating informed decision-making, and ensuring alignment between objectives and implementation',
      distractors: [
        'It serves primarily as documentation for compliance purposes without significant operational impact on day-to-day activities',
        'It applies exclusively to large-scale implementations and offers limited relevance for smaller projects or teams',
        'It functions as a theoretical exercise with minimal practical value beyond academic or training contexts'
      ]
    },
    'Applying': {
      correct: 'Apply established principles systematically while documenting trade-offs, validating outcomes at each stage, and communicating constraints to relevant stakeholders',
      distractors: [
        'Bypass standard procedures to accelerate delivery, planning to address compliance requirements retroactively',
        'Implement the most straightforward solution available regardless of long-term implications or scalability concerns',
        'Defer all decisions to stakeholders without providing analysis, recommendations, or professional guidance'
      ]
    },
    'Analyzing': {
      correct: 'The interdependencies create feedback loops where changes in one component propagate through the system, necessitating coordinated management and holistic analysis',
      distractors: [
        'Components function independently allowing isolated analysis without consideration of broader system impacts or interactions',
        'The relationship is strictly hierarchical with information and effects flowing in a single predetermined direction',
        'Interactions are fully deterministic and predictable based solely on initial conditions and input parameters'
      ]
    },
    'Evaluating': {
      correct: 'A balanced approach integrating multiple perspectives, establishing measurable success criteria, and incorporating mechanisms for continuous improvement and adaptation',
      distractors: [
        'The most technologically advanced option regardless of organizational readiness, resource requirements, or practical constraints',
        'Whatever approach minimizes organizational change regardless of effectiveness, efficiency, or alignment with objectives',
        'The lowest-cost alternative accepting all necessary trade-offs in quality, capability, and long-term sustainability'
      ]
    },
    'Creating': {
      correct: 'A modular architecture with clearly defined interfaces allowing individual components to evolve independently while maintaining overall system coherence and integrity',
      distractors: [
        'A comprehensive solution attempting to address all possible scenarios simultaneously regardless of current priorities or resource constraints',
        'A minimal implementation focused exclusively on immediate requirements without provisions for future growth or adaptation',
        'A direct replication of an existing solution from a different context without modification for current circumstances'
      ]
    }
  };

  return (generatedQuestions.questions || []).map((q: any, idx: number) => {
    const intent = intents[idx];
    
    let correctOption = q.correct_option || q.correct_answer || '';
    let distractors = q.distractors || [];
    
    // Check if any content is placeholder
    const allContent = [correctOption, ...distractors].join(' ');
    const hasPlaceholder = placeholderPatterns.some(pattern => pattern.test(allContent));
    
    // If placeholder detected, use fallback content
    if (hasPlaceholder || !correctOption || distractors.length < 3) {
      console.warn(`⚠️ Placeholder detected, using fallback content for: ${q.text?.substring(0, 50)}...`);
      const fallback = fallbackContent[bloom] || fallbackContent['Understanding'];
      correctOption = fallback.correct;
      distractors = fallback.distractors;
    }
    
    // Validate minimum content length
    const hasSubstantiveContent = correctOption.length >= 20 && 
      distractors.every((d: string) => d && d.length >= 20);
    
    if (!hasSubstantiveContent) {
      console.warn(`⚠️ Content too short, using fallback for: ${q.text?.substring(0, 50)}...`);
      const fallback = fallbackContent[bloom] || fallbackContent['Understanding'];
      correctOption = fallback.correct;
      distractors = fallback.distractors;
    }
    
    // Randomize the answer position
    const { choices, correctAnswer } = randomizeAnswerPosition(correctOption, distractors);
    
    // Final validation - choices must be substantive
    const finalChoicesValid = Object.values(choices).every(
      (c: string) => c && c.length >= 20 && !placeholderPatterns.some(p => p.test(c))
    );
    
    if (!finalChoicesValid) {
      console.error(`❌ Failed to generate valid content for MCQ, skipping`);
      return null;
    }
    
    return {
      id: generateUUID(),
      question_text: normalizeQuestionText(q.text || `Analyze the key aspects of ${topic} in the context of ${bloom.toLowerCase()} level understanding.`),
      question_type: 'mcq',
      choices: choices,
      correct_answer: correctAnswer,
      explanation: q.explanation || `This answer correctly demonstrates ${bloom.toLowerCase()} level thinking about ${topic}.`,
      topic: topic,
      bloom_level: bloom,
      difficulty: intent?.difficulty || 'average',
      knowledge_dimension: intent?.knowledgeDimension || 'conceptual',
      points: POINTS.mcq,
      created_by: 'ai',
      approved: true,
      ai_confidence_score: hasPlaceholder ? 0.7 : 0.85,
      needs_review: hasPlaceholder,
      metadata: {
        generated_by: 'intent_driven_pipeline',
        pipeline_version: '3.0',
        question_type: 'mcq',
        answer_randomized: true,
        used_fallback: hasPlaceholder
      }
    };
  }).filter((q: any) => q !== null && q.question_text && q.question_text.length > 10);
}

/**
 * Generate True/False questions
 */
async function generateTrueFalseQuestions(
  topic: string,
  bloom: string,
  intents: any[],
  apiKey: string,
  registry: GenerationRegistry,
  subjectCtx?: SubjectContext
): Promise<any[]> {
  const questionsSpec = intents.map((intent, idx) => `
Question ${idx + 1}:
  CONCEPT: "${intent.concept}"
  DIFFICULTY: "${intent.difficulty}"
`).join('\n');

  const subjectAnchor = subjectCtx ? renderSubjectAnchor(subjectCtx) + '\n\n' : '';
  const prompt = `${subjectAnchor}Generate ${intents.length} DISTINCT True/False questions.

TOPIC: ${topic}
BLOOM'S LEVEL: ${bloom}

=== QUESTION SPECIFICATIONS ===
${questionsSpec}

=== TRUE/FALSE FORMAT ===
1. Statement must be clearly TRUE or FALSE (no ambiguity)
2. Use factual statements about ${topic}
3. Avoid trick questions or double negatives
4. Statement should test understanding, not just memorization
5. Balance between True and False answers

Return ONLY valid JSON:
{
  "questions": [
    {
      "text": "Statement about ${topic} that is either true or false.",
      "correct_answer": "True",
      "explanation": "Why this statement is true/false"
    }
  ]
}`;

  console.log(`🤖 Generating ${intents.length} T/F questions for ${topic}/${bloom}`);

  const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'google/gemini-3-flash-preview',
      messages: [
        {
          role: 'system',
          content: `You are an expert educational assessment designer. Generate clear True/False questions where the statement is unambiguously true or false. Balance the answers between True and False.`
        },
        { role: 'user', content: prompt }
      ],

      temperature: 0.3,
      max_tokens: 2000
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('OpenAI API error for T/F:', error);
    throw new Error('Failed to generate T/F questions');
  }

  const aiResponse = await response.json();
  
  let generatedQuestions;
  try {
    const content = aiResponse.choices[0].message.content;
    generatedQuestions = extractJSON(content);
  } catch (parseError) {
    console.error('Failed to parse T/F response:', parseError);
    throw new Error('Invalid T/F response format');
  }

  return (generatedQuestions.questions || []).map((q: any, idx: number) => {
    const intent = intents[idx];
    
    // Normalize correct_answer
    let correctAnswer = String(q.correct_answer || 'True');
    if (correctAnswer.toLowerCase() === 'true') correctAnswer = 'True';
    else if (correctAnswer.toLowerCase() === 'false') correctAnswer = 'False';
    else correctAnswer = 'True';
    
    return {
      id: generateUUID(),
      question_text: q.text,
      question_type: 'true_false',
      choices: { 'True': 'True', 'False': 'False' },
      correct_answer: correctAnswer,
      explanation: q.explanation,
      topic: topic,
      bloom_level: bloom,
      difficulty: intent?.difficulty || 'easy',
      knowledge_dimension: intent?.knowledgeDimension || 'factual',
      points: POINTS.true_false,
      created_by: 'ai',
      approved: false,
      ai_confidence_score: 0.85,
      needs_review: true,
      metadata: {
        generated_by: 'intent_driven_pipeline',
        pipeline_version: '2.1',
        question_type: 'true_false'
      }
    };
  }).filter((q: any) => q.question_text && q.question_text.length > 10);
}

/**
 * Generate Short Answer / Fill in the Blank questions
 */
async function generateShortAnswerQuestions(
  topic: string,
  bloom: string,
  intents: any[],
  apiKey: string,
  registry: GenerationRegistry,
  subjectCtx?: SubjectContext
): Promise<any[]> {
  const questionsSpec = intents.map((intent, idx) => `
Question ${idx + 1}:
  CONCEPT: "${intent.concept}"
  OPERATION: "${intent.operation}"
  DIFFICULTY: "${intent.difficulty}"
`).join('\n');

  const subjectAnchor = subjectCtx ? renderSubjectAnchor(subjectCtx) + '\n\n' : '';
  const prompt = `${subjectAnchor}Generate ${intents.length} DISTINCT Short Answer / Fill in the Blank questions.

TOPIC: ${topic}
BLOOM'S LEVEL: ${bloom}

=== QUESTION SPECIFICATIONS ===
${questionsSpec}

=== SHORT ANSWER FORMAT ===
1. Question should require a brief, specific answer (1-3 words or a short phrase)
2. Include a clear blank or question requiring a specific term/concept
3. Answer should be unambiguous and verifiable
4. Test understanding of key terms, definitions, or concepts
5. Avoid questions with multiple correct answers

=== EXAMPLE FORMATS ===
- "The process by which plants convert sunlight to energy is called ________."
- "What is the name of the smallest unit of life?"
- "In programming, a ________ stores a value that can change during execution."

Return ONLY valid JSON:
{
  "questions": [
    {
      "text": "The ________ is the central concept in ${topic}.",
      "correct_answer": "specific term or phrase",
      "acceptable_answers": ["term", "alternative phrasing"],
      "explanation": "Why this is the correct answer"
    }
  ]
}`;

  console.log(`🤖 Generating ${intents.length} Short Answer questions for ${topic}/${bloom}`);

  const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'google/gemini-3-flash-preview',
      messages: [
        {
          role: 'system',
          content: `You are an expert educational assessment designer. Generate clear Short Answer / Fill in the Blank questions that have unambiguous, specific answers. Include acceptable alternative phrasings when appropriate.`
        },
        { role: 'user', content: prompt }
      ],

      temperature: 0.3,
      max_tokens: 2000
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('OpenAI API error for Short Answer:', error);
    throw new Error('Failed to generate Short Answer questions');
  }

  const aiResponse = await response.json();
  
  let generatedQuestions;
  try {
    const content = aiResponse.choices[0].message.content;
    generatedQuestions = extractJSON(content);
  } catch (parseError) {
    console.error('Failed to parse Short Answer response:', parseError);
    throw new Error('Invalid Short Answer response format');
  }

  return (generatedQuestions.questions || []).map((q: any, idx: number) => {
    const intent = intents[idx];
    
    return {
      id: generateUUID(),
      question_text: q.text,
      question_type: 'short_answer',
      correct_answer: q.correct_answer,
      acceptable_answers: q.acceptable_answers || [q.correct_answer],
      explanation: q.explanation,
      topic: topic,
      bloom_level: bloom,
      difficulty: intent?.difficulty || 'average',
      knowledge_dimension: intent?.knowledgeDimension || 'factual',
      points: POINTS.short_answer,
      created_by: 'ai',
      approved: false,
      ai_confidence_score: 0.85,
      needs_review: true,
      metadata: {
        generated_by: 'intent_driven_pipeline',
        pipeline_version: '2.1',
        question_type: 'short_answer'
      }
    };
  }).filter((q: any) => q.question_text && q.question_text.length > 10);
}

/**
 * Generate Essay questions (limited count, high value)
 */
async function generateEssayQuestions(
  topic: string,
  bloom: string,
  intents: any[],
  apiKey: string,
  registry: GenerationRegistry,
  subjectCtx?: SubjectContext
): Promise<any[]> {
  const questionsSpec = intents.map((intent, idx) => `
Essay ${idx + 1}:
  CONCEPT: "${intent.concept}"
  REQUIRED THINKING: "${intent.operation}"
  DIFFICULTY: "${intent.difficulty}"
`).join('\n');

  const subjectAnchor = subjectCtx ? renderSubjectAnchor(subjectCtx) + '\n\n' : '';
  const prompt = `${subjectAnchor}Generate ${intents.length} Essay questions worth 5 points each.

TOPIC: ${topic}
BLOOM'S LEVEL: ${bloom} (Higher-order thinking)

=== ESSAY SPECIFICATIONS ===
${questionsSpec}

=== ESSAY FORMAT ===
1. Question should require extended written response
2. Should test higher-order thinking (analysis, evaluation, synthesis)
3. Should have clear rubric criteria for scoring
4. Worth 5 points - question complexity should match

Return ONLY valid JSON:
{
  "questions": [
    {
      "text": "Essay question requiring analysis/evaluation/synthesis about ${topic}",
      "rubric": {
        "5_points": "Excellent: Comprehensive analysis with...",
        "4_points": "Good: Solid understanding with...",
        "3_points": "Satisfactory: Basic understanding with...",
        "2_points": "Developing: Limited understanding with...",
        "1_point": "Beginning: Minimal understanding with..."
      },
      "model_answer": "A model answer that demonstrates full understanding..."
    }
  ]
}`;

  console.log(`🤖 Generating ${intents.length} Essay questions for ${topic}/${bloom}`);

  const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'google/gemini-3-flash-preview',
      messages: [
        {
          role: 'system',
          content: `You are an expert educational assessment designer. Generate high-quality essay questions that test higher-order thinking skills. Include a clear rubric for 5-point scoring.`
        },
        { role: 'user', content: prompt }
      ],

      temperature: 0.4,
      max_tokens: 3000
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('OpenAI API error for Essay:', error);
    throw new Error('Failed to generate Essay questions');
  }

  const aiResponse = await response.json();
  
  let generatedQuestions;
  try {
    const content = aiResponse.choices[0].message.content;
    generatedQuestions = extractJSON(content);
  } catch (parseError) {
    console.error('Failed to parse Essay response:', parseError);
    throw new Error('Invalid Essay response format');
  }

  return (generatedQuestions.questions || []).map((q: any, idx: number) => {
    const intent = intents[idx];
    
    return {
      id: generateUUID(),
      question_text: q.text,
      question_type: 'essay',
      correct_answer: null,
      answer: q.model_answer,
      rubric: q.rubric,
      topic: topic,
      bloom_level: bloom,
      difficulty: intent?.difficulty || 'difficult',
      knowledge_dimension: intent?.knowledgeDimension || 'metacognitive',
      points: POINTS.essay,
      created_by: 'ai',
      approved: false,
      ai_confidence_score: 0.80,
      needs_review: true,
      metadata: {
        generated_by: 'intent_driven_pipeline',
        pipeline_version: '2.1',
        question_type: 'essay'
      }
    };
  }).filter((q: any) => q.question_text && q.question_text.length > 20);
}

// ============= MAIN HANDLER =============

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
    const { createClient: createAnonClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    const anonClient = createAnonClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } });
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

    const body: GenerationInput = await req.json();
    
    if (!body.tos_id || !body.total_items || !body.distributions) {
      throw new Error('Missing required fields: tos_id, total_items, distributions');
    }

    // Input validation
    if (body.total_items > 500) {
      throw new Error('Maximum 500 items per request');
    }
    if (body.distributions.length > 50) {
      throw new Error('Maximum 50 topic distributions per request');
    }

    console.log(`\n🎯 === SLOT-BASED TOS GENERATION v2.1 ===`);
    console.log(`📋 TOS ID: ${body.tos_id}`);
    console.log(`📊 Total items requested: ${body.total_items}`);
    console.log(`📚 Topics: ${body.distributions.map(d => d.topic).join(', ')}`);

    const registry: GenerationRegistry = {
      usedConcepts: {},
      usedOperations: {},
      usedPairs: [],
      usedQuestionTexts: []
    };

    // STEP 1: Expand TOS into slots with question types
    const allSlots = expandTOSToSlots(body.distributions, body.total_items);

    // STEP 1b: Load TOS metadata so we can re-inject SUBJECT CONTEXT into every batch
    // (prevents AI drift on technical subjects during long generation runs)
    let subjectCtx: SubjectContext | undefined;
    try {
      const { data: tosRow } = await supabase
        .from('tos_entries')
        .select('subject_no, course, description')
        .eq('id', body.tos_id)
        .maybeSingle();
      subjectCtx = buildSubjectContext(
        tosRow?.subject_no || '',
        tosRow?.course || '',
        tosRow?.description || '',
        body.distributions.map(d => d.topic)
      );
      console.log(`🎓 Subject anchor: code="${subjectCtx.subjectCode}" course="${subjectCtx.courseName}" technical=${subjectCtx.isTechnical} keywords=[${subjectCtx.technicalKeywords.slice(0, 8).join(', ')}]`);
    } catch (e) {
      console.warn('Could not load TOS metadata for subject anchor:', e);
    }

    let bankFilled: Slot[] = [];
    let unfilled: Slot[] = allSlots;

    if (!body.force_ai_generation) {
      const bankResult = await fillSlotsFromBank(
        allSlots,
        registry,
        body.allow_unapproved ?? false
      );
      bankFilled = bankResult.filled;
      unfilled = bankResult.unfilled;
    } else {
      console.log(`⚡ force_ai_generation=true: Generating all ${allSlots.length} slots via AI`);
    }

    // STEP 2: Generate AI questions in SEGMENTED BATCHES with re-injected subject context
    const aiFilled = await fillSlotsWithAI(unfilled, registry, subjectCtx);

    // Merge results
    const filledById = new Map<string, Slot>();
    for (const slot of bankFilled) {
      filledById.set(slot.id, slot);
    }
    for (const slot of aiFilled) {
      if (slot.filled && slot.question) {
        filledById.set(slot.id, slot);
      }
    }

    // ============= STEP 3: NORMALIZE, VALIDATE & COMPLETION GATE =============
    console.log(`\n🔧 === NORMALIZATION & VALIDATION PHASE ===`);
    
    const rawQuestions: any[] = [];
    for (const slot of allSlots) {
      const filledSlot = filledById.get(slot.id);
      if (filledSlot && filledSlot.question) {
        filledSlot.question.slot_id = slot.id;
        filledSlot.question.points = filledSlot.points;
        rawQuestions.push(filledSlot.question);
      }
    }
    
    // Apply normalization and validation
    let normalizedQuestions: any[] = [];
    const rejectedQuestions: any[] = [];
    const acceptedTexts: string[] = [];
    
    for (const q of rawQuestions) {
      // NORMALIZE: Clean question text
      const originalText = q.question_text || '';
      const normalizedText = normalizeQuestionText(originalText);
      
      // Check if normalization changed the text significantly
      if (normalizedText !== originalText) {
        console.log(`   📝 Normalized: "${originalText.substring(0, 40)}..." → "${normalizedText.substring(0, 40)}..."`);
      }
      
      // VALIDATE: Check Bloom level enforcement (FLAG ONLY — never reject)
      const bloomValidation = validateBloomEnforcement(normalizedText, q.bloom_level || 'understanding');
      if (!bloomValidation.valid) {
        console.warn(`   ⚠️ Bloom validation flag: "${normalizedText.substring(0, 50)}..." - ${bloomValidation.reason}`);
        q.needs_review = true;
        q.validation_notes = bloomValidation.reason;
      }

      // VALIDATE: Check semantic similarity (relaxed threshold: 0.88, only near-duplicates)
      const similarityCheck = checkSemanticRedundancy(normalizedText, acceptedTexts, 0.88);
      if (similarityCheck.isRedundant) {
        console.warn(`   🔁 Near-duplicate flagged (${(similarityCheck.similarity! * 100).toFixed(0)}%): "${normalizedText.substring(0, 50)}..."`);
        // Flag for review but KEEP the question to honor TOS count
        q.needs_review = true;
        q.validation_notes = `Near-duplicate (${(similarityCheck.similarity! * 100).toFixed(0)}% similar)`;
      }
      
      // VALIDATE: For MCQs, ensure proper structure (only HARD-reject when unrecoverable)
      if (q.question_type === 'mcq') {
        let choices = q.choices;
        if (!choices || typeof choices !== 'object') {
          // Try to repair from options array if present
          if (Array.isArray((q as any).options) && (q as any).options.length >= 2) {
            choices = {} as any;
            ['A', 'B', 'C', 'D'].forEach((k, i) => {
              if ((q as any).options[i]) (choices as any)[k] = String((q as any).options[i]);
            });
            q.choices = choices;
          } else {
            console.warn(`   ⚠️ MCQ missing choices object, applying repair choices`);
            choices = {
              A: `A focused answer about ${q.topic || 'the topic'} with accurate supporting reasoning`,
              B: `A broad answer that mentions ${q.topic || 'the topic'} but lacks lesson-specific support`,
              C: `An unrelated answer that does not address the required academic context`,
              D: `A partial answer that repeats terms without explaining their meaning`
            };
            q.choices = choices;
            q.correct_answer = 'A';
            q.needs_review = true;
            q.validation_notes = (q.validation_notes ? q.validation_notes + '; ' : '') + 'Repaired missing MCQ choices';
          }
        }

        // Backfill any missing options with neutral placeholders rather than rejecting
        const missingKeys = ['A', 'B', 'C', 'D'].filter(key =>
          !choices[key] || typeof choices[key] !== 'string' || choices[key].trim().length === 0
        );
        if (missingKeys.length > 0) {
          for (const k of missingKeys) {
            choices[k] = `Option ${k}`;
          }
          q.needs_review = true;
          q.validation_notes = (q.validation_notes ? q.validation_notes + '; ' : '') + `Backfilled options: ${missingKeys.join(',')}`;
        }

        // Validate correct answer is A, B, C, or D
        if (!['A', 'B', 'C', 'D'].includes(q.correct_answer)) {
          console.warn(`   ⚠️ MCQ has invalid correct_answer "${q.correct_answer}", defaulting to A`);
          q.correct_answer = 'A';
          q.needs_review = true;
        }

        // Placeholder content -> FLAG, not reject
        const placeholderPatterns = [
          /correct answer (related to|about|for)/i,
          /plausible distractor/i,
          /another distractor/i,
          /option [a-d] for/i
        ];
        const hasPlaceholder = Object.values(choices).some(
          (opt: any) => placeholderPatterns.some(p => p.test(String(opt)))
        );
        if (hasPlaceholder) {
          q.needs_review = true;
          q.validation_notes = (q.validation_notes ? q.validation_notes + '; ' : '') + 'Contains placeholder content';
        }
      }
      
      // Question passed all validations
      q.question_text = normalizedText;
      normalizedQuestions.push(q);
      acceptedTexts.push(normalizedText.toLowerCase());
    }
    
    console.log(`   ✅ Normalized: ${normalizedQuestions.length} questions accepted`);
    console.log(`   ❌ Rejected: ${rejectedQuestions.length} questions (redundant/invalid)`);

    // ============= STEP 4: COMPLETION GATE - ENFORCE EXACT TOS COUNT =============
    const requiredTotal = body.total_items;
    let completionAttempts = 0;
    const MAX_COMPLETION_ATTEMPTS = 5;
    
    while (normalizedQuestions.length < requiredTotal && completionAttempts < MAX_COMPLETION_ATTEMPTS) {
      completionAttempts++;
      const shortfall = requiredTotal - normalizedQuestions.length;
      
      console.log(`\n🔄 === COMPLETION GATE RETRY ${completionAttempts}/${MAX_COMPLETION_ATTEMPTS} ===`);
      console.log(`   📊 Current: ${normalizedQuestions.length}/${requiredTotal} (need ${shortfall} more)`);
      
      // Determine which slots were not filled or had questions rejected
      const unfilledSlots: Slot[] = [];
      const usedSlotIds = new Set(normalizedQuestions.map(q => q.slot_id || q.id));
      
      for (const slot of allSlots) {
        const filledSlot = filledById.get(slot.id);
        if (!filledSlot || !filledSlot.filled) {
          unfilledSlots.push(slot);
        } else if (!usedSlotIds.has(slot.id) && !usedSlotIds.has(filledSlot.question?.id)) {
          // This slot had a question but it was rejected during validation
          unfilledSlots.push(slot);
        }
      }
      
      // If we can't identify unfilled slots, create generic MCQ slots for the shortfall
      const slotsToFill = unfilledSlots.length > 0 
        ? unfilledSlots.slice(0, shortfall)
        : Array.from({ length: shortfall }, (_, i) => ({
            id: `repair_slot_${completionAttempts}_${i}`,
            topic: body.distributions[0]?.topic || 'General',
            bloomLevel: ['remembering', 'understanding', 'applying'][i % 3],
            difficulty: ['easy', 'average', 'difficult'][i % 3],
            knowledgeDimension: 'conceptual',
            questionType: 'mcq' as const,
            points: 1,
            filled: false
          }));
      
      console.log(`   🎯 Generating ${slotsToFill.length} repair questions...`);
      
      // Generate repair questions using AI
      const aiRepairKey = Deno.env.get('LOVABLE_API_KEY') || Deno.env.get('OPENAI_API_KEY');
      if (!aiRepairKey) {
        console.warn(`   🛟 No AI key for repair; filling ${slotsToFill.length} slots with fallback questions`);
        for (const [index, slot] of slotsToFill.entries()) {
          const q = createFallbackQuestion(slot, 'No AI API key during repair', index);
          normalizedQuestions.push(q);
          acceptedTexts.push(String(q.question_text).toLowerCase());
        }
        continue;
      }
      
      const repairFilled = await fillSlotsWithAI(slotsToFill, registry, subjectCtx);
      
      // Validate and add repair questions
      let repairAccepted = 0;
      for (const slot of repairFilled) {
        if (!slot.filled || !slot.question) continue;
        
        const q = slot.question;
        q.points = slot.points || 1;
        
        const normalizedText = normalizeQuestionText(q.question_text || '');
        
        // Check for redundancy against existing accepted questions
        const similarityCheck = checkSemanticRedundancy(normalizedText, acceptedTexts, 0.88);
        if (similarityCheck.isRedundant) {
          console.warn(`   🔁 Repair question near-duplicate flagged, accepting with review note`);
          q.needs_review = true;
          q.validation_notes = (q.validation_notes ? q.validation_notes + '; ' : '') + `Repair near-duplicate (${((similarityCheck.similarity || 0) * 100).toFixed(0)}%)`;
        }
        
        // Validate MCQ structure
        if (q.question_type === 'mcq') {
          const choices = q.choices;
          if (!choices || typeof choices !== 'object') {
            const fallback = createFallbackQuestion(slot, 'Repair MCQ missing choices', repairAccepted);
            normalizedQuestions.push(fallback);
            acceptedTexts.push(String(fallback.question_text).toLowerCase());
            repairAccepted++;
            continue;
          }
          const hasAllOptions = ['A', 'B', 'C', 'D'].every(key => 
            choices[key] && typeof choices[key] === 'string' && choices[key].trim().length > 5
          );
          if (!hasAllOptions) {
            for (const key of ['A', 'B', 'C', 'D']) {
              if (!choices[key] || typeof choices[key] !== 'string' || choices[key].trim().length <= 5) {
                choices[key] = `Fallback option ${key} about ${q.topic || slot.topic}`;
              }
            }
            q.needs_review = true;
            q.validation_notes = (q.validation_notes ? q.validation_notes + '; ' : '') + 'Repaired incomplete MCQ options';
          }
          if (!['A', 'B', 'C', 'D'].includes(q.correct_answer)) {
            q.correct_answer = 'A';
            q.needs_review = true;
          }
        }
        
        q.question_text = normalizedText;
        q.metadata = { ...(q.metadata || {}), repair_attempt: completionAttempts };
        normalizedQuestions.push(q);
        acceptedTexts.push(normalizedText.toLowerCase());
        repairAccepted++;
      }
      
      console.log(`   ✅ Repair attempt ${completionAttempts}: added ${repairAccepted} questions`);
      console.log(`   📊 New total: ${normalizedQuestions.length}/${requiredTotal}`);
      
      // If no progress was made, break to avoid infinite loop
      if (repairAccepted === 0) {
        console.warn(`   🛟 No AI repair progress; fallback-filling ${slotsToFill.length} slots`);
        for (const [index, slot] of slotsToFill.entries()) {
          const q = createFallbackQuestion(slot, `No valid AI repair output on attempt ${completionAttempts}`, index);
          normalizedQuestions.push(q);
          acceptedTexts.push(String(q.question_text).toLowerCase());
          repairAccepted++;
        }
      }
    }
    
    // ============= STEP 5: FINAL FILL — guarantee exact TOS count =============
    // If still short after AI repair, fill with placeholder MCQs flagged for review
    // rather than hard-failing the entire generation.
    if (normalizedQuestions.length < requiredTotal) {
      const finalShortfall = requiredTotal - normalizedQuestions.length;
      console.warn(`\n⚠️ === SOFT-FILL ${finalShortfall} REMAINING SLOTS ===`);
      console.warn(`   Required: ${requiredTotal}, Generated: ${normalizedQuestions.length}`);
      const filledSlotIds = new Set(normalizedQuestions.map(q => q.slot_id || q.metadata?.slot_id).filter(Boolean));
      const remainingSlots = allSlots.filter(slot => !filledSlotIds.has(slot.id));
      for (let i = 0; i < finalShortfall; i++) {
        const slot = remainingSlots[i] || allSlots[(normalizedQuestions.length + i) % allSlots.length] || {
          id: `final_fallback_${i}`,
          topic: body.distributions[0]?.topic || 'General Topic',
          bloomLevel: 'understanding',
          difficulty: 'average',
          knowledgeDimension: 'conceptual',
          questionType: 'mcq' as const,
          points: 1,
          filled: false
        };
        normalizedQuestions.push(createFallbackQuestion(slot, 'Final completion fallback after retries', i));
      }
    }
    
    // Trim to exact count (in case we generated extra)
    const trimmedQuestions = normalizedQuestions.slice(0, requiredTotal);
    
    // Verify we have exactly the required count
    if (trimmedQuestions.length !== requiredTotal) {
      throw new Error(
        `Final validation failed: expected ${requiredTotal} questions, got ${trimmedQuestions.length}`
      );
    }
    
    console.log(`\n✅ === TOS CONTRACT SATISFIED ===`);
    console.log(`   Generated exactly ${trimmedQuestions.length}/${requiredTotal} questions`);
    
    // Calculate statistics by question type
    const typeCounts = {
      mcq: trimmedQuestions.filter(q => q.question_type === 'mcq').length,
      true_false: trimmedQuestions.filter(q => q.question_type === 'true_false').length,
      short_answer: trimmedQuestions.filter(q => q.question_type === 'short_answer').length,
      essay: trimmedQuestions.filter(q => q.question_type === 'essay').length
    };
    
    const totalPoints = trimmedQuestions.reduce((sum, q) => sum + (q.points || 1), 0);
    
    // Determine which secondary type was used
    const secondaryTypeUsed = typeCounts.true_false > 0 ? 'true_false' : 
                              typeCounts.short_answer > 0 ? 'short_answer' : 'none';

    console.log(`📊 Final assembly: ${trimmedQuestions.length} questions`);
    console.log(`   MCQ: ${typeCounts.mcq} (${typeCounts.mcq * POINTS.mcq} pts)`);
    if (typeCounts.true_false > 0) {
      console.log(`   T/F: ${typeCounts.true_false} (${typeCounts.true_false * POINTS.true_false} pts)`);
    }
    if (typeCounts.short_answer > 0) {
      console.log(`   Short Answer: ${typeCounts.short_answer} (${typeCounts.short_answer * POINTS.short_answer} pts)`);
    }
    console.log(`   Essay: ${typeCounts.essay} (${typeCounts.essay * POINTS.essay} pts)`);
    console.log(`   Total Points: ${totalPoints}`);
    console.log(`   (Note: Secondary type used: ${secondaryTypeUsed === 'true_false' ? 'True/False' : secondaryTypeUsed === 'short_answer' ? 'Short Answer' : 'None'})`);

    const stats = {
      total_generated: trimmedQuestions.length,
      total_points: totalPoints,
      slots_created: allSlots.length,
      from_bank: bankFilled.length,
      ai_generated: aiFilled.filter(s => s.filled).length,
      unfilled: allSlots.length - filledById.size,
      rejected_redundant: rejectedQuestions.length,
      normalization_applied: true,
      semantic_validation: true,
      by_question_type: typeCounts,
      by_bloom: trimmedQuestions.reduce((acc: Record<string, number>, q: any) => {
        const level = q.bloom_level?.toLowerCase() || 'unknown';
        acc[level] = (acc[level] || 0) + 1;
        return acc;
      }, {}),
      by_difficulty: trimmedQuestions.reduce((acc: Record<string, number>, q: any) => {
        acc[q.difficulty || 'average'] = (acc[q.difficulty || 'average'] || 0) + 1;
        return acc;
      }, {}),
      by_topic: trimmedQuestions.reduce((acc: Record<string, number>, q: any) => {
        acc[q.topic] = (acc[q.topic] || 0) + 1;
        return acc;
      }, {}),
      needs_review: trimmedQuestions.filter((q: any) => q.needs_review).length
    };

    console.log(`\n✅ === GENERATION COMPLETE ===`);

    return new Response(JSON.stringify({
      success: true,
      questions: trimmedQuestions,
      generation_log: allSlots.map(s => {
        const filled = filledById.get(s.id);
        return {
          slot_id: s.id,
          topic: s.topic,
          bloom: s.bloomLevel,
          difficulty: s.difficulty,
          question_type: s.questionType,
          points: s.points,
          filled: filled?.filled ?? false,
          source: filled?.source || 'unfilled'
        };
      }),
      statistics: stats,
      tos_id: body.tos_id
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (error) {
    console.error('Generation error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: `Question generation failed: ${message}` }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      }
    );
  }
});
