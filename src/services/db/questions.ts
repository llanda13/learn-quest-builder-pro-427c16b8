// Question service - handles all question-related database operations
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import type { KnowledgeDimension } from "@/types/knowledge";
import { quickClassifyKnowledgeDimension } from "@/services/analysis/knowledgeDeterminer";
import { deduplicateSubjectCode, batchDeduplicateSubjectCodes } from "@/services/db/subjectDeduplication";

export type Question = Database['public']['Tables']['questions']['Row'];
export type QuestionInsert = Database['public']['Tables']['questions']['Insert'];
export type QuestionUpdate = Database['public']['Tables']['questions']['Update'];

export interface QuestionFilters {
  topic?: string;
  bloom_level?: string;
  difficulty?: string;
  approved?: boolean;
  subject?: string;
  grade_level?: string;
  term?: string;
  tags?: string[];
  search?: string;
  knowledge_dimension?: KnowledgeDimension;
}

// Convert database question to component-compatible format
export function convertQuestion(dbQuestion: Question): Question & { correct_answer: string } {
  return {
    ...dbQuestion,
    correct_answer: dbQuestion.correct_answer || '',
    choices: dbQuestion.choices as any,
    question_type: dbQuestion.question_type as 'mcq' | 'true_false' | 'essay' | 'short_answer',
    created_by: dbQuestion.created_by as 'teacher' | 'ai' | 'bulk_import'
  };
}

export const Questions = {
  async getAll(filters: QuestionFilters = {}): Promise<Question[]> {
    let query = supabase.from('questions').select('*');

    if (filters.topic) {
      query = query.eq('topic', filters.topic);
    }
    if (filters.bloom_level) {
      query = query.eq('bloom_level', filters.bloom_level);
    }
    if (filters.difficulty) {
      query = query.eq('difficulty', filters.difficulty);
    }
    if (filters.approved !== undefined) {
      query = query.eq('approved', filters.approved);
    }
    if (filters.subject) {
      query = query.eq('subject', filters.subject);
    }
    if (filters.grade_level) {
      query = query.eq('grade_level', filters.grade_level);
    }
    if (filters.term) {
      query = query.eq('term', filters.term);
    }
    if (filters.tags && filters.tags.length > 0) {
      query = query.contains('tags', filters.tags);
    }
    if (filters.search) {
      query = query.textSearch('search_vector', filters.search);
    }
    if (filters.knowledge_dimension) {
      query = query.eq('knowledge_dimension', filters.knowledge_dimension);
    }

    const { data, error } = await query.order('created_at', { ascending: false });
    
    if (error) throw error;
    return data || [];
  },

  async getById(id: string): Promise<Question | null> {
    const { data, error } = await supabase
      .from('questions')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return data;
  },

  async create(question: Omit<QuestionInsert, 'id' | 'created_at' | 'updated_at'>): Promise<Question> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    // Auto-classify knowledge dimension if not provided
    let knowledgeDimension = question.knowledge_dimension;
    if (!knowledgeDimension && question.question_text) {
      knowledgeDimension = quickClassifyKnowledgeDimension(question.question_text);
    }

    const questionData = {
      ...question,
      knowledge_dimension: knowledgeDimension,
      approved: false
    };

    // Deduplicate subject code before inserting
    await deduplicateSubjectCode(
      questionData.subject_description,
      questionData.subject_code
    );

    const { data, error } = await supabase
      .from('questions')
      .insert(questionData)
      .select('*')
      .single();

    if (error) throw error;
    return data;
  },

  async update(id: string, updates: Partial<QuestionUpdate>): Promise<Question> {
    const { data, error } = await supabase
      .from('questions')
      .update(updates)
      .eq('id', id)
      .select('*')
      .single();

    if (error) throw error;
    return data;
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('questions')
      .update({ deleted: true, updated_at: new Date().toISOString() } as any)
      .eq('id', id);

    if (error) throw error;
  },

  async bulkInsert(questions: Array<Omit<QuestionInsert, 'id' | 'created_at' | 'updated_at'>>): Promise<Question[]> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    // Auto-classify knowledge dimension for each question
    const questionsData = questions.map(q => {
      let knowledgeDimension = q.knowledge_dimension;
      if (!knowledgeDimension && q.question_text) {
        knowledgeDimension = quickClassifyKnowledgeDimension(q.question_text);
      }
      return {
        ...q,
        knowledge_dimension: knowledgeDimension,
        approved: false
      };
    });

    // Deduplicate subject codes before inserting
    await batchDeduplicateSubjectCodes(questionsData);

    const { data, error } = await supabase
      .from('questions')
      .insert(questionsData)
      .select('*');

    if (error) throw error;
    return data || [];
  },

  async approve(id: string, approved: boolean): Promise<Question> {
    const { data, error } = await supabase
      .from('questions')
      .update({ approved })
      .eq('id', id)
      .select('*')
      .single();

    if (error) throw error;
    return data;
  },

  async search(filters: QuestionFilters = {}): Promise<Question[]> {
    return this.getAll(filters);
  },

  async getUniqueValues(): Promise<{
    subjects: string[];
    gradeLevels: string[];
    terms: string[];
    topics: string[];
  }> {
    const { data, error } = await supabase
      .from('questions')
      .select('subject, grade_level, term, topic');
    
    if (error) throw error;
    
    const subjects = [...new Set(data?.map(q => q.subject).filter(Boolean))] as string[];
    const gradeLevels = [...new Set(data?.map(q => q.grade_level).filter(Boolean))] as string[];
    const terms = [...new Set(data?.map(q => q.term).filter(Boolean))] as string[];
    const topics = [...new Set(data?.map(q => q.topic).filter(Boolean))] as string[];
    
    return { subjects, gradeLevels, terms, topics };
  },

  async getStats() {
    const { data, error } = await supabase
      .from('questions')
      .select('bloom_level, difficulty, approved');
      
    if (error) throw error;
    
    const stats = {
      total: data?.length || 0,
      approved: data?.filter(q => q.approved).length || 0,
      byBloom: {} as Record<string, number>,
      byDifficulty: {} as Record<string, number>
    };

    data?.forEach(q => {
      stats.byBloom[q.bloom_level] = (stats.byBloom[q.bloom_level] || 0) + 1;
      stats.byDifficulty[q.difficulty] = (stats.byDifficulty[q.difficulty] || 0) + 1;
    });

    return stats;
  },

  async toggleApproval(id: string): Promise<Question> {
    const question = await this.getById(id);
    if (!question) throw new Error('Question not found');
    
    return this.update(id, { approved: !question.approved });
  },

  async insert(question: Omit<QuestionInsert, 'id' | 'created_at' | 'updated_at'>): Promise<Question> {
    return this.create(question);
  },

  // New approval toggle function with needs_review sync
  async setApproval(questionId: string, approved: boolean): Promise<Question> {
    const { data, error } = await supabase
      .from('questions')
      .update({ 
        approved, 
        needs_review: !approved,
        approval_timestamp: approved ? new Date().toISOString() : null
      })
      .eq('id', questionId)
      .select('*')
      .single();

    if (error) throw error;
    return data;
  },

  async updateClassification(
    questionId: string, 
    classification: {
      cognitive_level?: string;
      knowledge_dimension?: string;
      confidence?: number;
      semantic_vector?: string;
    }
  ): Promise<Question> {
    const { data, error } = await supabase
      .from('questions')
      .update({
        cognitive_level: classification.cognitive_level,
        bloom_level: classification.cognitive_level, // Keep in sync
        knowledge_dimension: classification.knowledge_dimension,
        classification_confidence: classification.confidence,
        semantic_vector: classification.semantic_vector,
        updated_at: new Date().toISOString()
      })
      .eq('id', questionId)
      .select('*')
      .single();

    if (error) throw error;
    return data;
  }
};