/**
 * Subject Metadata Resolver
 * Resolves category, specialization, subject_code, and subject_description
 * for AI-generated questions based on context (topic, subject string, etc.)
 * 
 * If a match is found in the CATEGORY_CONFIG, it assigns the correct values.
 * If no match exists, it creates a new entry. If a description matches but
 * with a different code, it updates to the correct code.
 */

import { CATEGORY_CONFIG, type SubjectEntry } from '@/config/questionBankFilters';
import { normalizeCategory, normalizeSpecialization } from '@/utils/acronymNormalizer';

export interface SubjectMetadata {
  category: string;
  specialization: string;
  subject_code: string;
  subject_description: string;
}

/**
 * Resolve subject metadata from a subject string, topic, or other context.
 * Searches CATEGORY_CONFIG for matching subject descriptions or codes.
 * 
 * @param context - Object containing available context fields
 * @returns Resolved SubjectMetadata or best-effort assignment
 */
export function resolveSubjectMetadata(context: {
  subject?: string;
  topic?: string;
  subject_code?: string;
  subject_description?: string;
  category?: string;
  specialization?: string;
}): SubjectMetadata {
  // Normalize acronyms/full forms before processing
  const category = normalizeCategory(context.category) || undefined;
  const specialization = normalizeSpecialization(context.specialization) || undefined;
  const { subject, topic, subject_code, subject_description } = context;

  // If all fields are already provided, validate and return
  if (category && specialization && subject_code && subject_description) {
    return { category, specialization, subject_code, subject_description };
  }

  // Try to find a match in CATEGORY_CONFIG
  const searchTerms = [
    subject_description,
    subject,
    topic,
  ].filter(Boolean) as string[];

  // Strategy 1: Match by subject_code + category + specialization
  if (subject_code && category && specialization) {
    const config = CATEGORY_CONFIG[category];
    if (config) {
      const spec = config.specializations.find(s => s.name === specialization);
      if (spec) {
        const subj = spec.subjects.find(s => s.code === subject_code);
        if (subj) {
          return { category, specialization, subject_code, subject_description: subj.description };
        }
      }
    }
  }

  // Strategy 2: Match by subject description across all categories
  for (const term of searchTerms) {
    const match = findByDescription(term);
    if (match) return match;
  }

  // Strategy 3: Match by subject code if provided
  if (subject_code) {
    const match = findByCode(subject_code, category, specialization);
    if (match) return match;
  }

  // Strategy 4: Fuzzy match - check if any search term contains or is contained by a known description
  for (const term of searchTerms) {
    const match = findByFuzzyDescription(term);
    if (match) return match;
  }

  // Strategy 5: Infer from subject string pattern like "101 - Introduction to Computing"
  if (subject) {
    const codeMatch = subject.match(/^(\d+)\s*[-–]\s*(.+)$/);
    if (codeMatch) {
      const [, code, desc] = codeMatch;
      const match = findByDescription(desc.trim()) || findByCode(code, category, specialization);
      if (match) return match;
    }
  }

  // No match found - create a new entry with best available info
  const resolvedDescription = subject_description || extractDescription(subject) || topic || '';
  const resolvedCode = subject_code || extractCode(subject) || generateNewCode(resolvedDescription);

  return {
    category: category || inferCategory(resolvedDescription, topic),
    specialization: specialization || inferSpecialization(resolvedDescription, topic),
    subject_code: resolvedCode,
    subject_description: resolvedDescription,
  };
}

/**
 * Find exact match by description in CATEGORY_CONFIG
 */
function findByDescription(description: string): SubjectMetadata | null {
  const normalizedDesc = description.toLowerCase().trim();
  
  for (const [cat, config] of Object.entries(CATEGORY_CONFIG)) {
    for (const spec of config.specializations) {
      for (const subj of spec.subjects) {
        if (subj.description.toLowerCase().trim() === normalizedDesc) {
          return {
            category: cat,
            specialization: spec.name,
            subject_code: subj.code,
            subject_description: subj.description,
          };
        }
      }
    }
  }
  return null;
}

/**
 * Fuzzy match by checking if search term contains or is contained by a known description
 */
function findByFuzzyDescription(term: string): SubjectMetadata | null {
  const normalizedTerm = term.toLowerCase().trim();
  let bestMatch: { metadata: SubjectMetadata; score: number } | null = null;

  for (const [cat, config] of Object.entries(CATEGORY_CONFIG)) {
    for (const spec of config.specializations) {
      for (const subj of spec.subjects) {
        const normalizedDesc = subj.description.toLowerCase().trim();
        
        // Check containment in both directions
        if (normalizedTerm.includes(normalizedDesc) || normalizedDesc.includes(normalizedTerm)) {
          const score = Math.min(normalizedTerm.length, normalizedDesc.length) / 
                       Math.max(normalizedTerm.length, normalizedDesc.length);
          
          if (!bestMatch || score > bestMatch.score) {
            bestMatch = {
              metadata: {
                category: cat,
                specialization: spec.name,
                subject_code: subj.code,
                subject_description: subj.description,
              },
              score,
            };
          }
        }
      }
    }
  }

  return bestMatch && bestMatch.score > 0.3 ? bestMatch.metadata : null;
}

/**
 * Find match by subject code, optionally scoped to category/specialization
 */
function findByCode(code: string, category?: string, specialization?: string): SubjectMetadata | null {
  const categories = category ? { [category]: CATEGORY_CONFIG[category] } : CATEGORY_CONFIG;

  for (const [cat, config] of Object.entries(categories)) {
    if (!config) continue;
    const specs = specialization 
      ? config.specializations.filter(s => s.name === specialization)
      : config.specializations;

    for (const spec of specs) {
      const subj = spec.subjects.find(s => s.code === code);
      if (subj) {
        return {
          category: cat,
          specialization: spec.name,
          subject_code: subj.code,
          subject_description: subj.description,
        };
      }
    }
  }
  return null;
}

/**
 * Extract code from a subject string like "101 - Introduction to Computing"
 */
function extractCode(subject?: string): string {
  if (!subject) return '';
  const match = subject.match(/^(\d+)/);
  return match ? match[1] : '';
}

/**
 * Extract description from a subject string like "101 - Introduction to Computing"
 */
function extractDescription(subject?: string): string {
  if (!subject) return '';
  const match = subject.match(/^\d+\s*[-–]\s*(.+)$/);
  return match ? match[1].trim() : subject;
}

/**
 * Generate a new subject code based on description keywords
 */
function generateNewCode(description: string): string {
  if (!description) return '999';
  // Simple hash-based code generation
  const hash = description.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return String(100 + (hash % 900));
}

/**
 * Infer category from description/topic keywords
 */
function inferCategory(description: string, topic?: string): string {
  const text = `${description} ${topic || ''}`.toLowerCase();
  
  // Check for Major-related keywords
  const majorKeywords = ['programming', 'computing', 'database', 'network', 'software', 'algorithm',
    'data structure', 'web development', 'information system', 'computer science', 'game', 'animation',
    'artificial intelligence', 'operating system', 'security', 'architecture', 'multimedia'];
  
  if (majorKeywords.some(kw => text.includes(kw))) return 'Major';
  
  // Check for GE-related keywords
  const geKeywords = ['mathematics', 'calculus', 'algebra', 'statistics', 'physical education',
    'english', 'filipino', 'communication', 'literature', 'history', 'ethics', 'rizal',
    'science', 'society', 'understanding the self', 'contemporary world', 'sports', 'wellness'];
  
  if (geKeywords.some(kw => text.includes(kw))) return 'GE';
  
  return 'Major'; // Default
}

/**
 * Infer specialization from description/topic keywords
 */
function inferSpecialization(description: string, topic?: string): string {
  const text = `${description} ${topic || ''}`.toLowerCase();
  
  // Major specializations
  if (/information system|business process|enterprise|is project/.test(text)) return 'IS';
  if (/computer science|object.oriented|operating system|theory of computation|artificial intelligence|software engineering/.test(text)) return 'CS';
  if (/entertainment|multimedia|digital media|game development|animation/.test(text)) return 'EMC';
  if (/computing|programming|data structure|web|database|network|security/.test(text)) return 'IT';
  
  // GE specializations
  if (/math|calculus|algebra|statistics|probability|linear/.test(text)) return 'Math';
  if (/physical|fitness|wellness|sports|rhythmic/.test(text)) return 'P.E.';
  if (/english|purposive|communication|technical writing|literature/.test(text)) return 'English';
  if (/filipino|kontekstuwalisado|pagbasa|masining/.test(text)) return 'Filipino';
  if (/science|technology|contemporary/.test(text)) return 'Science';
  if (/self|ethics|rizal|social/.test(text)) return 'Social Science';
  
  return 'IT'; // Default for Major
}
