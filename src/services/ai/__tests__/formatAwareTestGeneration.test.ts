import { describe, expect, it } from 'vitest';
import { assignSlotsToSections } from '../formatAwareTestGeneration';

describe('assignSlotsToSections', () => {
  it('preserves a TOS essay slot when it falls into a numbered section that is otherwise mcq', () => {
    const slots = [
      {
        item_number: 7,
        topic: 'Sample Topic',
        bloom_level: 'Analyzing',
        difficulty: 'difficult',
        question_type: 'essay'
      }
    ];

    const sections = [
      {
        id: 'A',
        label: 'Section A',
        title: 'Multiple Choice',
        questionType: 'mcq',
        startNumber: 1,
        endNumber: 10,
        pointsPerQuestion: 1,
        instruction: 'Choose the letter of the best answer.'
      }
    ];

    const assigned = assignSlotsToSections(slots as any, sections as any);

    expect(assigned[0].section_id).toBe('A');
    expect(assigned[0].question_type).toBe('essay');
  });
});
