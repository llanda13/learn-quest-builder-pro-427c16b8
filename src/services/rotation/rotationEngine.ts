import { supabase } from "@/integrations/supabase/client";
import type { RotationSettings } from "./rotationSettings";

export interface AcademicPeriod {
  school_year?: string | null;
  semester?: string | null;
  term?: string | null;
  exam_type?: string | null;
  exam_period?: string | null;
}

export interface RotationCandidate {
  id: string;
  used_count?: number | null;
  last_used_at?: string | null;
  last_used_school_year?: string | null;
  last_used_semester?: string | null;
  [k: string]: any;
}

/**
 * Compute a rotation weight in [0, 1].
 *  - 0  -> hard-skip (in cooldown or over max reuse cap)
 *  - 1  -> never used (most preferred)
 *  - in between -> older / less-used preferred
 */
export function computeRotationWeight(
  q: RotationCandidate,
  settings: RotationSettings,
  current: AcademicPeriod
): number {
  const used = q.used_count ?? 0;

  if (settings.max_reuse_frequency > 0 && used >= settings.max_reuse_frequency) {
    return 0;
  }

  // Same period or immediately previous period -> cooldown
  if (
    current.school_year &&
    q.last_used_school_year === current.school_year &&
    (!current.semester || !q.last_used_semester ||
      q.last_used_semester === current.semester)
  ) {
    return settings.prefer_unused ? 0 : 0.05;
  }

  if (!q.last_used_at) return 1; // never used

  const ageDays =
    (Date.now() - new Date(q.last_used_at).getTime()) / (1000 * 60 * 60 * 24);
  const ageBoost = Math.min(1, ageDays / 365); // 0..1 across one year
  const usageDecay = 1 / (1 + used);

  return Math.max(0.05, 0.6 * ageBoost + 0.4 * usageDecay);
}

/**
 * Sort candidates by rotation weight (best first). Items with weight 0 are
 * placed at the end, available only as last-resort fallback.
 */
export function applyRotationOrder<T extends RotationCandidate>(
  candidates: T[],
  settings: RotationSettings,
  current: AcademicPeriod
): T[] {
  return [...candidates]
    .map((q) => ({ q, w: computeRotationWeight(q, settings, current) }))
    .sort((a, b) => b.w - a.w)
    .map((x) => x.q);
}

/**
 * Record question usage for an exam. Called from the client after generation
 * (the edge function also calls the same RPC server-side when available).
 */
export async function recordExamUsage(
  testId: string,
  questionIds: string[],
  period: AcademicPeriod,
  tosId?: string | null
): Promise<void> {
  if (!questionIds.length) return;
  const { error } = await (supabase as any).rpc("record_question_usage", {
    p_test_id: testId,
    p_question_ids: questionIds,
    p_school_year: period.school_year ?? null,
    p_semester: period.semester ?? null,
    p_term: period.term ?? null,
    p_exam_type: period.exam_type ?? null,
    p_exam_period: period.exam_period ?? null,
    p_tos_id: tosId ?? null,
  });
  if (error) {
    // Non-fatal — usage logging shouldn't break exam generation.
    console.warn("[rotation] record_question_usage failed:", error.message);
  }
}

export async function fetchAuditReport(filters: {
  school_year?: string;
  semester?: string;
  subject?: string;
}) {
  const { data, error } = await (supabase as any).rpc("rotation_audit_report", {
    p_school_year: filters.school_year ?? null,
    p_semester: filters.semester ?? null,
    p_subject: filters.subject ?? null,
  });
  if (error) throw error;
  return (data || []) as Array<{
    question_id: string;
    topic: string;
    subject: string;
    question_text: string;
    used_count: number;
    last_used_at: string | null;
    last_used_school_year: string | null;
    last_used_semester: string | null;
    distinct_periods: number;
  }>;
}
