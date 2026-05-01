import { supabase } from "@/integrations/supabase/client";

// Profile operations
export const getProfile = async () => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();
    
  if (error) throw error;
  return data;
};

export const updateProfile = async (updates: any) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('No user found');
  
  const { data, error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', user.id)
    .select()
    .single();
    
  if (error) throw error;
  return data;
};

// TOS operations
export const TOS = {
  async create(payload: any) {
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from('tos_entries')
      .insert({ ...payload, owner: user?.id })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async listMine() {
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from('tos_entries')
      .select('*')
      .eq('owner', user?.id)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data ?? [];
  },

  async getById(id: string) {
    const { data, error } = await supabase
      .from('tos_entries')
      .select('*')
      .eq('id', id)
      .single();
    if (error) throw error;
    return data;
  },

  async update(id: string, patch: any) {
    const { data, error } = await supabase
      .from('tos_entries')
      .update(patch)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async delete(id: string) {
    const { error } = await supabase
      .from('tos_entries')
      .delete()
      .eq('id', id);
    if (error) throw error;
  }
};

// Questions operations
export const Questions = {
  async insertMany(rows: any[]) {
    const { data, error } = await supabase
      .from('questions')
      .insert(rows)
      .select();
    if (error) throw error;
    return data ?? [];
  },

  async search(filters: {
    topic?: string;
    bloom_level?: string;
    difficulty?: string;
    approved?: boolean;
    owner?: string;
  }) {
    let query = supabase
      .from('questions')
      .select('*')
      .eq('deleted', false);

    if (filters.topic) query = query.eq('topic', filters.topic);
    if (filters.bloom_level) query = query.eq('bloom_level', filters.bloom_level);
    if (filters.difficulty) query = query.eq('difficulty', filters.difficulty);
    if (filters.approved !== undefined) query = query.eq('approved', filters.approved);
    if (filters.owner) query = query.eq('created_by', filters.owner);

    query = query.order('created_at', { ascending: false });

    const { data, error } = await query;
    if (error) throw error;
    return data ?? [];
  },

  async toggleApproval(id: string, approved: boolean, reason?: string) {
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from('questions')
      .update({ 
        approved, 
        approved_by: user?.id,
        approval_notes: reason 
      })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async delete(id: string) {
    const { error } = await supabase
      .from('questions')
      .update({ deleted: true, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
  },

  async getById(id: string) {
    const { data, error } = await supabase
      .from('questions')
      .select('*')
      .eq('id', id)
      .single();
    if (error) throw error;
    return data;
  },

  async incrementUsage(id: string) {
    const { error } = await supabase
      .from('questions')
      .update({ used_count: 1 })
      .eq('id', id);
    
    if (error) throw error;
  }
};

// Tests operations  
export const Tests = {
  async create(tos_id: string, title: string, params: any) {
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from('generated_tests')
      .insert({ 
        tos_id, 
        title,
        subject: params.subject || 'General',
        instructions: params.instructions || '',
        items: params.items || params.versions || [],
        answer_key: params.answer_key || params.answer_keys || {}
      })
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },

  async addVersion(test_id: string, label: string, question_ids: string[], answer_key: any, payload: any) {
    // Note: test_versions table doesn't exist in current schema, using generated_tests instead
    const { data, error } = await supabase
      .from('generated_tests')
      .insert({ 
        parent_test_id: test_id,
        version_label: label, 
        items: payload.questions || {},
        answer_key, 
        title: payload.title || 'Test Version',
        subject: payload.subject
      })
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },

  async getVersions(test_id: string) {
    const { data, error } = await supabase
      .from('test_versions')
      .select('*')
      .eq('test_metadata_id', test_id)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    return data ?? [];
  },

  async listMine() {
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from('generated_tests')
      .select('*')
      .eq('created_by', user?.id)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    return data ?? [];
  }
};

// Analytics operations
export const Analytics = {
  async bloomCounts() {
    return [];
  },

  async difficultyCounts() {
    return [];
  },

  async activityTimeline() {
    return [];
  },

  async creatorStats() {
    return [];
  },

  async approvalStats() {
    return [];
  },

  async topicCounts() {
    return [];
  }
};

// Activity Log operations
export const ActivityLog = {
  async log(type: string, meta?: any) {
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase
      .from('activity_log')
      .insert({
        action: type,
        entity_type: 'general',
        user_id: user?.id,
        meta: meta || {}
      });
    if (error) console.error('Activity log error:', error);
  }
};

// Bulk Import operations
export const BulkImports = {
  async create(filename: string, summary: any) {
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from('activity_log')
      .insert({
        action: 'bulk_import',
        entity_type: 'questions',
        user_id: user?.id,
        meta: { filename, summary }
      })
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },

  async updateStatus(id: string, status: string, summary?: any) {
    const { data, error } = await supabase
      .from('activity_log')
      .update({ 
        meta: { status, summary }
      })
      .eq('id', id)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }
};