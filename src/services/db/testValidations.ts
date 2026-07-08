import { supabase } from "@/integrations/supabase/client";

export type ValidationDecision = "approved" | "revision_requested";
export type ValidationStatus = "pending_validation" | "validated" | "revision_requested";

export interface TestValidation {
  id: string;
  generated_test_id: string;
  validator_id: string;
  percentage_correctness: number;
  decision: ValidationDecision;
  comments: string | null;
  instrument_scores: Record<string, any>;
  reused_from_test_id: string | null;
  created_at: string;
}

export interface PendingTestRow {
  id: string;
  title: string | null;
  subject: string | null;
  course: string | null;
  exam_period: string | null;
  school_year: string | null;
  semester: string | null;
  tos_id: string | null;
  created_at: string;
  created_by: string | null;
  validation_status: ValidationStatus;
  items: any;
  teacher_name?: string | null;
  teacher_email?: string | null;
}

export const TestValidations = {
  async listPending(): Promise<PendingTestRow[]> {
    const { data, error } = await supabase
      .from("generated_tests")
      .select(
        "id, title, subject, course, exam_period, school_year, semester, tos_id, created_at, created_by, validation_status, items",
      )
      .eq("validation_status", "pending_validation")
      .order("created_at", { ascending: false });
    if (error) throw error;

    const rows = (data ?? []) as PendingTestRow[];
    const teacherIds = Array.from(
      new Set(rows.map((r) => r.created_by).filter((v): v is string => !!v)),
    );
    if (teacherIds.length === 0) return rows;

    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .in("id", teacherIds);
    const map = new Map((profiles ?? []).map((p: any) => [p.id, p]));
    return rows.map((r) => {
      const p = r.created_by ? map.get(r.created_by) : null;
      return { ...r, teacher_name: p?.full_name ?? null, teacher_email: p?.email ?? null };
    });
  },

  async listAll(): Promise<PendingTestRow[]> {
    const { data, error } = await supabase
      .from("generated_tests")
      .select(
        "id, title, subject, course, exam_period, school_year, semester, tos_id, created_at, created_by, validation_status, items",
      )
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw error;
    return (data ?? []) as PendingTestRow[];
  },

  async getLatestForTest(generatedTestId: string): Promise<TestValidation | null> {
    const { data, error } = await supabase
      .from("test_validations")
      .select("*")
      .eq("generated_test_id", generatedTestId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return (data as TestValidation | null) ?? null;
  },

  async submit(payload: {
    generated_test_id: string;
    percentage_correctness: number;
    decision: ValidationDecision;
    comments?: string;
    instrument_scores?: Record<string, any>;
  }): Promise<TestValidation> {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    const { data, error } = await supabase
      .from("test_validations")
      .insert({
        generated_test_id: payload.generated_test_id,
        validator_id: user.id,
        percentage_correctness: payload.percentage_correctness,
        decision: payload.decision,
        comments: payload.comments ?? null,
        instrument_scores: payload.instrument_scores ?? {},
      })
      .select()
      .single();
    if (error) throw error;
    return data as TestValidation;
  },
};
