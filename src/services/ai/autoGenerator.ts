import { supabase } from "@/integrations/supabase/client";
import type { TOSRequirement } from "./intelligentSelector";

export interface GenerationRequest {
  requirement: TOSRequirement;
  teacherId: string;
  tosId: string;
}

export interface GenerationResult {
  success: boolean;
  questionIds: string[];
  error?: string;
}

/**
 * Auto-Generator Service
 * Generates questions using AI when bank lacks coverage
 * All generated questions go to admin approval queue
 */
export class AutoQuestionGenerator {
  
  /**
   * Generate questions for missing TOS requirements
   */
  async generateMissingQuestions(
    requests: GenerationRequest[]
  ): Promise<GenerationResult[]> {
    const results: GenerationResult[] = [];

    for (const request of requests) {
      try {
        const result = await this.generateQuestionsForRequirement(request);
        results.push(result);
      } catch (error) {
        console.error('Error generating questions:', error);
        results.push({
          success: false,
          questionIds: [],
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    return results;
  }

  /**
   * Generate questions for a single TOS requirement
   */
  private async generateQuestionsForRequirement(
    request: GenerationRequest
  ): Promise<GenerationResult> {
    const { requirement, teacherId, tosId } = request;

    // Call the AI generation edge function
    const { data, error } = await supabase.functions.invoke('generate-questions', {
      body: {
        tos_id: tosId,
        request: {
          topic: requirement.topic,
          bloom_level: requirement.bloom_level,
          difficulty: requirement.difficulty,
          count: requirement.count,
        },
        teacher_id: teacherId,
      }
    });

    if (error) {
      throw new Error(`AI generation failed: ${error.message}`);
    }

    if (!data || !data.questions) {
      throw new Error('No questions generated');
    }

    // The edge function persists questions before returning them.
    const insertedQuestions = data.questions as Array<{ id?: string }>;
    if (!insertedQuestions.length || insertedQuestions.some(question => !question.id)) {
      throw new Error('Question generation returned rows without persisted question IDs.');
    }
    const questionIds = insertedQuestions
      .map(question => question.id)
      .filter((id): id is string => Boolean(id));

    // Log the generation
    await this.logGeneration(
      questionIds,
      request
    );

    return {
      success: true,
      questionIds
    };
  }

  /**
   * Log AI generation for audit trail
   */
  private async logGeneration(
    questionIds: string[],
    request: GenerationRequest
  ): Promise<void> {
    const logs = questionIds.map(questionId => ({
      question_id: questionId,
      generation_type: 'auto_fill',
      generated_by: request.teacherId,
      tos_id: request.tosId,
      metadata: {
        requirement: {
          topic: request.requirement.topic,
          bloom_level: request.requirement.bloom_level,
          difficulty: request.requirement.difficulty,
          count: request.requirement.count
        },
        timestamp: new Date().toISOString()
      }
    }));

    await supabase.from('ai_generation_logs').insert(logs);
  }

  /**
   * Get pending questions count for admin
   */
  async getPendingQuestionsCount(): Promise<number> {
    const { count, error } = await supabase
      .from('questions')
      .select('*', { count: 'exact', head: true })
      .eq('created_by', 'ai')
      .eq('status', 'pending')
      .eq('approved', false);

    if (error) {
      console.error('Error fetching pending count:', error);
      return 0;
    }

    return count || 0;
  }
}

export const autoGenerator = new AutoQuestionGenerator();
