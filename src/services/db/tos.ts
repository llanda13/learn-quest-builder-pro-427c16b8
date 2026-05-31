import { supabase } from "@/integrations/supabase/client";

export interface TOSEntry {
  id?: string;
  title: string;
  subject_no: string;
  course: string;
  description: string;
  year_section: string;
  exam_period: string;
  school_year: string;
  semester?: string;
  total_items: number;
  prepared_by: string;
  checked_by?: string;
  noted_by: string;
  created_by?: string;
  owner?: string;
  topics?: any[];
  distribution?: any;
  matrix?: any;
  created_at?: string;
  updated_at?: string;
}

export interface LearningCompetency {
  id?: string;
  tos_id: string;
  topic_name: string;
  hours: number;
  percentage: number;
  remembering_items: number;
  understanding_items: number;
  applying_items: number;
  analyzing_items: number;
  evaluating_items: number;
  creating_items: number;
  total_items: number;
  item_numbers: any;
  created_at?: string;
}

export const TOS = {
  async create(payload: Omit<TOSEntry, 'id' | 'created_at' | 'updated_at'>) {
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError) {
      console.error("❌ Auth error:", authError);
      throw new Error(`Authentication failed: ${authError.message}`);
    }
    
    if (!user) {
      throw new Error("User not authenticated - please log in again");
    }

    console.log("📝 Creating TOS entry for user:", user.id);
    
    // Ensure title is always set
    const title = payload.title || `${payload.subject_no || payload.course} - ${payload.exam_period || 'Examination'}`;
    
    const tosData = {
      ...payload,
      title,
      owner: user.id,        // REQUIRED: UUID for RLS policy
      created_by: user.id    // REQUIRED: UUID for RLS policy
    };
    
    console.log("📦 TOS data to insert:", {
      title: tosData.title,
      course: tosData.course,
      total_items: tosData.total_items,
      owner: tosData.owner,
      created_by: tosData.created_by,
    });
    
    const { data, error } = await supabase
      .from("tos_entries")
      .insert(tosData)
      .select()
      .single();
    
    if (error) {
      console.error("❌ Database insert error:", {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code
      });

      if (error.code === '42501') {
        throw new Error(`Permission denied: RLS blocked the insert. Please ensure you are logged in.`);
      } else if (error.code === '23505') {
        throw new Error(`Duplicate entry: A TOS with this information already exists.`);
      } else if (error.code === '23502') {
        throw new Error(`Missing required field: ${error.message}`);
      }
      
      throw new Error(`Failed to save TOS: ${error.message}`);
    }
    
    if (!data) {
      throw new Error("TOS created but no data returned from database");
    }
    
    console.log("✅ TOS created successfully:", data.id);
    return data;
  },

  async getById(id: string) {
    const { data, error } = await supabase
      .from("tos_entries")
      .select("*")
      .eq("id", id)
      .single();
    
    if (error) throw error;
    return data;
  },

  async list() {
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from("tos_entries")
      .select("*")
      .eq("owner", user?.id)
      .order("created_at", { ascending: false });
    
    if (error) throw error;
    return data ?? [];
  },

  async update(id: string, patch: Partial<TOSEntry>) {
    const { data, error } = await supabase
      .from("tos_entries")
      .update(patch)
      .eq("id", id)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },

  async delete(id: string) {
    const { error } = await supabase
      .from("tos_entries")
      .delete()
      .eq("id", id);
    
    if (error) throw error;
  },

  async createLearningCompetencies(competencies: Omit<LearningCompetency, 'id' | 'created_at'>[]) {
    const { data, error } = await supabase
      .from("learning_competencies")
      .insert(competencies)
      .select();
    
    if (error) throw error;
    return data;
  },

  async getLearningCompetencies(tosId: string) {
    const { data, error } = await supabase
      .from("learning_competencies")
      .select("*")
      .eq("tos_id", tosId)
      .order("created_at", { ascending: false });
    
    if (error) throw error;
    return data ?? [];
  }
};
