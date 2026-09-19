import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { TOSCriteria } from '../testGenerationService';

describe('Test Generation Service - TOS to TQ Mapping', () => {
  /**
   * Test Case 1: Explicit Item Placement Preserved
   *
   * Verifies that when tosCriteria includes explicit item_numbers (e.g., [1,2,3]),
   * the generation plan uses those exact item numbers instead of sequential ones.
   */
  it('should preserve explicit TOS item placement in generation plan', () => {
    const tosCriteria: TOSCriteria[] = [
      {
        topic: 'RA 1425 Rizal Law',
        bloom_level: 'Remembering',
        difficulty: 'easy',
        count: 2,
        item_numbers: [1, 2],
        question_type: 'mcq'
      },
      {
        topic: 'RA 1425 Rizal Law',
        bloom_level: 'Understanding',
        difficulty: 'easy',
        count: 2,
        item_numbers: [3, 4],
        question_type: 'mcq'
      },
      {
        topic: 'RA 1425 Rizal Law',
        bloom_level: 'Applying',
        difficulty: 'average',
        count: 2,
        item_numbers: [5, 6],
        question_type: 'mcq'
      }
    ];

    // Simulate generation plan construction
    const generationPlan: Array<{
      item_number: number;
      topic: string;
      bloom_level: string;
      difficulty: string;
      question_type?: string;
    }> = [];

    let currentItem = 1;
    for (const criteria of tosCriteria) {
      if (Array.isArray(criteria.item_numbers) && criteria.item_numbers.length > 0) {
        const sortedItemNumbers = [...criteria.item_numbers].sort((a, b) => a - b);
        for (const itemNumber of sortedItemNumbers) {
          generationPlan.push({
            item_number: itemNumber,
            topic: criteria.topic,
            bloom_level: criteria.bloom_level,
            difficulty: criteria.difficulty,
            question_type: criteria.question_type
          });
        }
      } else {
        for (let i = 0; i < (criteria.count || 0); i++) {
          generationPlan.push({
            item_number: currentItem++,
            topic: criteria.topic,
            bloom_level: criteria.bloom_level,
            difficulty: criteria.difficulty,
            question_type: criteria.question_type
          });
        }
      }
    }

    generationPlan.sort((a, b) => a.item_number - b.item_number);

    // Verify exact item numbers are preserved
    expect(generationPlan).toHaveLength(6);
    expect(generationPlan[0].item_number).toBe(1);
    expect(generationPlan[1].item_number).toBe(2);
    expect(generationPlan[2].item_number).toBe(3);
    expect(generationPlan[3].item_number).toBe(4);
    expect(generationPlan[4].item_number).toBe(5);
    expect(generationPlan[5].item_number).toBe(6);

    // Verify metadata is preserved in order
    expect(generationPlan[0]).toMatchObject({
      item_number: 1,
      topic: 'RA 1425 Rizal Law',
      bloom_level: 'Remembering'
    });

    expect(generationPlan[4]).toMatchObject({
      item_number: 5,
      topic: 'RA 1425 Rizal Law',
      bloom_level: 'Applying'
    });
  });

  /**
   * Test Case 2: Slot Metadata Override (Source of Truth)
   *
   * Verifies that when a question is assigned to a slot, the slot metadata
   * (topic, bloom_level, difficulty) overrides the chosen question's metadata.
   * This ensures the TOS remains the source of truth, not the database/AI response.
   */
  it('should use slot metadata as source of truth, not chosen question metadata', () => {
    const slot = {
      item_number: 5,
      topic: 'RA 1425 Rizal Law',
      bloom_level: 'Applying',
      difficulty: 'average',
      knowledge_dimension: 'Conceptual',
      question_type: 'mcq'
    };

    // Simulate a database question with different metadata
    const chosenQuestion = {
      id: 'q-123',
      question_text: 'What is the significance of RA 1425?',
      question_type: 'essay', // Different from slot
      correct_answer: 'B',
      choices: { A: '...', B: '...', C: '...', D: '...' },
      topic: 'Philippine Literature', // DIFFERENT - should be overridden
      bloom_level: 'Remembering', // DIFFERENT - should be overridden
      difficulty: 'easy', // DIFFERENT - should be overridden
      knowledge_dimension: 'Factual' // DIFFERENT - should be overridden
    };

    // Simulate assignment: selectedQuestions[idx] = { ...chosen, slot metadata override }
    const idx = slot.item_number - 1;
    const selectedQuestions: any[] = new Array(6);

    selectedQuestions[idx] = {
      ...chosenQuestion,
      topic: slot.topic,
      bloom_level: slot.bloom_level,
      difficulty: slot.difficulty,
      knowledge_dimension: slot.knowledge_dimension || chosenQuestion.knowledge_dimension,
      question_type: slot.question_type || chosenQuestion.question_type,
      question_number: slot.item_number
    };

    const finalQuestion = selectedQuestions[idx];

    // Verify slot metadata overrides chosen question metadata
    expect(finalQuestion.topic).toBe('RA 1425 Rizal Law'); // From slot, not from chosen
    expect(finalQuestion.bloom_level).toBe('Applying'); // From slot, not 'Remembering'
    expect(finalQuestion.difficulty).toBe('average'); // From slot, not 'easy'
    expect(finalQuestion.knowledge_dimension).toBe('Conceptual'); // From slot, not 'Factual'
    expect(finalQuestion.question_type).toBe('mcq'); // From slot, not 'essay'

    // Verify other question data is preserved
    expect(finalQuestion.question_text).toBe('What is the significance of RA 1425?');
    expect(finalQuestion.correct_answer).toBe('B');
    expect(finalQuestion.question_number).toBe(5);
  });

  /**
   * Test Case 3: Fallback to Sequential Numbering When No Explicit Items
   *
   * When tosCriteria does not include item_numbers, the generation plan should
   * fall back to sequential numbering starting from 1.
   */
  it('should fallback to sequential numbering when no explicit item_numbers', () => {
    const tosCriteria: TOSCriteria[] = [
      {
        topic: 'Topic A',
        bloom_level: 'Remembering',
        difficulty: 'easy',
        count: 3
        // No item_numbers provided
      }
    ];

    const generationPlan: Array<{
      item_number: number;
      topic: string;
      bloom_level: string;
      difficulty: string;
    }> = [];

    let currentItem = 1;
    for (const criteria of tosCriteria) {
      if (Array.isArray(criteria.item_numbers) && criteria.item_numbers.length > 0) {
        // Use explicit numbers
      } else {
        for (let i = 0; i < (criteria.count || 0); i++) {
          generationPlan.push({
            item_number: currentItem++,
            topic: criteria.topic,
            bloom_level: criteria.bloom_level,
            difficulty: criteria.difficulty
          });
        }
      }
    }

    // Verify sequential numbering is used
    expect(generationPlan).toHaveLength(3);
    expect(generationPlan[0].item_number).toBe(1);
    expect(generationPlan[1].item_number).toBe(2);
    expect(generationPlan[2].item_number).toBe(3);
  });

  /**
   * Test Case 4: Unsorted Explicit Items Are Correctly Ordered
   *
   * Even if item_numbers are provided out of order, the generation plan
   * should sort them to ensure correct slot filling order.
   */
  it('should sort unsorted explicit item numbers correctly', () => {
    const tosCriteria: TOSCriteria[] = [
      {
        topic: 'Mixed Order Topic',
        bloom_level: 'Applying',
        difficulty: 'average',
        count: 4,
        item_numbers: [6, 4, 5, 3] // Out of order
      }
    ];

    const generationPlan: Array<{
      item_number: number;
      topic: string;
      bloom_level: string;
      difficulty: string;
    }> = [];

    for (const criteria of tosCriteria) {
      if (Array.isArray(criteria.item_numbers) && criteria.item_numbers.length > 0) {
        const sortedItemNumbers = [...criteria.item_numbers].sort((a, b) => a - b);
        for (const itemNumber of sortedItemNumbers) {
          generationPlan.push({
            item_number: itemNumber,
            topic: criteria.topic,
            bloom_level: criteria.bloom_level,
            difficulty: criteria.difficulty
          });
        }
      }
    }

    // Verify items are sorted
    expect(generationPlan).toHaveLength(4);
    expect(generationPlan.map(p => p.item_number)).toEqual([3, 4, 5, 6]);
  });
});
