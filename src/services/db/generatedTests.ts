import { supabase } from "@/integrations/supabase/client";
import { recordExamUsage } from "@/services/rotation/rotationEngine";
import { shuffleExamChoices } from "@/utils/shuffleExamChoices";
import { computeTestContentHash } from "@/utils/testContentHash";

/**
 * Apply Fisher-Yates choice randomization + answer-key recalculation as the
 * final compilation step before persistence. Guarantees Preview / Print /
 * PDF / Stored records share identical shuffled choices and answer keys.
 */
function applyChoiceRandomization<T extends { items: any; answer_key?: any }>(
  payload: T,
): T {
  if (!Array.isArray(payload?.items) || payload.items.length === 0) return payload;
  const { items, answerKey, distribution, reshuffleAttempts } = shuffleExamChoices(
    payload.items,
  );
  // Merge recomputed MCQ letters into the existing answer key while preserving
  // its original shape (array for legacy generated_tests rows, map for versioned tests).
  const existing = Array.isArray(payload.answer_key)
    ? payload.answer_key.map((entry: any, index: number) => ({
        ...entry,
        correct_answer: answerKey[String(index + 1)] ?? entry?.correct_answer,
      }))
    : payload.answer_key && typeof payload.answer_key === "object"
      ? { ...(payload.answer_key as Record<string, any>) }
      : {};
  if (!Array.isArray(existing)) {
    for (const [num, letter] of Object.entries(answerKey)) {
      const current = existing[num];
      existing[num] = current && typeof current === "object"
        ? { ...current, correct_answer: letter }
        : letter;
    }
  }
  console.info(
    `[exam-security] choice randomization applied (n=${items.length}, attempts=${reshuffleAttempts}, dist=${JSON.stringify(distribution)})`,
  );
  const contentHash = computeTestContentHash(items, existing);
  return { ...payload, items, answer_key: existing, content_hash: contentHash } as any;
}

export interface GeneratedTest {
  id: string;
  title: string;
  subject: string;
  course?: string;
  year_section?: string;
  exam_period?: string;
  school_year?: string;
  semester?: string;
  term?: string;
  exam_type?: string;
  instructions?: string;
  tos_id?: string;
  time_limit?: number;
  points_per_question?: number;
  items: any;
  answer_key: any;
  shuffle_questions?: boolean;
  shuffle_choices?: boolean;
  version_label?: string;
  version_number?: number;
  created_by?: string;
  created_at?: string;
}

/** Extract question UUIDs from a saved test's items array. */
function extractQuestionIds(items: any): string[] {
  if (!Array.isArray(items)) return [];
  return items
    .map((it: any) => it?.question_id || it?.id)
    .filter((v: any): v is string =>
      typeof v === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
    );
}

async function logRotationUsage(row: any) {
  try {
    const ids = extractQuestionIds(row?.items);
    if (!ids.length) return;
    await recordExamUsage(
      row.id,
      ids,
      {
        school_year: row.school_year,
        semester: row.semester,
        term: row.term,
        exam_type: row.exam_type,
        exam_period: row.exam_period,
      },
      row.tos_id ?? null
    );
  } catch (err) {
    console.warn("[generatedTests] rotation usage log failed:", err);
  }
}

export const GeneratedTests = {
  async create(payload: Omit<GeneratedTest, 'id' | 'created_at'>) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    const secured = applyChoiceRandomization(payload);
    const testData = {
      title: secured.title,
      subject: secured.subject,
      course: secured.course,
      year_section: secured.year_section,
      exam_period: secured.exam_period,
      school_year: secured.school_year,
      semester: secured.semester,
      term: secured.term,
      exam_type: secured.exam_type,
      instructions: secured.instructions,
      tos_id: secured.tos_id,
      time_limit: secured.time_limit,
      points_per_question: secured.points_per_question,
      items: secured.items,
      answer_key: secured.answer_key,
      shuffle_questions: secured.shuffle_questions,
      shuffle_choices: secured.shuffle_choices,
      version_label: secured.version_label,
      created_by: user.id,
      content_hash: (secured as any).content_hash,
      validation_status: 'pending_validation',
    };

    const { data, error } = await supabase
      .from("generated_tests")
      .insert(testData as any)
      .select()
      .single();

    if (error) throw error;
    void logRotationUsage(data);
    return data;
  },

  async createVersion(payload: Omit<GeneratedTest, 'id' | 'created_at'>) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    const secured = applyChoiceRandomization(payload);
    const testData = {
      title: secured.title,
      subject: secured.subject,
      course: secured.course,
      year_section: secured.year_section,
      exam_period: secured.exam_period,
      school_year: secured.school_year,
      semester: secured.semester,
      term: secured.term,
      exam_type: secured.exam_type,
      instructions: secured.instructions,
      tos_id: secured.tos_id,
      time_limit: secured.time_limit,
      points_per_question: secured.points_per_question,
      items: secured.items,
      answer_key: secured.answer_key,
      shuffle_questions: secured.shuffle_questions,
      shuffle_choices: secured.shuffle_choices,
      version_label: secured.version_label,
      created_by: user.id,
      content_hash: (secured as any).content_hash,
      validation_status: 'pending_validation',
    };

    const { data, error } = await supabase
      .from("generated_tests")
      .insert(testData as any)
      .select()
      .single();

    if (error) throw error;
    void logRotationUsage(data);
    return data;
  },

  async createMultipleVersions(configs: Omit<GeneratedTest, 'id' | 'created_at'>[]) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    const testDataArray = configs.map(config => {
      const secured = applyChoiceRandomization(config);
      return {
        title: secured.title,
        subject: secured.subject,
        course: secured.course,
        year_section: secured.year_section,
        exam_period: secured.exam_period,
        school_year: secured.school_year,
        semester: secured.semester,
        term: secured.term,
        exam_type: secured.exam_type,
        instructions: secured.instructions,
        tos_id: secured.tos_id,
        time_limit: secured.time_limit,
        points_per_question: secured.points_per_question,
        items: secured.items,
        answer_key: secured.answer_key,
        shuffle_questions: secured.shuffle_questions,
        shuffle_choices: secured.shuffle_choices,
        version_label: secured.version_label,
        version_number: secured.version_number,
        created_by: user.id,
        content_hash: (secured as any).content_hash,
        validation_status: 'pending_validation',
      };
    });

    const { data, error } = await supabase
      .from("generated_tests")
      .insert(testDataArray as any)
      .select();

    if (error) throw error;
    if (Array.isArray(data)) for (const row of data) void logRotationUsage(row);
    return data;
  },

  async getById(id: string) {
    const { data, error } = await supabase
      .from("generated_tests")
      .select("*")
      .eq("id", id)
      .single();
    
    if (error) throw error;
    return data;
  },

  async list() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];
    
    const { data, error } = await supabase
      .from("generated_tests")
      .select("*")
      .eq("created_by", user.id)
      .order("created_at", { ascending: false });
    
    if (error) throw error;
    return data ?? [];
  },

  async listByBaseTest(title: string, subject: string) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];
    
    const { data, error } = await supabase
      .from("generated_tests")
      .select("*")
      .eq("created_by", user.id)
      .eq("title", title)
      .eq("subject", subject)
      .order("version_number", { ascending: true });
    
    if (error) throw error;
    return data ?? [];
  },

  async update(id: string, patch: Partial<GeneratedTest>) {
    const { data, error } = await supabase
      .from("generated_tests")
      .update(patch)
      .eq("id", id)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },

  async delete(id: string) {
    const { error } = await supabase
      .from("generated_tests")
      .delete()
      .eq("id", id);
    
    if (error) throw error;
  }
};