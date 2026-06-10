import { supabase } from "@/integrations/supabase/client";
import type { Question } from "@/services/db/questions";
import { loadRotationSettings } from "@/services/rotation/rotationSettings";
import {
  applyRotationOrder,
  computeRotationWeight,
  type AcademicPeriod,
} from "@/services/rotation/rotationEngine";

export interface TOSRequirement {
  topic: string;
  bloom_level: string;
  difficulty: string;
  count: number;
}

export interface SelectionResult {
  selectedQuestions: Question[];
  missingRequirements: TOSRequirement[];
  usageTracked: boolean;
}

/**
 * Intelligent Question Selector
 * Selects non-redundant questions from the bank based on TOS requirements
 * Tracks usage to prevent repetition
 */
export class IntelligentQuestionSelector {
  
  /**
   * Select questions matching TOS requirements with redundancy prevention
   */
  async selectQuestions(
    requirements: TOSRequirement[],
    teacherId: string,
    excludeRecentlyUsed: boolean = true,
    recentDays: number = 30
  ): Promise<SelectionResult> {
    const selectedQuestions: Question[] = [];
    const missingRequirements: TOSRequirement[] = [];

    for (const req of requirements) {
      const questions = await this.findMatchingQuestions(
        req,
        teacherId,
        excludeRecentlyUsed,
        recentDays
      );

      if (questions.length >= req.count) {
        // Select the required number of questions
        const selected = this.selectNonRedundant(questions, req.count);
        selectedQuestions.push(...selected);
      } else {
        // Not enough questions - add what we have and mark as missing
        selectedQuestions.push(...questions);
        missingRequirements.push({
          ...req,
          count: req.count - questions.length
        });
      }
    }

    return {
      selectedQuestions,
      missingRequirements,
      usageTracked: true
    };
  }

  /**
   * Find questions matching TOS criteria
   */
  private async findMatchingQuestions(
    requirement: TOSRequirement,
    teacherId: string,
    excludeRecentlyUsed: boolean,
    recentDays: number
  ): Promise<Question[]> {
    let query = supabase
      .from('questions')
      .select('*')
      .ilike('topic', `%${requirement.topic}%`)
      .ilike('bloom_level', requirement.bloom_level)
      .eq('difficulty', requirement.difficulty)
      .eq('deleted', false);

    // Exclude recently used questions if requested
    if (excludeRecentlyUsed) {
      const recentDate = new Date();
      recentDate.setDate(recentDate.getDate() - recentDays);
      
      // Get recently used question IDs for this teacher
      const { data: recentTests } = await supabase
        .from('generated_tests')
        .select('items')
        .gte('created_at', recentDate.toISOString());

      if (recentTests) {
        const usedQuestionIds = new Set<string>();
        recentTests.forEach((test: any) => {
          const items = test.items as any[];
          items.forEach((item: any) => {
            if (item.question_id) {
              usedQuestionIds.add(item.question_id);
            }
          });
        });

        if (usedQuestionIds.size > 0) {
          query = query.not('id', 'in', `(${Array.from(usedQuestionIds).join(',')})`);
        }
      }
    }

    const { data, error } = await query;
    
    if (error) {
      console.error('Error fetching questions:', error);
      return [];
    }

    return data || [];
  }

  /**
   * Select non-redundant questions using semantic similarity + rotation.
   * Applies academic-year cooldown so recently-used questions are deferred.
   */
  async selectNonRedundantWithRotation(
    questions: Question[],
    count: number,
    period: AcademicPeriod,
    subject?: string | null,
    similarityThreshold = 0.7
  ): Promise<Question[]> {
    if (questions.length <= count) return questions;
    const settings = await loadRotationSettings(subject ?? null);

    // Rotation order: never-used → cooled-down → recent (last resort)
    const sorted = applyRotationOrder(questions as any, settings, period) as Question[];

    const selected: Question[] = [];
    for (const candidate of sorted) {
      if (selected.length >= count) break;
      const weight = computeRotationWeight(candidate as any, settings, period);
      // Skip hard-blocked candidates unless we have no other option
      if (weight === 0 && selected.length + (sorted.length - selected.length) > count) {
        continue;
      }
      if (this.isSemanticallySufficient(candidate, selected, similarityThreshold)) {
        selected.push(candidate);
      }
    }

    // Backfill if dedup left us short
    if (selected.length < count) {
      for (const q of sorted) {
        if (selected.length >= count) break;
        if (!selected.includes(q)) selected.push(q);
      }
    }
    return selected;
  }

  /**
   * Backwards-compatible synchronous selector (no rotation context).
   */
  selectNonRedundant(questions: Question[], count: number): Question[] {
    if (questions.length <= count) return questions;
    const sorted = [...questions].sort(
      (a, b) => (a.used_count || 0) - (b.used_count || 0)
    );
    const selected: Question[] = [sorted[0]];
    for (let i = 1; i < sorted.length && selected.length < count; i++) {
      if (this.isSemanticallySufficient(sorted[i], selected)) selected.push(sorted[i]);
    }
    while (selected.length < count && sorted.length > selected.length) {
      const next = sorted.find((q) => !selected.includes(q));
      if (next) selected.push(next); else break;
    }
    return selected;
  }

  /**
   * Check if candidate question is semantically different enough
   * In production, this would use embedding vectors
   */
  private isSemanticallySufficient(
    candidate: Question,
    selected: Question[],
    threshold = 0.7
  ): boolean {
    const candidateText = (candidate.question_text || "").toLowerCase();
    for (const q of selected) {
      const selectedText = (q.question_text || "").toLowerCase();
      const candidateWords = new Set(candidateText.split(/\s+/));
      const selectedWords = new Set(selectedText.split(/\s+/));
      const intersection = new Set(
        [...candidateWords].filter((word) => selectedWords.has(word))
      );
      const similarity =
        intersection.size /
        Math.max(1, Math.min(candidateWords.size, selectedWords.size));
      if (similarity > threshold) return false;
    }
    return true;
  }

  /**
   * Track question usage in a test
   */
  async trackQuestionUsage(questionIds: string[], testId: string): Promise<void> {
    for (const questionId of questionIds) {
      await supabase.rpc('mark_question_used', {
        p_question_id: questionId,
        p_test_id: testId
      });
    }
  }
}

export const intelligentSelector = new IntelligentQuestionSelector();
