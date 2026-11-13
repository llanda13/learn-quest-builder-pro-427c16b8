import { describe, expect, it } from 'vitest';
import { buildExamRenderModel } from '../useExamRenderModel';
import { FORMAT_1, FORMAT_3 } from '@/types/examFormats';

describe('format-aware exam rendering', () => {
  it('renders a 50-item all-MCQ format as one section with a complete matching key', () => {
    const section = FORMAT_1.sections[0];
    const items = Array.from({ length: 50 }, (_, index) => ({
      id: `question-${index + 1}`,
      question_number: index + 1,
      question_text: `Question ${index + 1}`,
      question_type: section.questionType,
      choices: { A: 'Correct', B: 'Wrong one', C: 'Wrong two', D: 'Wrong three' },
      correct_answer: 'A',
      section_id: section.id,
      section_label: section.label,
      section_title: section.title,
      section_instruction: section.instruction
    }));

    const model = buildExamRenderModel({ items });

    expect(model.sections).toHaveLength(1);
    expect(model.sections[0].label).toBe('Section A');
    expect(model.sections[0].title).toBe('Multiple Choice');
    expect(model.sections[0].kind).toBe('mcq');
    expect(model.sections[0].items).toHaveLength(50);
    expect(model.sections.flatMap((entry) => entry.items).map((item) => item.number))
      .toEqual(Array.from({ length: 50 }, (_, index) => index + 1));
    expect(model.answerKey).toHaveLength(50);
    expect(model.answerKey.map((entry) => entry.number))
      .toEqual(Array.from({ length: 50 }, (_, index) => index + 1));
  });

  it('keeps the selected format section order and labels instead of grouping by question type', () => {
    const items = Array.from({ length: 50 }, (_, index) => {
      const questionNumber = index + 1;
      const section = FORMAT_3.sections.find((candidate) =>
        questionNumber >= candidate.startNumber && questionNumber <= candidate.endNumber
      )!;
      return {
        question_number: questionNumber,
        question_text: `Question ${questionNumber}`,
        question_type: section.questionType,
        choices: section.questionType === 'mcq' ? { A: 'Answer', B: 'B', C: 'C', D: 'D' } : undefined,
        correct_answer: section.questionType === 'mcq' ? 'A' : 'True',
        section_id: section.id,
        section_label: section.label,
        section_title: section.title,
        section_instruction: section.instruction
      };
    });

    const model = buildExamRenderModel({ items });

    expect(model.sections.map((section) => section.label)).toEqual(['Section A', 'Section B', 'Section C']);
    expect(model.sections.map((section) => section.kind)).toEqual(['mcq', 'fill_blank', 'true_false']);
    expect(model.sections.map((section) => section.items.length)).toEqual([30, 10, 10]);
    expect(model.sections[1].items[0].number).toBe(31);
    expect(model.sections[2].items[0].number).toBe(41);
    expect(model.answerKey).toHaveLength(50);
    expect(model.answerKey[30].number).toBe(31);
  });
});
