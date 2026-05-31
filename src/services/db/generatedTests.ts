import { supabase } from "@/integrations/supabase/client";

export interface GeneratedTest {
  id: string;
  title: string;
  subject: string;
  course?: string;
  year_section?: string;
  exam_period?: string;
  school_year?: string;
  semester?: string;
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

export const GeneratedTests = {
  async create(payload: Omit<GeneratedTest, 'id' | 'created_at'>) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');
    
    const testData = {
      title: payload.title,
      subject: payload.subject,
      course: payload.course,
      year_section: payload.year_section,
      exam_period: payload.exam_period,
      school_year: payload.school_year,
      semester: payload.semester,
      instructions: payload.instructions,
      tos_id: payload.tos_id,
      time_limit: payload.time_limit,
      points_per_question: payload.points_per_question,
      items: payload.items,
      answer_key: payload.answer_key,
      shuffle_questions: payload.shuffle_questions,
      shuffle_choices: payload.shuffle_choices,
      version_label: payload.version_label,
      version_number: payload.version_number,
      created_by: user.id // Use UUID
    };
    
    const { data, error } = await supabase
      .from("generated_tests")
      .insert(testData)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },

  async createVersion(payload: Omit<GeneratedTest, 'id' | 'created_at'>) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');
    
    const testData = {
      title: payload.title,
      subject: payload.subject,
      course: payload.course,
      year_section: payload.year_section,
      exam_period: payload.exam_period,
      school_year: payload.school_year,
      semester: payload.semester,
      instructions: payload.instructions,
      tos_id: payload.tos_id,
      time_limit: payload.time_limit,
      points_per_question: payload.points_per_question,
      items: payload.items,
      answer_key: payload.answer_key,
      shuffle_questions: payload.shuffle_questions,
      shuffle_choices: payload.shuffle_choices,
      version_label: payload.version_label,
      version_number: payload.version_number,
      created_by: user.id // Use UUID
    };
    
    const { data, error } = await supabase
      .from("generated_tests")
      .insert(testData)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },

  async createMultipleVersions(configs: Omit<GeneratedTest, 'id' | 'created_at'>[]) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');
    
    const testDataArray = configs.map(config => ({
      title: config.title,
      subject: config.subject,
      course: config.course,
      year_section: config.year_section,
      exam_period: config.exam_period,
      school_year: config.school_year,
      semester: config.semester,
      instructions: config.instructions,
      tos_id: config.tos_id,
      time_limit: config.time_limit,
      points_per_question: config.points_per_question,
      items: config.items,
      answer_key: config.answer_key,
      shuffle_questions: config.shuffle_questions,
      shuffle_choices: config.shuffle_choices,
      version_label: config.version_label,
      version_number: config.version_number,
      created_by: user.id // Use UUID
    }));
    
    const { data, error } = await supabase
      .from("generated_tests")
      .insert(testDataArray)
      .select();
    
    if (error) throw error;
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