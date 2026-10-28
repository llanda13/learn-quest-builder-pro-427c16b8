import { describe, expect, it } from 'vitest';
import { assignSlotsToSections, ExamDeduplicationTracker } from '../formatAwareTestGeneration';

const mcqSection = {
  id: 'A',
  label: 'Section A',
  title: 'Multiple Choice',
  questionType: 'mcq',
  startNumber: 1,
  endNumber: 10,
  pointsPerQuestion: 1,
  instruction: 'Choose the letter of the best answer.'
};

describe('assignSlotsToSections', () => {
  it('enforces the selected exam format when a TOS essay slot falls inside an MCQ section', () => {
    const slots = [
      {
        item_number: 7,
        topic: 'Sample Topic',
        bloom_level: 'Analyzing',
        difficulty: 'difficult',
        question_type: 'essay'
      }
    ];

    const assigned = assignSlotsToSections(slots as any, [mcqSection] as any);

    expect(assigned[0].section_id).toBe('A');
    expect(assigned[0].question_type).toBe('mcq');
  });
});

describe('ExamDeduplicationTracker', () => {
  const aluQuestion = {
    question_text: 'Identify the primary hardware component responsible for performing arithmetic and logic operations within the CPU.',
    question_type: 'mcq',
    topic: 'Input Devices',
    bloom_level: 'Understanding',
    difficulty: 'Average',
    choices: {
      A: 'Random Access Memory',
      B: 'Hard Disk Drive',
      C: 'Central Processing Unit',
      D: 'Read-Only Memory'
    },
    correct_answer: 'C'
  };

  it('rejects a reworded duplicate that asks for the same concept and answer with reordered choices', () => {
    const tracker = new ExamDeduplicationTracker();
    tracker.register(aluQuestion);

    const duplicate = {
      ...aluQuestion,
      question_text:
        'Identify the primary hardware component responsible for performing arithmetic and logic operations while coordinating the movement of data between other system resources.',
      choices: {
        A: 'Central Processing Unit',
        B: 'Random Access Memory',
        C: 'Hard Disk Drive',
        D: 'Read-Only Memory'
      },
      correct_answer: 'A'
    };

    const result = tracker.check(duplicate);

    expect(result.duplicate).toBe(true);
  });

  it('rejects an identical stem regardless of capitalization, punctuation, or whitespace', () => {
    const tracker = new ExamDeduplicationTracker();
    tracker.register(aluQuestion);

    const result = tracker.check({
      ...aluQuestion,
      question_text:
        'IDENTIFY the primary hardware component responsible for performing arithmetic and logic operations within the CPU!!'
    });

    expect(result.duplicate).toBe(true);
  });

  it('allows a different question in the same topic that tests a different concept', () => {
    const tracker = new ExamDeduplicationTracker();
    tracker.register(aluQuestion);

    const different = {
      ...aluQuestion,
      question_text: 'Which storage component holds the data and instructions the CPU is actively processing?',
      choices: {
        A: 'Random Access Memory',
        B: 'Hard Disk Drive',
        C: 'Solid State Drive',
        D: 'Optical Disc'
      },
      correct_answer: 'A'
    };

    const result = tracker.check(different);

    expect(result.duplicate).toBe(false);
  });

  it('accumulates stems across the exam so later slots are compared against all earlier ones', () => {
    const tracker = new ExamDeduplicationTracker();
    tracker.register(aluQuestion);
    expect(tracker.getAcceptedStems()).toHaveLength(1);

    const different = {
      ...aluQuestion,
      question_text: 'Which storage component holds the data and instructions the CPU is actively processing?',
      correct_answer: 'A'
    };
    expect(tracker.check(different).duplicate).toBe(false);
    tracker.register(different);
    expect(tracker.getAcceptedStems()).toHaveLength(2);
    expect(tracker.acceptedCount).toBe(2);
  });
});
