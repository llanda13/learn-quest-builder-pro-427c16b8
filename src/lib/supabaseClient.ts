// Enhanced Supabase client with typed operations
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { normalizeKnowledgeDimension } from "@/types/knowledge";
import {
  assertSubjectAssignmentUnchanged,
  mergeQuestionMetadata,
  withCanonicalQuestionSubject,
} from "@/services/db/questionSubjectMetadata";
import type { Json } from "@/integrations/supabase/types";

export interface Question {
  id?: string;
  topic: string;
  question_text: string;
  question_type: string;
  choices?: any;
  correct_answer: string;
  bloom_level: string;
  difficulty: string;
  knowledge_dimension: string;
  category?: string;
  specialization?: string;
  subject?: string;
  subject_code?: string;
  subject_description?: string;
  metadata?: Json;
  created_by: string;
  approved: boolean;
  confidence_score?: number;
  used_history?: any;
  owner?: string;
  created_at?: string;
  updated_at?: string;
}

export interface TOSEntry {
  id?: string;
  title: string;
  subject_no: string;
  course: string;
  description: string;
  year_section: string;
  exam_period: string;
  school_year: string;
  prepared_by: string;
  noted_by: string;
  total_items: number;
  topics?: any;
  distribution?: any;
  matrix?: any;
  owner?: string;
  created_at?: string;
  updated_at?: string;
}

export interface TestVersion {
  id: string;
  questions: Question[];
  answer_key: Record<number, string>;
  version_label: string;
}

export interface GeneratedTest {
  id?: string;
  tos_id: string;
  title?: string;
  versions?: any;
  version_count?: number;
  created_by?: string;
  created_at?: string;
  items?: any;
  answer_key?: any;
}

// Question operations
export async function saveQuestion(question: Omit<Question, 'id' | 'owner' | 'created_at' | 'updated_at'>): Promise<Question> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('User not authenticated');

  const questionData = {
    ...question,
    knowledge_dimension: normalizeKnowledgeDimension(question.knowledge_dimension),
    owner: user.id,
    approved: false
  };
  const canonicalQuestion = await withCanonicalQuestionSubject(questionData);

  const { data, error } = await supabase
    .from('questions')
    .insert(canonicalQuestion)
    .select('*')
    .single();

  if (error) throw error;
  return data as Question;
}

export async function updateQuestion(id: string, updates: Partial<Question>): Promise<Question> {
  const subjectFieldsUpdated = ["category", "specialization", "subject", "subject_code", "subject_description"]
    .some(field => Object.prototype.hasOwnProperty.call(updates, field));
  const metadataUpdated = Object.prototype.hasOwnProperty.call(updates, "metadata");
  let questionUpdates = updates;
  if (Object.prototype.hasOwnProperty.call(updates, "knowledge_dimension")) {
    questionUpdates = {
      ...updates,
      knowledge_dimension: normalizeKnowledgeDimension(updates.knowledge_dimension),
    };
  }
  if (subjectFieldsUpdated || metadataUpdated) {
    const { data: current, error: currentError } = await supabase
      .from("questions")
      .select("category, specialization, subject, subject_code, subject_description, metadata")
      .eq("id", id)
      .single();
    if (currentError) throw currentError;
    assertSubjectAssignmentUnchanged(current, updates);
    questionUpdates = await withCanonicalQuestionSubject({
      ...current,
      ...questionUpdates,
      metadata: mergeQuestionMetadata(current.metadata, updates.metadata),
    });
    assertSubjectAssignmentUnchanged(current, questionUpdates);
  }
  const { data, error } = await supabase
    .from('questions')
    .update(questionUpdates)
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw error;
  return data as Question;
}

export async function deleteQuestion(id: string): Promise<void> {
  const { error } = await supabase
    .from('questions')
    .update({ deleted: true, updated_at: new Date().toISOString() } as any)
    .eq('id', id);

  if (error) throw error;
}

export async function getQuestions(filters?: {
  topic?: string;
  bloom_level?: string;
  difficulty?: string;
  approved?: boolean;
}): Promise<Question[]> {
  let query = supabase.from('questions').select('*').eq('deleted', false);

  if (filters?.topic) {
    query = query.eq('topic', filters.topic);
  }
  if (filters?.bloom_level) {
    query = query.eq('bloom_level', filters.bloom_level);
  }
  if (filters?.difficulty) {
    query = query.eq('difficulty', filters.difficulty);
  }
  if (filters?.approved !== undefined) {
    query = query.eq('approved', filters.approved);
  }

  const { data, error } = await query.order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []) as Question[];
}

// TOS operations
export async function saveTOS(tos: Omit<TOSEntry, 'id' | 'owner' | 'created_at' | 'updated_at'>): Promise<TOSEntry> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('User not authenticated');

  const tosData = {
    ...tos,
    owner: user.id
  };

  const { data, error } = await supabase
    .from('tos_entries')
    .insert(tosData)
    .select('*')
    .single();

  if (error) throw error;
  return data as TOSEntry;
}

export async function updateTOS(id: string, updates: Partial<TOSEntry>): Promise<TOSEntry> {
  const { data, error } = await supabase
    .from('tos_entries')
    .update(updates)
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw error;
  return data as TOSEntry;
}

export async function getTOSEntries(): Promise<TOSEntry[]> {
  const { data, error } = await supabase
    .from('tos_entries')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []) as TOSEntry[];
}

// Test generation operations
export async function saveGeneratedTest(test: {
  tos_id: string;
  title?: string;
  versions?: any;
  version_count?: number;
  items?: any;
  answer_key?: any;
}): Promise<GeneratedTest> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('User not authenticated');

  const testData = {
    tos_id: test.tos_id,
    title: test.title || 'Generated Test',
    subject: 'General',
    instructions: 'Read each question carefully and select the best answer.',
    items: test.items || test.versions || [],
    answer_key: test.answer_key || {},
    created_by: user.id // Add UUID
  };

  const { data, error } = await supabase
    .from('generated_tests')
    .insert(testData)
    .select('*')
    .single();

  if (error) throw error;
  return data as GeneratedTest;
}

export async function getGeneratedTests(): Promise<GeneratedTest[]> {
  const { data, error } = await supabase
    .from('generated_tests')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []) as GeneratedTest[];
}

// User profile operations
export async function getUserProfile() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  // Fetch profile
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (profileError && profileError.code !== 'PGRST116') throw profileError;

  // Fetch role from user_roles table
  const { data: roleData } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .order('role', { ascending: true })
    .limit(1)
    .single();

  return {
    ...profile,
    role: roleData?.role || 'teacher'
  };
}

export async function updateUserProfile(updates: { full_name?: string }) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('User not authenticated');

  const { data, error } = await supabase
    .from('profiles')
    .update({ full_name: updates.full_name })
    .eq('id', user.id)
    .select('*')
    .single();

  if (error) throw error;
  return data;
}

// Analytics operations
export async function getQuestionStats() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase.rpc('get_user_question_stats', {
    user_uuid: user.id
  });

  if (error) throw error;
  return data || [];
}

// Bulk operations
export async function bulkInsertQuestions(questions: Array<Omit<Question, 'id' | 'owner' | 'created_at' | 'updated_at'>>): Promise<Question[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('User not authenticated');

  const questionsData = questions.map(q => ({
    ...q,
    knowledge_dimension: normalizeKnowledgeDimension(q.knowledge_dimension),
    owner: user.id,
    approved: false
  }));
  const canonicalQuestions = await Promise.all(questionsData.map(withCanonicalQuestionSubject));

  const { data, error } = await supabase
    .from('questions')
    .insert(canonicalQuestions)
    .select('*');

  if (error) throw error;
  return (data || []) as Question[];
}

// Approval operations (admin only)
export async function approveQuestion(id: string, approved: boolean): Promise<Question> {
  const { data, error } = await supabase
    .from('questions')
    .update({ approved })
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw error;
  return data as Question;
}

export { supabase };