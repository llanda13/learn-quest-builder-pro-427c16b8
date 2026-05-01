import { supabase } from "@/integrations/supabase/client";

export interface AcademicCategory {
  id: string;
  name: string;
  deleted: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AcademicSpecialization {
  id: string;
  category_id: string;
  name: string;
  deleted: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  category_name?: string;
}

export interface AcademicSubject {
  id: string;
  specialization_id: string;
  code: string;
  description: string;
  deleted: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  specialization_name?: string;
  category_name?: string;
}

export const AcademicHierarchy = {
  // ---- Categories ----
  async getCategories(includeDeleted = false): Promise<AcademicCategory[]> {
    let query = supabase.from("academic_categories").select("*").order("name");
    if (!includeDeleted) query = query.eq("deleted", false);
    const { data, error } = await query;
    if (error) throw error;
    return (data || []) as AcademicCategory[];
  },

  async createCategory(name: string): Promise<AcademicCategory> {
    const { data, error } = await supabase
      .from("academic_categories")
      .insert({ name } as any)
      .select("*")
      .single();
    if (error) throw error;
    return data as AcademicCategory;
  },

  async updateCategory(id: string, name: string): Promise<AcademicCategory> {
    const { data, error } = await supabase
      .from("academic_categories")
      .update({ name, updated_at: new Date().toISOString() } as any)
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw error;
    return data as AcademicCategory;
  },

  async softDeleteCategory(id: string): Promise<void> {
    const now = new Date().toISOString();
    // Soft-delete the category
    await supabase
      .from("academic_categories")
      .update({ deleted: true, deleted_at: now } as any)
      .eq("id", id);
    // Soft-delete child specializations
    const { data: specs } = await supabase
      .from("academic_specializations")
      .select("id")
      .eq("category_id", id)
      .eq("deleted", false);
    if (specs) {
      for (const spec of specs) {
        await this.softDeleteSpecialization(spec.id);
      }
    }
    // Soft-delete questions with this category name
    const { data: cat } = await supabase
      .from("academic_categories")
      .select("name")
      .eq("id", id)
      .single();
    if (cat) {
      await supabase
        .from("questions")
        .update({ deleted: true, updated_at: now } as any)
        .eq("category", (cat as any).name)
        .eq("deleted", false);
    }
  },

  async restoreCategory(id: string): Promise<void> {
    await supabase
      .from("academic_categories")
      .update({ deleted: false, deleted_at: null } as any)
      .eq("id", id);
  },

  async permanentDeleteCategory(id: string): Promise<void> {
    // Delete child specializations first (cascade handles it at DB level)
    const { error } = await supabase
      .from("academic_categories")
      .delete()
      .eq("id", id);
    if (error) throw error;
  },

  // ---- Specializations ----
  async getSpecializations(categoryId?: string, includeDeleted = false): Promise<AcademicSpecialization[]> {
    let query = supabase.from("academic_specializations").select("*, academic_categories(name)").order("name");
    if (!includeDeleted) query = query.eq("deleted", false);
    if (categoryId) query = query.eq("category_id", categoryId);
    const { data, error } = await query;
    if (error) throw error;
    return (data || []).map((s: any) => ({
      ...s,
      category_name: s.academic_categories?.name,
    })) as AcademicSpecialization[];
  },

  async createSpecialization(categoryId: string, name: string): Promise<AcademicSpecialization> {
    const { data, error } = await supabase
      .from("academic_specializations")
      .insert({ category_id: categoryId, name } as any)
      .select("*")
      .single();
    if (error) throw error;
    return data as AcademicSpecialization;
  },

  async updateSpecialization(id: string, name: string): Promise<AcademicSpecialization> {
    const { data, error } = await supabase
      .from("academic_specializations")
      .update({ name, updated_at: new Date().toISOString() } as any)
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw error;
    return data as AcademicSpecialization;
  },

  async softDeleteSpecialization(id: string): Promise<void> {
    const now = new Date().toISOString();
    await supabase
      .from("academic_specializations")
      .update({ deleted: true, deleted_at: now } as any)
      .eq("id", id);
    // Soft-delete child subjects
    await supabase
      .from("academic_subjects")
      .update({ deleted: true, deleted_at: now } as any)
      .eq("specialization_id", id)
      .eq("deleted", false);
    // Soft-delete related questions
    const { data: spec } = await supabase
      .from("academic_specializations")
      .select("name")
      .eq("id", id)
      .single();
    if (spec) {
      await supabase
        .from("questions")
        .update({ deleted: true, updated_at: now } as any)
        .eq("specialization", (spec as any).name)
        .eq("deleted", false);
    }
  },

  async restoreSpecialization(id: string): Promise<void> {
    // Also restore parent category if deleted
    const { data: spec } = await supabase
      .from("academic_specializations")
      .select("category_id")
      .eq("id", id)
      .single();
    if (spec) {
      await supabase
        .from("academic_categories")
        .update({ deleted: false, deleted_at: null } as any)
        .eq("id", (spec as any).category_id)
        .eq("deleted", true);
    }
    await supabase
      .from("academic_specializations")
      .update({ deleted: false, deleted_at: null } as any)
      .eq("id", id);
  },

  async permanentDeleteSpecialization(id: string): Promise<void> {
    const { error } = await supabase
      .from("academic_specializations")
      .delete()
      .eq("id", id);
    if (error) throw error;
  },

  // ---- Subjects ----
  async getSubjects(specializationId?: string, includeDeleted = false): Promise<AcademicSubject[]> {
    let query = supabase
      .from("academic_subjects")
      .select("*, academic_specializations(name, academic_categories(name))")
      .order("code");
    if (!includeDeleted) query = query.eq("deleted", false);
    if (specializationId) query = query.eq("specialization_id", specializationId);
    const { data, error } = await query;
    if (error) throw error;
    return (data || []).map((s: any) => ({
      ...s,
      specialization_name: s.academic_specializations?.name,
      category_name: s.academic_specializations?.academic_categories?.name,
    })) as AcademicSubject[];
  },

  async createSubject(specializationId: string, code: string, description: string): Promise<AcademicSubject> {
    const { data, error } = await supabase
      .from("academic_subjects")
      .insert({ specialization_id: specializationId, code, description } as any)
      .select("*")
      .single();
    if (error) throw error;
    return data as AcademicSubject;
  },

  async updateSubject(id: string, updates: { code?: string; description?: string }): Promise<AcademicSubject> {
    const { data, error } = await supabase
      .from("academic_subjects")
      .update({ ...updates, updated_at: new Date().toISOString() } as any)
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw error;
    return data as AcademicSubject;
  },

  async softDeleteSubject(id: string): Promise<void> {
    const now = new Date().toISOString();
    // Get subject info for question cascade
    const { data: subj } = await supabase
      .from("academic_subjects")
      .select("code, academic_specializations(name)")
      .eq("id", id)
      .single();

    await supabase
      .from("academic_subjects")
      .update({ deleted: true, deleted_at: now } as any)
      .eq("id", id);

    // Soft-delete questions with matching subject_code + specialization
    if (subj) {
      const subjAny = subj as any;
      await supabase
        .from("questions")
        .update({ deleted: true, updated_at: now } as any)
        .eq("subject_code", subjAny.code)
        .eq("specialization", subjAny.academic_specializations?.name)
        .eq("deleted", false);
    }
  },

  async restoreSubject(id: string): Promise<void> {
    // Restore parent specialization and category if deleted
    const { data: subj } = await supabase
      .from("academic_subjects")
      .select("specialization_id, academic_specializations(category_id)")
      .eq("id", id)
      .single();
    if (subj) {
      const subjAny = subj as any;
      await supabase
        .from("academic_specializations")
        .update({ deleted: false, deleted_at: null } as any)
        .eq("id", subjAny.specialization_id)
        .eq("deleted", true);
      if (subjAny.academic_specializations?.category_id) {
        await supabase
          .from("academic_categories")
          .update({ deleted: false, deleted_at: null } as any)
          .eq("id", subjAny.academic_specializations.category_id)
          .eq("deleted", true);
      }
    }
    await supabase
      .from("academic_subjects")
      .update({ deleted: false, deleted_at: null } as any)
      .eq("id", id);
  },

  async permanentDeleteSubject(id: string): Promise<void> {
    const { error } = await supabase
      .from("academic_subjects")
      .delete()
      .eq("id", id);
    if (error) throw error;
  },

  // ---- Deleted items for Recently Deleted ----
  async getDeletedCategories(): Promise<AcademicCategory[]> {
    const { data, error } = await supabase
      .from("academic_categories")
      .select("*")
      .eq("deleted", true)
      .order("deleted_at", { ascending: false });
    if (error) throw error;
    return (data || []) as AcademicCategory[];
  },

  async getDeletedSpecializations(): Promise<AcademicSpecialization[]> {
    const { data, error } = await supabase
      .from("academic_specializations")
      .select("*, academic_categories(name)")
      .eq("deleted", true)
      .order("deleted_at", { ascending: false });
    if (error) throw error;
    return (data || []).map((s: any) => ({
      ...s,
      category_name: s.academic_categories?.name,
    })) as AcademicSpecialization[];
  },

  async getDeletedSubjects(): Promise<AcademicSubject[]> {
    const { data, error } = await supabase
      .from("academic_subjects")
      .select("*, academic_specializations(name, academic_categories(name))")
      .eq("deleted", true)
      .order("deleted_at", { ascending: false });
    if (error) throw error;
    return (data || []).map((s: any) => ({
      ...s,
      specialization_name: s.academic_specializations?.name,
      category_name: s.academic_specializations?.academic_categories?.name,
    })) as AcademicSubject[];
  },
};
