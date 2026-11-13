import type { Json } from "@/integrations/supabase/types";
import {
  resolveSubjectMetadata,
  type SubjectMetadataContext,
} from "@/services/ai/subjectMetadataResolver";

type QuestionSubjectInput = SubjectMetadataContext & {
  metadata?: Json | null;
};

function isJsonObject(value: Json | null | undefined): value is { [key: string]: Json | undefined } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function assertSubjectAssignmentUnchanged(
  current: object,
  updates: object
): void {
  const subjectFields = ["category", "specialization", "subject", "subject_code", "subject_description"];
  const changedField = subjectFields.find((field) =>
    Object.prototype.hasOwnProperty.call(updates, field)
    && (Reflect.get(updates, field) || "") !== (Reflect.get(current, field) || "")
  );
  const currentMetadata = Reflect.get(current, "metadata");
  const updatedMetadata = Reflect.get(updates, "metadata");
  const currentId = isJsonObject(currentMetadata) ? currentMetadata.academic_subject_id : undefined;
  const updatedId = isJsonObject(updatedMetadata) ? updatedMetadata.academic_subject_id : undefined;
  if (changedField || (currentId !== undefined && updatedId !== undefined && updatedId !== currentId)) {
    throw new Error("Subject assignment cannot be changed through ordinary question editing. Use a separately reviewed subject correction process.");
  }
}

export function mergeQuestionMetadata(
  current: Json | null | undefined,
  updates: Json | null | undefined
): Json {
  if (isJsonObject(current) && isJsonObject(updates)) {
    return { ...current, ...updates };
  }
  return updates ?? current ?? {};
}

export async function withCanonicalQuestionSubject<T extends QuestionSubjectInput>(
  question: T
): Promise<T & {
  category: string;
  specialization: string;
  subject: string;
  subject_code: string;
  subject_description: string;
  metadata: Json;
}> {
  const metadataSubjectId = isJsonObject(question.metadata)
    && typeof question.metadata.academic_subject_id === "string"
    ? question.metadata.academic_subject_id
    : undefined;
  const subject = await resolveSubjectMetadata({
    ...question,
    academic_subject_id: question.academic_subject_id || metadataSubjectId,
  });
  return {
    ...question,
    category: subject.category,
    specialization: subject.specialization,
    subject: `${subject.subject_code} - ${subject.subject_description}`,
    subject_code: subject.subject_code,
    subject_description: subject.subject_description,
    metadata: {
      ...(isJsonObject(question.metadata) ? question.metadata : {}),
      academic_subject_id: subject.academic_subject_id,
    },
  };
}
