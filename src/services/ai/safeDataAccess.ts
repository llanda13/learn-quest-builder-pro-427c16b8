/**
 * Safe Data Access Layer
 * 
 * Provides read-only access to aggregated statistics
 * Returns only non-sensitive, aggregated data
 */

import { supabase } from '@/integrations/supabase/client';

interface QuestionTypeRecord extends Record<string, unknown> {
  question_type: string | null;
}

interface BloomLevelRecord extends Record<string, unknown> {
  bloom_level: string | null;
}

interface DifficultyRecord extends Record<string, unknown> {
  difficulty: string | null;
}

interface SubjectRecord extends Record<string, unknown> {
  subject: string | null;
}

interface RecentActivityRecord extends Record<string, unknown> {
  created_at: string;
  question_type: string | null;
  bloom_level: string | null;
}

export interface AggregatedStatistics {
  totalQuestions: number;
  questionsByType: Record<string, number>;
  questionsByBloomLevel: Record<string, number>;
  questionsByDifficulty: Record<string, number>;
  questionsBySubject: Record<string, number>;
  approvedQuestions: number;
  pendingQuestions: number;
  averageQuestionDifficulty: string;
}

export interface RecentActivitySummary {
  period: string;
  totalAdded: number;
  byType: Record<string, number>;
  byBloomLevel: Record<string, number>;
}

/**
 * Get aggregated question statistics (read-only)
 */
export async function getQuestionStatistics(): Promise<AggregatedStatistics | null> {
  try {
    // Get total question count
    const { count: totalCount, error: countError } = await supabase
      .from('questions')
      .select('*', { count: 'exact', head: true });

    if (countError) throw countError;

    // Get questions by type
    const { data: byType } = await supabase
      .from('questions')
      .select('question_type')
      .order('question_type');

    // Get questions by Bloom level
    const { data: byBloom } = await supabase
      .from('questions')
      .select('bloom_level')
      .order('bloom_level');

    // Get questions by difficulty
    const { data: byDifficulty } = await supabase
      .from('questions')
      .select('difficulty')
      .order('difficulty');

    // Get questions by subject  
    const { data: bySubject } = await supabase
      .from('questions')
      .select('subject')
      .order('subject');

    // Get approval statistics
    const { count: approvedCount } = await supabase
      .from('questions')
      .select('*', { count: 'exact', head: true })
      .eq('approved', true);

    const { count: pendingCount } = await supabase
      .from('questions')
      .select('*', { count: 'exact', head: true })
      .eq('approved', false);

    // Aggregate counts
    const aggregateByField = <T extends Record<string, unknown>>(
      data: T[] | null, 
      field: keyof T
    ): Record<string, number> => {
      if (!data) return {};
      return data.reduce((acc, item) => {
        const key = String(item[field] || 'Unknown');
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
    };

    const stats: AggregatedStatistics = {
      totalQuestions: totalCount || 0,
      questionsByType: aggregateByField(byType, 'question_type'),
      questionsByBloomLevel: aggregateByField(byBloom, 'bloom_level'),
      questionsByDifficulty: aggregateByField(byDifficulty, 'difficulty'),
      questionsBySubject: aggregateByField(bySubject, 'subject'),
      approvedQuestions: approvedCount || 0,
      pendingQuestions: pendingCount || 0,
      averageQuestionDifficulty: calculateAverageDifficulty(
        aggregateByField(byDifficulty, 'difficulty')
      )
    };

    return stats;
  } catch (error) {
    console.error('Error fetching question statistics:', error);
    return null;
  }
}

/**
 * Get recently added questions summary (non-personal, aggregated data)
 */
export async function getRecentActivitySummary(limitDays: number = 7): Promise<RecentActivitySummary | null> {
  try {
    const daysAgo = new Date();
    daysAgo.setDate(daysAgo.getDate() - limitDays);

    const { data } = await supabase
      .from('questions')
      .select('created_at, question_type, bloom_level')
      .gte('created_at', daysAgo.toISOString())
      .order('created_at', { ascending: false });

    if (!data) return null;

    const byType = data.reduce((acc: Record<string, number>, q: RecentActivityRecord) => {
      const type = String(q.question_type || 'Unknown');
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const byBloomLevel = data.reduce((acc: Record<string, number>, q: RecentActivityRecord) => {
      const level = String(q.bloom_level || 'Unknown');
      acc[level] = (acc[level] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      period: `Last ${limitDays} days`,
      totalAdded: data.length,
      byType,
      byBloomLevel
    };
  } catch (error) {
    console.error('Error fetching recent activity:', error);
    return null;
  }
}

/**
 * Check if requested data is sensitive
 */
export function isSensitiveDataRequest(query: string): boolean {
  const sensitivePatterns = [
    /password|secret|token|credential/i,
    /user.*email|personal.*info/i,
    /private.*key|api.*key/i,
    /auth|permission|access.*control/i
  ];

  return sensitivePatterns.some(pattern => pattern.test(query));
}

/**
 * Helper: Calculate average difficulty
 */
function calculateAverageDifficulty(difficultyMap: Record<string, number>): string {
  const difficultyOrder = ['easy', 'average', 'difficult', 'hard'];
  const weightedSum = difficultyOrder.reduce((sum, level, index) => {
    return sum + ((difficultyMap[level] || 0) * index);
  }, 0);

  const total = Object.values(difficultyMap).reduce((sum, val) => sum + val, 0);
  if (total === 0) return 'unknown';

  const average = weightedSum / total;
  if (average < 1) return 'easy';
  if (average < 2) return 'average';
  return 'difficult';
}
