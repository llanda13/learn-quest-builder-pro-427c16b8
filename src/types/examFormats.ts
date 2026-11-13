/**
 * Exam Format Definitions
 * Predefined multi-section exam formats with strict section boundaries
 */

export type QuestionType = 'mcq' | 'true_false' | 'fill_blank' | 'essay';

export interface ExamSection {
  id: string;
  label: string; // e.g., "Section A"
  title: string; // e.g., "Multiple Choice"
  questionType: QuestionType;
  startNumber: number;
  endNumber: number;
  pointsPerQuestion: number;
  instruction: string;
  essayCount?: number; // For essay sections: number of actual essay questions (items are grouped)
}

export interface EssayPromptGroup {
  id: string;
  number: number;
  startNumber: number;
  endNumber: number;
}

export function getEssayPromptGroup(section: ExamSection, itemNumber: number): EssayPromptGroup | undefined {
  if (section.questionType !== 'essay' || !section.essayCount) return undefined;
  const sectionSize = section.endNumber - section.startNumber + 1;
  const groupCount = Math.min(section.essayCount, sectionSize);
  const itemIndex = itemNumber - section.startNumber;
  if (itemIndex < 0 || itemIndex >= sectionSize) return undefined;

  const groupIndex = Math.min(groupCount - 1, Math.floor((itemIndex * groupCount) / sectionSize));
  const startNumber = section.startNumber + Math.floor((groupIndex * sectionSize) / groupCount);
  const endNumber = section.startNumber + Math.floor(((groupIndex + 1) * sectionSize) / groupCount) - 1;
  return {
    id: `${section.id}-essay-${groupIndex + 1}`,
    number: groupIndex + 1,
    startNumber,
    endNumber
  };
}

export interface ExamFormat {
  id: string;
  name: string;
  description: string;
  totalItems: number;
  sections: ExamSection[];
  totalPoints: number;
}

/**
 * Format 1: All Multiple Choice (50 items)
 */
export const FORMAT_1: ExamFormat = {
  id: 'format_1',
  name: 'Format 1: All Multiple Choice',
  description: 'Section A – Multiple Choice (Questions 1–50)',
  totalItems: 50,
  totalPoints: 50,
  sections: [
    {
      id: 'A',
      label: 'Section A',
      title: 'Multiple Choice',
      questionType: 'mcq',
      startNumber: 1,
      endNumber: 50,
      pointsPerQuestion: 1,
      instruction: 'Choose the letter of the best answer.'
    }
  ]
};

/**
 * Format 2: MCQ + True/False or Fill-in-the-Blank + Essay
 * Section C: 1 essay question covering items 46-50 (worth 5 points total)
 */
export const FORMAT_2: ExamFormat = {
  id: 'format_2',
  name: 'Format 2: MCQ + T/F or Fill-in + Essay',
  description: 'Section A – MCQ (1–35), Section B – T/F or Fill-in (36–45), Section C – Essay (46–50; 1 essay, 5 pts)',
  totalItems: 50,
  totalPoints: 50, // 35 + 10 + 5 (1 essay = 5pts covering items 46-50)
  sections: [
    {
      id: 'A',
      label: 'Section A',
      title: 'Multiple Choice',
      questionType: 'mcq',
      startNumber: 1,
      endNumber: 35,
      pointsPerQuestion: 1,
      instruction: 'Choose the letter of the best answer.'
    },
    {
      id: 'B',
      label: 'Section B',
      title: 'True or False',
      questionType: 'true_false',
      startNumber: 36,
      endNumber: 45,
      pointsPerQuestion: 1,
      instruction: 'Write TRUE if the statement is correct, FALSE if incorrect.'
    },
    {
      id: 'C',
      label: 'Section C',
      title: 'Essay',
      questionType: 'essay',
      startNumber: 46,
      endNumber: 50,
      pointsPerQuestion: 5, // 1 essay question worth 5 points
      essayCount: 1, // Number of actual essay questions
      instruction: 'Answer the following question in complete sentences. (5 points)'
    }
  ]
};

/**
 * Format 3: MCQ + Fill-in-the-Blank + True/False
 */
export const FORMAT_3: ExamFormat = {
  id: 'format_3',
  name: 'Format 3: MCQ + Fill-in + T/F',
  description: 'Section A – MCQ (1–30), Section B – Fill-in (31–40), Section C – T/F (41–50)',
  totalItems: 50,
  totalPoints: 50,
  sections: [
    {
      id: 'A',
      label: 'Section A',
      title: 'Multiple Choice',
      questionType: 'mcq',
      startNumber: 1,
      endNumber: 30,
      pointsPerQuestion: 1,
      instruction: 'Choose the letter of the best answer.'
    },
    {
      id: 'B',
      label: 'Section B',
      title: 'Fill in the Blank',
      questionType: 'fill_blank',
      startNumber: 31,
      endNumber: 40,
      pointsPerQuestion: 1,
      instruction: 'Write the correct answer on the blank provided.'
    },
    {
      id: 'C',
      label: 'Section C',
      title: 'True or False',
      questionType: 'true_false',
      startNumber: 41,
      endNumber: 50,
      pointsPerQuestion: 1,
      instruction: 'Write TRUE if the statement is correct, FALSE if incorrect.'
    }
  ]
};

/**
 * Format 4: MCQ + Essay
 * Section B: 2 essay questions, each covering 5 items (41-45, 46-50), 5 pts each = 10 pts total
 */
export const FORMAT_4: ExamFormat = {
  id: 'format_4',
  name: 'Format 4: MCQ + Essay',
  description: 'Section A – MCQ (1–40), Section B – Essay (41–50; 2 essays @ 5 pts each)',
  totalItems: 50,
  totalPoints: 50, // 40 + 10 (2 essays @ 5pts each)
  sections: [
    {
      id: 'A',
      label: 'Section A',
      title: 'Multiple Choice',
      questionType: 'mcq',
      startNumber: 1,
      endNumber: 40,
      pointsPerQuestion: 1,
      instruction: 'Choose the letter of the best answer.'
    },
    {
      id: 'B',
      label: 'Section B',
      title: 'Essay',
      questionType: 'essay',
      startNumber: 41,
      endNumber: 50,
      pointsPerQuestion: 5, // Each essay is worth 5 points
      essayCount: 2, // 2 essay questions: 41-45 and 46-50
      instruction: 'Answer the following questions in complete sentences. (5 points each)'
    }
  ]
};

/**
 * All available exam formats
 */
export const EXAM_FORMATS: ExamFormat[] = [FORMAT_1, FORMAT_2, FORMAT_3, FORMAT_4];

/**
 * Get exam format by ID
 */
export function getExamFormat(formatId: string): ExamFormat | undefined {
  return EXAM_FORMATS.find(f => f.id === formatId);
}

/**
 * Get default format
 */
export function getDefaultFormat(): ExamFormat {
  return FORMAT_1;
}

/**
 * Calculate section counts from format and total items
 * This scales the format to match the requested total items
 */
export function scaledFormatSections(format: ExamFormat, totalItems: number): ExamSection[] {
  const ratio = totalItems / format.totalItems;
  let usedItems = 0;
  
  return format.sections.map((section, idx) => {
    const originalCount = section.endNumber - section.startNumber + 1;
    const scaledCount = idx === format.sections.length - 1
      ? totalItems - usedItems // Last section gets remainder
      : Math.round(originalCount * ratio);
    
    const startNumber = usedItems + 1;
    const endNumber = usedItems + scaledCount;
    usedItems += scaledCount;
    
    return {
      ...section,
      startNumber,
      endNumber
    };
  });
}

/**
 * Get question type count requirements for generation
 */
export interface SectionRequirement {
  questionType: QuestionType;
  count: number;
  sectionLabel: string;
  sectionTitle: string;
  pointsPerQuestion: number;
}

export function getFormatRequirements(format: ExamFormat, totalItems?: number): SectionRequirement[] {
  const sections = totalItems ? scaledFormatSections(format, totalItems) : format.sections;
  
  return sections.map(section => ({
    questionType: section.questionType,
    count: section.endNumber - section.startNumber + 1,
    sectionLabel: section.label,
    sectionTitle: section.title,
    pointsPerQuestion: section.pointsPerQuestion
  }));
}
