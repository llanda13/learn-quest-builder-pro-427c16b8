import { describe, expect, it } from 'vitest';
import { buildExamRenderModel } from '../useExamRenderModel';

const mcqItem = (number: number) => ({
  question_text: `MCQ stem ${number}`,
  question_type: 'mcq',
  choices: { A: 'Option A', B: 'Option B', C: 'Option C', D: 'Option D' },
  correct_answer: 'A',
  points: 1,
  question_number: number,
  section_id: 'A',
  section_label: 'Section A',
  section_title: 'Multiple Choice'
});

describe('buildExamRenderModel', () => {
  it('renders a single MCQ section for a Format 1 exam with stored section metadata', () => {
    const items = Array.from({ length: 3 }, (_, i) => mcqItem(i + 1));
    const model = buildExamRenderModel({ title: 'Final Exam', items });

    expect(model.sections).toHaveLength(1);
    expect(model.sections[0].kind).toBe('mcq');
    expect(model.sections[0].title).toBe('MULTIPLE CHOICE');
    expect(model.sections[0].items.map((i) => i.number)).toEqual([1, 2, 3]);
    expect(model.answerKey.map((a) => a.number)).toEqual([1, 2, 3]);
  });

  it('does not invent an essay section when every stored item is an MCQ', () => {
    const items = Array.from({ length: 2 }, (_, i) => mcqItem(i + 1));
    const model = buildExamRenderModel({ items });

    expect(model.sections.some((s) => s.kind === 'essay')).toBe(false);
  });

  it('keeps separate stored sections with continuous numbering', () => {
    const items = [
      mcqItem(1),
      mcqItem(2),
      {
        question_text: 'Essay prompt',
        question_type: 'essay',
        correct_answer: 'Rubric',
        points: 5,
        question_number: 3,
        section_id: 'B',
        section_label: 'Section B',
        section_title: 'Essay'
      }
    ];
    const model = buildExamRenderModel({ items });

    expect(model.sections.map((s) => s.kind)).toEqual(['mcq', 'essay']);
    expect(model.sections[1].title).toBe('ESSAY');
    expect(model.sections.flatMap((s) => s.items.map((i) => i.number))).toEqual([1, 2, 3]);
  });

  it('falls back to type-based grouping for legacy tests without section metadata', () => {
    const items = [
      { question_text: 'MCQ stem', question_type: 'mcq', choices: { A: 'a', B: 'b' }, correct_answer: 'A', points: 1 },
      { question_text: 'Essay prompt', question_type: 'essay', correct_answer: 'Rubric', points: 5 }
    ];
    const model = buildExamRenderModel({ items });

    expect(model.sections.map((s) => s.kind)).toEqual(['mcq', 'essay']);
    expect(model.sections.flatMap((s) => s.items.map((i) => i.number))).toEqual([1, 2]);
  });
});
