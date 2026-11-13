/**
 * Knowledge Dimension Types
 * Based on Anderson & Krathwohl's revised Bloom's Taxonomy
 */

export type KnowledgeDimension = 
  | 'factual'
  | 'conceptual'
  | 'procedural'
  | 'metacognitive';

const KNOWLEDGE_DIMENSIONS: readonly KnowledgeDimension[] = [
  'factual',
  'conceptual',
  'procedural',
  'metacognitive',
];

export function normalizeKnowledgeDimension(value: unknown): KnowledgeDimension {
  if (typeof value !== 'string') {
    throw new Error(
      'Knowledge dimension is required. Choose factual, conceptual, procedural, or metacognitive.'
    );
  }

  const normalized = value.trim().toLowerCase();
  if (!KNOWLEDGE_DIMENSIONS.includes(normalized as KnowledgeDimension)) {
    throw new Error(
      'Unsupported knowledge dimension. Choose factual, conceptual, procedural, or metacognitive.'
    );
  }

  return normalized as KnowledgeDimension;
}

/**
 * Answer Types - What kind of thinking the question demands
 * This is the key to preventing redundancy by design
 * 
 * CRITICAL: Every question MUST have an answer_type assigned.
 * GPT never chooses structure - the system does.
 */
export type AnswerType =
  | 'definition'      // Remembering: State what something IS
  | 'explanation'     // Understanding: Describe HOW or WHY
  | 'comparison'      // Analyzing: Compare TWO+ elements (similarities AND differences)
  | 'procedure'       // Applying: Ordered STEPS to accomplish something
  | 'application'     // Applying: USE knowledge in a specific scenario
  | 'evaluation'      // Evaluating: Make a JUDGMENT based on criteria
  | 'justification'   // Evaluating: Provide REASONS and EVIDENCE
  | 'analysis'        // Analyzing: BREAK DOWN into components and relationships
  | 'design'          // Creating: CREATE a plan or blueprint
  | 'construction';   // Creating: BUILD something original

/**
 * Question Intent - The structural constraint that governs generation
 * No two questions in the same exam may share the same intent tuple
 * 
 * MANDATORY: answer_type must be assigned BEFORE generation, not after
 */
export interface QuestionIntent {
  topic: string;
  bloomLevel: string;
  knowledgeDimension: KnowledgeDimension;
  answerType: AnswerType; // REQUIRED - no question may be generated without this
}

/**
 * Generated Question with enforced structure
 */
export interface StructuredQuestion {
  text: string;
  answerType: AnswerType;
  answer: string;
  bloomLevel: string;
  knowledgeDimension: KnowledgeDimension;
  topic: string;
  structureValidated: boolean; // True if answer passed structural validation
}

export interface KnowledgeClassificationResult {
  dimension: KnowledgeDimension;
  confidence: number;
  source: 'rule-based' | 'ai-fallback';
  reasoning?: string;
}

export interface BloomKnowledgeConstraint {
  topic: string;
  bloomLevel: string;
  knowledgeDimension: KnowledgeDimension;
  answerType?: AnswerType; // Now included in constraint
  difficulty?: string;
}
