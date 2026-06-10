import { supabase } from "@/integrations/supabase/client";

export interface RotationSettings {
  id?: string;
  subject: string | null;
  cooldown_periods: number;
  similarity_threshold: number;
  max_reuse_frequency: number;
  prefer_unused: boolean;
  updated_at?: string;
}

export const DEFAULT_ROTATION_SETTINGS: RotationSettings = {
  subject: null,
  cooldown_periods: 2,
  similarity_threshold: 0.85,
  max_reuse_frequency: 3,
  prefer_unused: true,
};

/**
 * Load the effective rotation settings for a subject.
 * Falls back to the global (subject = null) row, then to in-code defaults.
 */
export async function loadRotationSettings(
  subject?: string | null
): Promise<RotationSettings> {
  const { data, error } = await (supabase as any)
    .from("rotation_settings")
    .select("*");

  if (error || !data) return DEFAULT_ROTATION_SETTINGS;

  const subjectMatch = subject
    ? data.find((r: any) => r.subject && r.subject === subject)
    : null;
  const global = data.find((r: any) => !r.subject);

  return (subjectMatch || global || DEFAULT_ROTATION_SETTINGS) as RotationSettings;
}

export async function listRotationSettings(): Promise<RotationSettings[]> {
  const { data, error } = await (supabase as any)
    .from("rotation_settings")
    .select("*")
    .order("subject", { ascending: true, nullsFirst: true });
  if (error) throw error;
  return (data || []) as RotationSettings[];
}

export async function upsertRotationSettings(
  payload: Omit<RotationSettings, "id" | "updated_at">
): Promise<RotationSettings> {
  const { data: { user } } = await supabase.auth.getUser();
  const row = {
    subject: payload.subject || null,
    cooldown_periods: payload.cooldown_periods,
    similarity_threshold: payload.similarity_threshold,
    max_reuse_frequency: payload.max_reuse_frequency,
    prefer_unused: payload.prefer_unused,
    updated_by: user?.id ?? null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await (supabase as any)
    .from("rotation_settings")
    .upsert(row, { onConflict: "subject" })
    .select()
    .single();
  if (error) throw error;
  return data as RotationSettings;
}

export async function deleteSubjectOverride(subject: string): Promise<void> {
  const { error } = await (supabase as any)
    .from("rotation_settings")
    .delete()
    .eq("subject", subject);
  if (error) throw error;
}
