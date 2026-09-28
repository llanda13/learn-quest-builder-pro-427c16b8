import { supabase } from '@/integrations/supabase/client';

export type OfficerStatus = 'active' | 'inactive';
export interface DepartmentOfficer {
  id: string;
  department: string;
  course: string;
  chairperson: string;
  dean: string;
  status: OfficerStatus;
}

const norm = (s?: string | null) => (s ?? '').trim().toLowerCase();

export type OfficerResolution =
  | { ok: true; chairperson: string; dean: string }
  | { ok: false; reason: 'no_department' | 'no_course' | 'no_match'; message: string };

export const NO_MATCH_MESSAGE =
  'No active Chairperson and Dean assignment was found for your department and course. Please contact the Administrator.';

/** Strict Department + Course lookup. No department-only or cross-course fallback. */
export async function resolveOfficers(department?: string | null, course?: string | null): Promise<OfficerResolution> {
  if (!norm(department)) {
    return { ok: false, reason: 'no_department', message: 'Your Department/College is not set in your profile. Please update it in Settings.' };
  }
  if (!norm(course)) {
    return { ok: false, reason: 'no_course', message: 'Your Course is not assigned yet. Please set your Course in Settings (or ask the Administrator) so your Chairperson and Dean can be identified.' };
  }
  const { data, error } = await (supabase as any)
    .from('department_officers')
    .select('department, course, chairperson, dean, status')
    .eq('status', 'active');
  if (error) throw error;
  const match = (data ?? []).find(
    (r: any) => norm(r.department) === norm(department) && norm(r.course) === norm(course),
  );
  if (!match) return { ok: false, reason: 'no_match', message: NO_MATCH_MESSAGE };
  return { ok: true, chairperson: match.chairperson ?? '', dean: match.dean ?? '' };
}
