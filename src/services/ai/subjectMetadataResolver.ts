import { AcademicHierarchy } from "@/services/db/academicHierarchy";
import { supabase } from "@/integrations/supabase/client";
import { normalizeCategory, normalizeSpecialization } from "@/utils/acronymNormalizer";

export interface SubjectMetadata {
  academic_subject_id: string;
  category: string;
  specialization: string;
  subject_code: string;
  subject_description: string;
}

export interface SubjectMetadataContext {
  academic_subject_id?: string | null;
  subject?: string | null;
  topic?: string | null;
  subject_code?: string | null;
  subject_description?: string | null;
  category?: string | null;
  specialization?: string | null;
}

export async function resolveTosSubjectMetadata(tosId: string): Promise<SubjectMetadata> {
  const { data, error } = await supabase
    .from("tos_entries")
    .select("subject_no, course, description")
    .eq("id", tosId)
    .single();

  if (error) throw new Error(`Unable to load TOS subject metadata: ${error.message}`);
  if (!data?.subject_no?.trim()) {
    throw new Error(`TOS "${tosId}" has no registered subject code. No questions were saved.`);
  }

  const normalize = (value?: string | null) => normalizeText(value);
  const matchingSubjects = (await AcademicHierarchy.getSubjects()).filter((subject) =>
    normalize(subject.code) === normalize(data.subject_no)
  );
  const officialDescriptions = [normalize(data.course), normalize(data.description)].filter(Boolean);
  const candidates = matchingSubjects.length > 1
    ? matchingSubjects.filter((subject) => officialDescriptions.includes(normalize(subject.description)))
    : matchingSubjects;

  if (candidates.length !== 1) {
    throw new Error(`TOS subject "${data.subject_no}" does not resolve to exactly one registered academic subject. No questions were saved.`);
  }

  const subject = candidates[0];
  return {
    academic_subject_id: subject.id,
    category: subject.category_name || "",
    specialization: subject.specialization_name || "",
    subject_code: subject.code,
    subject_description: subject.description,
  };
}

export async function resolveGeneratedQuestionSubject(
  question: SubjectMetadataContext,
  tosId?: string | null
): Promise<SubjectMetadata> {
  if (!tosId) return resolveSubjectMetadata(question);

  const tosSubject = await resolveTosSubjectMetadata(tosId);
  if (question.academic_subject_id && question.academic_subject_id !== tosSubject.academic_subject_id) {
    throw new Error(`Generated question academic subject ID conflicts with TOS subject "${tosSubject.subject_code}". No question was saved.`);
  }
  const generatedCode = question.subject_code?.trim() || extractCode(question.subject);
  const generatedDescription = question.subject_description?.trim() || extractDescription(question.subject);
  const supplied = [
    ["subject code", generatedCode, tosSubject.subject_code],
    ["subject description", generatedDescription, tosSubject.subject_description],
    ["category", question.category, tosSubject.category],
    ["specialization", question.specialization, tosSubject.specialization],
  ] as const;
  for (const [label, value, canonical] of supplied) {
    if (value?.trim() && normalizeText(value) !== normalizeText(canonical)) {
      throw new Error(`Generated question ${label} conflicts with TOS subject "${tosSubject.subject_code}". No question was saved.`);
    }
  }

  return tosSubject;
}

function extractCode(subject?: string | null): string | undefined {
  const match = subject?.trim().match(/^([A-Za-z][A-Za-z0-9 -]*?\s*\d+|\d+)\s*[-–]/);
  return match?.[1]?.trim();
}

function extractDescription(subject?: string | null): string | undefined {
  return subject?.trim().match(/^[^-–]+?\s*[-–]\s*(.+)$/)?.[1]?.trim();
}

function normalizeText(value?: string | null): string {
  return value?.trim().replace(/\s+/g, " ").toLocaleLowerCase() || "";
}

/**
 * Resolve subject metadata only from an active academic_subjects record.
 * Topic names are deliberately never considered a subject code or description.
 */
export async function resolveSubjectMetadata(
  context: SubjectMetadataContext
): Promise<SubjectMetadata> {
  const subjectCode = context.subject_code?.trim() || extractCode(context.subject);
  const description = context.subject_description?.trim() || extractDescription(context.subject);
  const allSubjects = await AcademicHierarchy.getSubjects();
  let candidates = context.academic_subject_id
    ? allSubjects.filter((candidate) => candidate.id === context.academic_subject_id)
    : [];

  if (context.academic_subject_id && candidates.length !== 1) {
    throw new Error(`Academic subject "${context.academic_subject_id}" is not registered. No question was saved.`);
  }
  if (subjectCode) {
    candidates = candidates.length
      ? candidates.filter((candidate) => normalizeText(candidate.code) === normalizeText(subjectCode))
      : allSubjects.filter((candidate) => normalizeText(candidate.code) === normalizeText(subjectCode));
  } else if (description && candidates.length === 0) {
    candidates = allSubjects.filter((candidate) =>
      normalizeText(candidate.description) === normalizeText(description)
    );
  } else if (!subjectCode && !description && candidates.length === 0) {
    candidates = [];
  }

  if (candidates.length > 1) {
    candidates = candidates.filter((candidate) =>
      (!description || normalizeText(candidate.description) === normalizeText(description))
      && (!context.category || normalizeCategory(candidate.category_name) === normalizeCategory(context.category))
      && (!context.specialization || normalizeSpecialization(candidate.specialization_name) === normalizeSpecialization(context.specialization))
    );
  }
  if (candidates.length > 1) {
    throw new Error(`Subject "${subjectCode || description}" matches multiple academic subjects. Select a specific registered subject.`);
  }

  const resolvedSubject = candidates[0] || null;
  if (!resolvedSubject) {
    const supplied = subjectCode || description || context.subject || context.topic || "unknown";
    throw new Error(`Subject "${supplied}" is not registered in the academic subject list. No question was saved.`);
  }

  if (subjectCode && resolvedSubject.code.trim().toLocaleLowerCase() !== subjectCode.toLocaleLowerCase()) {
    throw new Error(`Resolved subject code "${resolvedSubject.code}" conflicts with supplied code "${subjectCode}".`);
  }
  if (context.academic_subject_id && resolvedSubject.id !== context.academic_subject_id) {
    throw new Error(`Academic subject ID conflicts with subject code "${subjectCode}".`);
  }
  const category = normalizeCategory(context.category);
  const specialization = normalizeSpecialization(context.specialization);
  const officialCategory = normalizeCategory(resolvedSubject.category_name) || resolvedSubject.category_name || "";
  const officialSpecialization = normalizeSpecialization(resolvedSubject.specialization_name) || resolvedSubject.specialization_name || "";

  if (category && category !== officialCategory) {
    throw new Error(`Subject code "${resolvedSubject.code}" belongs to category "${officialCategory}", not "${context.category}".`);
  }
  if (specialization && specialization !== officialSpecialization) {
    throw new Error(`Subject code "${resolvedSubject.code}" belongs to specialization "${officialSpecialization}", not "${context.specialization}".`);
  }
  if (context.subject_description && normalizeText(context.subject_description) !== normalizeText(resolvedSubject.description)) {
    throw new Error(`Subject code "${resolvedSubject.code}" does not match subject description "${context.subject_description}".`);
  }

  return {
    academic_subject_id: resolvedSubject.id,
    category: officialCategory,
    specialization: officialSpecialization,
    subject_code: resolvedSubject.code,
    subject_description: resolvedSubject.description,
  };
}
