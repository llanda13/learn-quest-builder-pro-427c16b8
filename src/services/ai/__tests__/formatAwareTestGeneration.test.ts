import { describe, expect, it } from 'vitest';
import {
  assignSlotsToSections,
  buildSlotRegenerationContext,
  getQuestionDuplicateReason,
  validateAnswerKey,
  validateGeneratedPlanQuestions,
  validateQuestionForType,
  type GenerationSlot,
  type QuestionCandidate,
  type SectionedQuestion
} from '../formatAwareTestGeneration';
import { EXAM_FORMATS, FORMAT_1, scaledFormatSections } from '@/types/examFormats';

function createSlots(count: number, questionType = 'essay'): GenerationSlot[] {
  const bloomLevels = ['Remembering', 'Understanding', 'Applying', 'Analyzing', 'Evaluating', 'Creating'];
  return Array.from({ length: count }, (_, index) => ({
    item_number: index + 1,
    topic: `Unit ${Math.floor(index / 10) + 1}`,
    bloom_level: bloomLevels[index % bloomLevels.length],
    difficulty: 'Average',
    knowledge_dimension: 'Conceptual',
    question_type: questionType
  }));
}

function createValidMCQ(slot: GenerationSlot): SectionedQuestion {
  const suffix = slot.item_number;
  return {
    id: `question-${suffix}`,
    question_number: suffix,
    section_id: slot.section_id || 'A',
    section_label: slot.section_label || 'Section A',
    section_title: slot.section_title || 'Multiple Choice',
    question_text: `For item ${suffix}, compute alpha${suffix} beta${suffix} gamma${suffix}?`,
    question_type: 'mcq',
    choices: {
      A: `Answer ${suffix} alpha${suffix}`,
      B: `Distractor ${suffix} beta${suffix}`,
      C: `Distractor ${suffix} gamma${suffix}`,
      D: `Distractor ${suffix} delta${suffix}`
    },
    correct_answer: 'A',
    points: 1,
    topic: slot.topic,
    bloom_level: slot.bloom_level,
    difficulty: slot.difficulty,
    knowledge_dimension: slot.knowledge_dimension
  };
}

function createQuestionForSlot(slot: GenerationSlot): SectionedQuestion {
  const suffix = slot.item_number;
  const question = {
    ...createValidMCQ(slot),
    question_text: `For item ${suffix}, process concept${suffix} with operation${suffix} in scenario${suffix}?`,
    question_type: slot.question_type as SectionedQuestion['question_type']
  };
  switch (slot.question_type) {
    case 'true_false':
      return {
        ...question,
        question_type: 'true_false',
        choices: { A: 'True', B: 'False' },
        correct_answer: 'True'
      };
    case 'fill_blank':
      return {
        ...question,
        question_type: 'fill_blank',
        choices: undefined,
        correct_answer: `answer${suffix}`
      };
    case 'essay':
      return {
        ...question,
        question_type: 'essay',
        choices: undefined,
        correct_answer: `Rubric for prompt ${suffix}`
      };
    default:
      return question;
  }
}

describe('format-aware generation enforcement', () => {
  it('forces all 50 Format 1 slots to MCQ while preserving the TOS metadata and higher-order levels', () => {
    const slots = createSlots(50);
    const sections = scaledFormatSections(FORMAT_1, 50);
    const assigned = assignSlotsToSections(slots, sections);

    expect(assigned).toHaveLength(50);
    expect(assigned.every((slot) => slot.question_type === 'mcq')).toBe(true);
    expect(new Set(assigned.map((slot) => slot.section_id))).toEqual(new Set(['A']));
    expect(assigned.map((slot) => slot.bloom_level)).toEqual(slots.map((slot) => slot.bloom_level));
    expect(assigned.map((slot) => slot.difficulty)).toEqual(slots.map((slot) => slot.difficulty));
    expect(assigned.map((slot) => slot.knowledge_dimension)).toEqual(slots.map((slot) => slot.knowledge_dimension));
    expect(assigned.filter((slot) => ['Analyzing', 'Evaluating', 'Creating'].includes(slot.bloom_level))).toHaveLength(24);

    const questions = assigned.map(createValidMCQ);
    expect(questions).toHaveLength(50);
    questions.forEach((question) => {
      expect(Object.keys(question.choices || {}).sort()).toEqual(['A', 'B', 'C', 'D']);
      expect(validateQuestionForType(question, 'mcq')).toEqual([]);
    });

    validateGeneratedPlanQuestions(assigned, questions);
    const answerKey = questions.map((question) => ({
      question_number: question.question_number,
      question_id: question.id,
      correct_answer: question.correct_answer
    }));
    expect(answerKey).toHaveLength(50);
    validateAnswerKey(questions, answerKey);
  });

  it('rejects invalid MCQ option sets and multiple correct answers', () => {
    const slot = assignSlotsToSections(createSlots(1), scaledFormatSections(FORMAT_1, 1))[0];
    const question = createValidMCQ(slot);
    expect(validateQuestionForType({ ...question, choices: { A: 'one', B: 'two', C: 'three' } }, 'mcq'))
      .toContain('MCQ must contain exactly options A, B, C, and D.');
    expect(validateQuestionForType({ ...question, correct_answer: ['A', 'B'] as unknown as string }, 'mcq'))
      .toContain('MCQ must have exactly one correct answer.');
  });

  it('uses the selected format section type for every supported format', () => {
    for (const format of EXAM_FORMATS) {
      const slots = createSlots(50);
      const assigned = assignSlotsToSections(slots, scaledFormatSections(format, 50));
      expect(assigned).toHaveLength(50);

      for (const slot of assigned) {
        const section = format.sections.find((candidate) =>
          slot.item_number >= candidate.startNumber && slot.item_number <= candidate.endNumber
        );
        expect(section).toBeDefined();
        expect(slot.question_type).toBe(section?.questionType);
        expect(slot.section_id).toBe(section?.id);
      }

      expect(new Set(assigned.map((slot) => slot.question_type))).toEqual(
        new Set(format.sections.map((section) => section.questionType))
      );
      validateGeneratedPlanQuestions(assigned, assigned.map(createQuestionForSlot));
    }
  });

  it('passes the rejected question and unchanged slot metadata into regeneration context', () => {
    const [slot] = assignSlotsToSections(createSlots(1, 'essay'), scaledFormatSections(FORMAT_1, 1));
    const context = buildSlotRegenerationContext(slot, [{
      question: 'Rejected question text',
      reason: 'Duplicate of question 3'
    }]);

    expect(context).toMatchObject({
      question_number: 1,
      question_type: 'mcq',
      topic: slot.topic,
      bloom_level: slot.bloom_level,
      difficulty: slot.difficulty,
      knowledge_dimension: slot.knowledge_dimension,
      rejected_questions: [{ question: 'Rejected question text', reason: 'Duplicate of question 3' }]
    });
  });
});

describe('format-aware duplicate detection', () => {
  const mcq = (questionText: string, answer: string, topic = 'Geography'): SectionedQuestion => ({
    id: questionText,
    question_number: 1,
    section_id: 'A',
    section_label: 'Section A',
    section_title: 'Multiple Choice',
    question_text: questionText,
    question_type: 'mcq',
    choices: { A: answer, B: 'Other', C: 'Another', D: 'Last' },
    correct_answer: 'A',
    points: 1,
    topic,
    bloom_level: 'Understanding',
    difficulty: 'Average'
  });

  it('rejects exact and minor wording duplicates after normalization', () => {
    const original = mcq('What is the primary purpose of Active Directory?', 'A directory service');
    expect(getQuestionDuplicateReason(
      mcq('WHAT is the primary purpose of Active Directory!', 'A directory service'),
      original
    )).toMatch(/Exact duplicate/);
    expect(getQuestionDuplicateReason(
      mcq('What is the main function of Active Directory?', 'A directory service'),
      original
    )).toBeDefined();
  });

  it('rejects paraphrased questions with the same objective and expected answer', () => {
    const original = mcq(
      'Mia must calculate the mean of values 4, 6, and 8. What is the mean?',
      '6',
      'Mathematics'
    );
    const paraphrase = mcq(
      'Noah needs to find the average of scores 4, 6, and 8. Which result is the mean?',
      '6',
      'Mathematics'
    );
    expect(getQuestionDuplicateReason(paraphrase, original)).toMatch(/Substantially similar/);
  });

  it('accepts different questions about the same broad topic when objectives differ', () => {
    const mean = mcq('What is the mean of 4, 6, and 8?', '6', 'Mathematics');
    const median = mcq('What is the median of 4, 6, and 8?', '6', 'Mathematics');
    expect(getQuestionDuplicateReason(median, mean)).toBeUndefined();
  });

  it('does not reject distinct questions because they share an answer or answer letter', () => {
    const sameAnswerDifferentObjectives: [QuestionCandidate, QuestionCandidate] = [
      {
        question_text: 'What is the mean of 4, 6, and 8?',
        question_type: 'mcq',
        choices: { A: '6', B: '4', C: '8', D: '18' },
        correct_answer: 'A',
        topic: 'Mathematics'
      },
      {
        question_text: 'What is the median of 4, 6, and 8?',
        question_type: 'mcq',
        choices: { A: '6', B: '4', C: '8', D: '18' },
        correct_answer: 'A',
        topic: 'Mathematics'
      }
    ];
    const sameLetterDifferentAnswers: [QuestionCandidate, QuestionCandidate] = [
      {
        question_text: 'Which planet is known for its prominent rings?',
        question_type: 'mcq',
        choices: { A: 'Saturn', B: 'Mars', C: 'Venus', D: 'Mercury' },
        correct_answer: 'A',
        topic: 'Astronomy'
      },
      {
        question_text: 'Which planet is commonly called the Red Planet?',
        question_type: 'mcq',
        choices: { A: 'Mars', B: 'Saturn', C: 'Venus', D: 'Mercury' },
        correct_answer: 'A',
        topic: 'Astronomy'
      }
    ];

    expect(getQuestionDuplicateReason(...sameAnswerDifferentObjectives)).toBeUndefined();
    expect(getQuestionDuplicateReason(...sameLetterDifferentAnswers)).toBeUndefined();
  });

  it('rejects the same question when choice order changes', () => {
    const original: QuestionCandidate = {
      question_text: 'Which component is volatile working memory for active processor data?',
      question_type: 'mcq',
      choices: { A: 'Random Access Memory', B: 'Solid-state drive', C: 'Power supply', D: 'Graphics processor' },
      correct_answer: 'A',
      topic: 'Computer Hardware'
    };
    const reordered: QuestionCandidate = {
      question_text: 'Which component is volatile working memory for active processor data?',
      question_type: 'mcq',
      choices: { A: 'Graphics processor', B: 'Random Access Memory', C: 'Power supply', D: 'Solid-state drive' },
      correct_answer: 'B',
      topic: 'Computer Hardware'
    };

    expect(getQuestionDuplicateReason(reordered, original)).toMatch(/Exact duplicate/);
  });

  it('accepts a genuinely different replacement after rejecting a duplicate', () => {
    const accepted = mcq('What is the capital city of France?', 'Paris');
    const rejected = mcq('Which city is France’s capital?', 'Paris');
    const replacement = mcq('Which ocean borders France to the west?', 'Atlantic Ocean');

    expect(getQuestionDuplicateReason(rejected, accepted)).toBeDefined();
    expect(getQuestionDuplicateReason(replacement, accepted)).toBeUndefined();
  });

  it('rejects the exam duplicate pairs identified in the review', () => {
    const makeQuestion = (
      questionText: string,
      answer: string,
      topic = 'Computer Hardware'
    ): QuestionCandidate => ({
      question_text: questionText,
      question_type: 'mcq',
      choices: { A: answer, B: 'Distractor one', C: 'Distractor two', D: 'Distractor three' },
      correct_answer: 'A',
      topic
    });

    const duplicatePairs: Array<[QuestionCandidate, QuestionCandidate]> = [
      [
        makeQuestion(
          'Identify the primary internal component that functions as volatile working memory, holding data and machine code in active use by the processor.',
          'Random Access Memory is volatile working storage for active instructions and data used by the CPU.'
        ),
        makeQuestion(
          'Identify the component that temporarily stores data and machine code currently being used by the central processing unit.',
          'Random Access Memory is the volatile storage medium that gives the CPU high-speed access to active data and instructions.'
        )
      ],
      [
        makeQuestion(
          'How does the Northbridge subsystem differ from the Southbridge in managing motherboard data flow?',
          'The Northbridge connects the CPU, system memory, and graphics lanes; the Southbridge handles slower peripheral and storage controllers.'
        ),
        makeQuestion(
          'How do the traditional Northbridge and Southbridge chipset functions differ?',
          'The Northbridge manages high-speed CPU, memory, and graphics communication; the Southbridge handles slower peripheral I/O and storage.'
        )
      ],
      [
        makeQuestion(
          'Which input device captures continuous spatial coordinates by tracking physical surface movement across a desk?',
          'An optical mouse captures successive surface images and translates movement into cursor coordinates.'
        ),
        makeQuestion(
          'How does an optical computer mouse track user movement across a physical surface?',
          'An optical mouse compares consecutive images of the surface to calculate displacement and cursor coordinates.'
        )
      ],
      [
        makeQuestion(
          'Which output device projects visual representations onto large projection screens or flat surfaces?',
          'A digital video projector displays a computer video signal on an external surface.'
        ),
        makeQuestion(
          'Which output device presents computer data as human-readable visual text and graphics?',
          'A display monitor presents visual information generated by the computer.'
        )
      ],
      [
        makeQuestion(
          'Evaluate which output device is appropriate for medical film printing requiring continuous-tone rendering, archival stability, and high optical density.',
          'A laser photoplotter using dry silver film.'
        ),
        makeQuestion(
          'For medical diagnostic scans requiring continuous-tone grayscale and archival permanence, which output device is most appropriate?',
          'A thermal dye-sublimation printer using specialized film.'
        )
      ]
    ];

    duplicatePairs.forEach(([candidate, existing], index) => {
      expect(
        getQuestionDuplicateReason(candidate, existing),
        `duplicate pair ${index + 1}`
      ).toBeDefined();
    });
  });

  it('does not reject distinct objectives merely because they share a broad topic', () => {
    const projectorIdentification: QuestionCandidate = {
      question_text: 'Which output device projects a computer image onto a large screen?',
      question_type: 'mcq',
      choices: { A: 'A digital projector', B: 'A monitor', C: 'A scanner', D: 'A printer' },
      correct_answer: 'A',
      topic: 'Computer Output Devices'
    };
    const projectorInstallation: QuestionCandidate = {
      question_text: 'How does a projector throw ratio determine the minimum distance from the lens to the screen?',
      question_type: 'mcq',
      choices: { A: 'It relates image width to lens distance', B: 'It measures lamp power', C: 'It sets refresh rate', D: 'It sets pixel depth' },
      correct_answer: 'A',
      topic: 'Computer Output Devices'
    };
    const dotMatrixInkjetMechanisms: QuestionCandidate = {
      question_text: 'What is the operational difference between impact dot-matrix printers and non-impact inkjet printers?',
      question_type: 'mcq',
      choices: { A: 'How each mechanism deposits ink', B: 'Their screen resolutions', C: 'Their network protocols', D: 'Their paper sizes' },
      correct_answer: 'A',
      topic: 'Computer Output Devices'
    };
    const plotterSublimationMechanisms: QuestionCandidate = {
      question_text: 'How do electrostatic plotters and thermal dye-sublimation printers deposit colorants onto media?',
      question_type: 'mcq',
      choices: { A: 'Their respective toner and dye-transfer processes', B: 'Their network protocols', C: 'Their keyboard interfaces', D: 'Their display refresh rates' },
      correct_answer: 'A',
      topic: 'Computer Output Devices'
    };

    expect(getQuestionDuplicateReason(projectorInstallation, projectorIdentification)).toBeUndefined();
    expect(getQuestionDuplicateReason(plotterSublimationMechanisms, dotMatrixInkjetMechanisms)).toBeUndefined();
  });
});
