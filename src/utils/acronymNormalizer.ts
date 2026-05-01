/**
 * Acronym Normalizer
 * Maps full forms to their standard acronym/short forms used in the system.
 * Case-insensitive matching with trimming.
 */

// Bidirectional mapping: full name → acronym
const SPECIALIZATION_MAP: Record<string, string> = {
  'information technology': 'IT',
  'information systems': 'IS',
  'computer science': 'CS',
  'entertainment and multimedia computing': 'EMC',
  'physical education': 'P.E.',
  'social science': 'Social Science',
  'mathematics': 'Math',
  'math': 'Math',
  'english': 'English',
  'filipino': 'Filipino',
  'science': 'Science',
};

// Reverse map: acronym → acronym (identity, for validation)
const KNOWN_ACRONYMS = new Set([
  'IT', 'IS', 'CS', 'EMC', 'P.E.', 'Math', 'English', 'Filipino', 'Science', 'Social Science',
]);

const CATEGORY_MAP: Record<string, string> = {
  'major': 'Major',
  'general education': 'GE',
  'gen ed': 'GE',
  'ge': 'GE',
};

const KNOWN_CATEGORIES = new Set(['Major', 'GE']);

/**
 * Normalize a specialization value to its standard short form.
 * e.g., "Information Technology" → "IT", "IT" → "IT"
 */
export function normalizeSpecialization(value: string | undefined | null): string {
  if (!value) return '';
  const trimmed = value.trim();
  
  // Already a known acronym
  if (KNOWN_ACRONYMS.has(trimmed)) return trimmed;
  
  // Lookup in map (case-insensitive)
  const mapped = SPECIALIZATION_MAP[trimmed.toLowerCase()];
  if (mapped) return mapped;
  
  // Fuzzy: check if value contains a known full form
  const lower = trimmed.toLowerCase();
  for (const [fullForm, acronym] of Object.entries(SPECIALIZATION_MAP)) {
    if (lower.includes(fullForm) || fullForm.includes(lower)) {
      return acronym;
    }
  }
  
  // Return as-is if no mapping found
  return trimmed;
}

/**
 * Normalize a category value to its standard form.
 * e.g., "General Education" → "GE", "Major" → "Major"
 */
export function normalizeCategory(value: string | undefined | null): string {
  if (!value) return '';
  const trimmed = value.trim();
  
  if (KNOWN_CATEGORIES.has(trimmed)) return trimmed;
  
  const mapped = CATEGORY_MAP[trimmed.toLowerCase()];
  if (mapped) return mapped;
  
  return trimmed;
}

/**
 * Normalize all metadata fields on a question-like object in place.
 * Handles category, specialization normalization.
 */
export function normalizeQuestionMetadata<T extends { category?: string; specialization?: string }>(question: T): T {
  if (question.category) {
    question.category = normalizeCategory(question.category);
  }
  if (question.specialization) {
    question.specialization = normalizeSpecialization(question.specialization);
  }
  return question;
}
