import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { normalizeKnowledgeDimension } from '@/types/knowledge';
import { toast } from 'sonner';

export interface ValidationQuestion {
  id: string;
  question_text: string;
  topic: string;
  bloom_level: string;
  knowledge_dimension: string;
  difficulty: string;
  classification_confidence: number;
  quality_score: number;
  created_at: string;
  validation_status: string;
}

export interface ValidationSubmission {
  bloom_level: string;
  knowledge_dimension: string;
  difficulty: string;
  notes?: string;
  confidence: number;
}

export interface ValidationRecord {
  id: string;
  question_id: string;
  original_classification: any;
  validated_classification: any;
  validation_confidence: number;
  notes: string | null;
  created_at: string;
  validator_name?: string;
}

export interface ValidationRequest {
  id: string;
  question_id: string;
  question_text: string;
  bloom_level: string;
  knowledge_dimension: string;
  difficulty: string;
  classification_confidence: number;
  request_type: string;
  requested_by: string;
  status: string;
  created_at: string;
  original_classification: {
    bloom_level: string;
    knowledge_dimension: string;
    difficulty: string;
    confidence: number;
  };
}

export function useClassificationValidation() {
  const [loading, setLoading] = useState(false);
  const [validations, setValidations] = useState<ValidationQuestion[]>([]);
  const [validationHistory, setValidationHistory] = useState<ValidationRecord[]>([]);
  const [requests, setRequests] = useState<ValidationRequest[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState({
    pending: 0,
    validated: 0,
    needsReview: 0,
    total: 0,
    approved: 0,
    rejected: 0,
    totalValidations: 0,
    accuracyRate: 0.85,
    avgConfidenceImprovement: 0.15
  });

  const fetchPendingValidations = useCallback(async () => {
    setLoading(true);
    try {
      const { data: questions, error } = await supabase
        .from('questions')
        .select('*')
        .or('validation_status.eq.pending,needs_review.eq.true,classification_confidence.lt.0.7')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      const mappedRequests: ValidationRequest[] = (questions || []).map(q => ({
        id: q.id,
        question_id: q.id,
        question_text: q.question_text,
        bloom_level: q.bloom_level,
        knowledge_dimension: q.knowledge_dimension,
        difficulty: q.difficulty,
        classification_confidence: q.classification_confidence || 0,
        request_type: 'classification',
        requested_by: q.owner || '',
        status: q.validation_status || 'pending',
        created_at: q.created_at,
        original_classification: {
          bloom_level: q.bloom_level,
          knowledge_dimension: q.knowledge_dimension,
          difficulty: q.difficulty,
          confidence: q.classification_confidence || 0
        }
      }));

      setValidations(questions || []);
      setRequests(mappedRequests);

      const pending = questions?.filter(q => q.validation_status === 'pending').length || 0;
      const validated = questions?.filter(q => q.validation_status === 'validated').length || 0;
      const needsReview = questions?.filter(q => q.needs_review).length || 0;

      setStats(prev => ({ ...prev, pending, validated, needsReview }));
    } catch (error) {
      console.error('Error fetching validations:', error);
      setError(error instanceof Error ? error.message : 'Unknown error');
      toast.error('Failed to load validations');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchValidationHistory = useCallback(async (questionId?: string) => {
    try {
      let query = supabase
        .from('classification_validations')
        .select(`
          *,
          profiles:validator_id (
            full_name
          )
        `)
        .order('created_at', { ascending: false });

      if (questionId) {
        query = query.eq('question_id', questionId);
      }

      const { data, error } = await query.limit(100);

      if (error) throw error;

      const records: ValidationRecord[] = (data || []).map((v: any) => ({
        id: v.id,
        question_id: v.question_id,
        original_classification: v.original_classification,
        validated_classification: v.validated_classification,
        validation_confidence: v.validation_confidence,
        notes: v.notes,
        created_at: v.created_at,
        validator_name: v.profiles?.full_name || 'Unknown'
      }));

      setValidationHistory(records);
      return records;
    } catch (error) {
      console.error('Error fetching validation history:', error);
      toast.error('Failed to load validation history');
      return [];
    }
  }, []);

  const submitValidation = useCallback(async (
    questionId: string,
    validation: ValidationSubmission | any
  ) => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data: question, error: questionError } = await supabase
        .from('questions')
        .select('*')
        .eq('id', questionId)
        .single();

      if (questionError) throw questionError;

      const validatedClassification = validation.validated_classification || {
        bloom_level: validation.bloom_level,
        knowledge_dimension: validation.knowledge_dimension,
        difficulty: validation.difficulty
      };

      const { error: validationError } = await supabase
        .from('classification_validations')
        .insert({
          question_id: questionId,
          validator_id: user.id,
          original_classification: {
            bloom_level: question.bloom_level,
            knowledge_dimension: question.knowledge_dimension,
            difficulty: question.difficulty
          },
          validated_classification: validatedClassification,
          validation_confidence: validation.validation_confidence || validation.confidence || 0.9,
          notes: validation.notes || null,
          validation_type: 'manual'
        });

      if (validationError) throw validationError;

      const { error: updateError } = await supabase
        .from('questions')
        .update({
          bloom_level: validatedClassification.bloom_level,
          knowledge_dimension: normalizeKnowledgeDimension(validatedClassification.knowledge_dimension),
          difficulty: validatedClassification.difficulty,
          validation_status: 'validated',
          validated_by: user.id,
          validation_timestamp: new Date().toISOString(),
          classification_confidence: Math.max(
            question.classification_confidence || 0,
            validation.validation_confidence || validation.confidence || 0.9
          ),
          needs_review: false
        })
        .eq('id', questionId);

      if (updateError) throw updateError;

      toast.success('Validation submitted successfully');
      
      await fetchPendingValidations();
      await fetchValidationHistory(questionId);

      return { success: true };
    } catch (error) {
      console.error('Error submitting validation:', error);
      toast.error('Failed to submit validation');
      return { success: false };
    } finally {
      setLoading(false);
    }
  }, [fetchPendingValidations, fetchValidationHistory]);

  const rejectQuestion = useCallback(async (questionId: string, reason: string) => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('questions')
        .update({
          validation_status: 'rejected',
          needs_review: true,
          approval_notes: reason,
          validated_by: user.id,
          validation_timestamp: new Date().toISOString()
        })
        .eq('id', questionId);

      if (error) throw error;

      toast.success('Question marked for review');
      await fetchPendingValidations();
      return { success: true };
    } catch (error) {
      console.error('Error rejecting question:', error);
      toast.error('Failed to reject question');
      return { success: false };
    } finally {
      setLoading(false);
    }
  }, [fetchPendingValidations]);

  const approveQuestion = useCallback(async (questionId: string) => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('questions')
        .update({
          validation_status: 'validated',
          validated_by: user.id,
          validation_timestamp: new Date().toISOString(),
          approved: true,
          needs_review: false
        })
        .eq('id', questionId);

      if (error) throw error;

      toast.success('Question approved');
      await fetchPendingValidations();
      return { success: true };
    } catch (error) {
      console.error('Error approving question:', error);
      toast.error('Failed to approve question');
      return { success: false };
    } finally {
      setLoading(false);
    }
  }, [fetchPendingValidations]);

  useEffect(() => {
    fetchPendingValidations();
  }, [fetchPendingValidations]);

  return {
    loading,
    validations,
    validationHistory,
    requests,
    error,
    stats,
    fetchPendingValidations,
    fetchValidationHistory,
    submitValidation,
    rejectQuestion: rejectQuestion,
    rejectValidation: rejectQuestion,
    approveQuestion,
    requestValidation: async () => ({ success: true }),
    validateQuestion: submitValidation,
    pendingValidations: requests,
    completedValidations: validationHistory,
    getValidationHistory: fetchValidationHistory,
    refresh: fetchPendingValidations,
    loadValidationRequests: fetchPendingValidations,
    loadValidationResults: fetchValidationHistory
  };
}
