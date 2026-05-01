export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "12.2.12 (cd3cf9e)"
  }
  public: {
    Tables: {
      academic_categories: {
        Row: {
          created_at: string
          deleted: boolean
          deleted_at: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted?: boolean
          deleted_at?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted?: boolean
          deleted_at?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      academic_specializations: {
        Row: {
          category_id: string
          created_at: string
          deleted: boolean
          deleted_at: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          category_id: string
          created_at?: string
          deleted?: boolean
          deleted_at?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          category_id?: string
          created_at?: string
          deleted?: boolean
          deleted_at?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "academic_specializations_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "academic_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      academic_subjects: {
        Row: {
          code: string
          created_at: string
          deleted: boolean
          deleted_at: string | null
          description: string
          id: string
          specialization_id: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          deleted?: boolean
          deleted_at?: string | null
          description: string
          id?: string
          specialization_id: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          deleted?: boolean
          deleted_at?: string | null
          description?: string
          id?: string
          specialization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "academic_subjects_specialization_id_fkey"
            columns: ["specialization_id"]
            isOneToOne: false
            referencedRelation: "academic_specializations"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_log: {
        Row: {
          action: string
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          meta: Json | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          meta?: Json | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          meta?: Json | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_conversations: {
        Row: {
          active_intent: string | null
          created_at: string
          id: string
          last_message_at: string
          messages: Json
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          active_intent?: string | null
          created_at?: string
          id?: string
          last_message_at?: string
          messages?: Json
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          active_intent?: string | null
          created_at?: string
          id?: string
          last_message_at?: string
          messages?: Json
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_generation_logs: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          generated_at: string
          generated_by: string | null
          generation_type: string
          id: string
          metadata: Json | null
          model_used: string | null
          prompt_used: string | null
          question_id: string | null
          rejection_reason: string | null
          semantic_similarity_score: number | null
          tos_id: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          generated_at?: string
          generated_by?: string | null
          generation_type: string
          id?: string
          metadata?: Json | null
          model_used?: string | null
          prompt_used?: string | null
          question_id?: string | null
          rejection_reason?: string | null
          semantic_similarity_score?: number | null
          tos_id?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          generated_at?: string
          generated_by?: string | null
          generation_type?: string
          id?: string
          metadata?: Json | null
          model_used?: string | null
          prompt_used?: string | null
          question_id?: string | null
          rejection_reason?: string | null
          semantic_similarity_score?: number | null
          tos_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_generation_logs_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_generation_logs_generated_by_fkey"
            columns: ["generated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_generation_logs_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_ai_generation_logs_tos_id"
            columns: ["tos_id"]
            isOneToOne: false
            referencedRelation: "tos_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      assembly_versions: {
        Row: {
          assembly_id: string
          created_at: string
          id: string
          metadata: Json | null
          question_order: string[]
          shuffle_seed: string | null
          version_label: string
        }
        Insert: {
          assembly_id: string
          created_at?: string
          id?: string
          metadata?: Json | null
          question_order: string[]
          shuffle_seed?: string | null
          version_label: string
        }
        Update: {
          assembly_id?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          question_order?: string[]
          shuffle_seed?: string | null
          version_label?: string
        }
        Relationships: [
          {
            foreignKeyName: "assembly_versions_assembly_id_fkey"
            columns: ["assembly_id"]
            isOneToOne: false
            referencedRelation: "test_assemblies"
            referencedColumns: ["id"]
          },
        ]
      }
      classification_validations: {
        Row: {
          cognitive_level: string | null
          created_at: string
          id: string
          knowledge_dimension: string | null
          notes: string | null
          original_classification: Json
          question_id: string | null
          validated_classification: Json
          validation_confidence: number
          validation_type: string | null
          validator_id: string | null
        }
        Insert: {
          cognitive_level?: string | null
          created_at?: string
          id?: string
          knowledge_dimension?: string | null
          notes?: string | null
          original_classification: Json
          question_id?: string | null
          validated_classification: Json
          validation_confidence: number
          validation_type?: string | null
          validator_id?: string | null
        }
        Update: {
          cognitive_level?: string | null
          created_at?: string
          id?: string
          knowledge_dimension?: string | null
          notes?: string | null
          original_classification?: Json
          question_id?: string | null
          validated_classification?: Json
          validation_confidence?: number
          validation_type?: string | null
          validator_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "classification_validations_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classification_validations_validator_id_fkey"
            columns: ["validator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      collaboration_messages: {
        Row: {
          document_id: string
          document_type: string
          id: string
          message: string
          timestamp: string
          user_email: string
          user_name: string
        }
        Insert: {
          document_id: string
          document_type: string
          id?: string
          message: string
          timestamp?: string
          user_email: string
          user_name: string
        }
        Update: {
          document_id?: string
          document_type?: string
          id?: string
          message?: string
          timestamp?: string
          user_email?: string
          user_name?: string
        }
        Relationships: []
      }
      document_activity: {
        Row: {
          action_details: Json | null
          action_type: string
          document_id: string
          document_type: string
          id: string
          timestamp: string
          user_email: string
          user_name: string
        }
        Insert: {
          action_details?: Json | null
          action_type: string
          document_id: string
          document_type: string
          id?: string
          timestamp?: string
          user_email: string
          user_name: string
        }
        Update: {
          action_details?: Json | null
          action_type?: string
          document_id?: string
          document_type?: string
          id?: string
          timestamp?: string
          user_email?: string
          user_name?: string
        }
        Relationships: []
      }
      document_collaborators: {
        Row: {
          accepted_at: string | null
          created_at: string
          document_id: string
          document_type: string
          id: string
          invited_at: string
          invited_by: string | null
          last_active: string | null
          role: string
          user_email: string
          user_name: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          document_id: string
          document_type: string
          id?: string
          invited_at?: string
          invited_by?: string | null
          last_active?: string | null
          role: string
          user_email: string
          user_name: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          document_id?: string
          document_type?: string
          id?: string
          invited_at?: string
          invited_by?: string | null
          last_active?: string | null
          role?: string
          user_email?: string
          user_name?: string
        }
        Relationships: []
      }
      document_presence: {
        Row: {
          created_at: string
          cursor_position: Json | null
          document_id: string
          document_type: string
          id: string
          is_active: boolean
          last_seen: string
          user_color: string | null
          user_email: string
          user_name: string
        }
        Insert: {
          created_at?: string
          cursor_position?: Json | null
          document_id: string
          document_type: string
          id?: string
          is_active?: boolean
          last_seen?: string
          user_color?: string | null
          user_email: string
          user_name: string
        }
        Update: {
          created_at?: string
          cursor_position?: Json | null
          document_id?: string
          document_type?: string
          id?: string
          is_active?: boolean
          last_seen?: string
          user_color?: string | null
          user_email?: string
          user_name?: string
        }
        Relationships: []
      }
      educational_standards: {
        Row: {
          category: string | null
          code: string
          created_at: string
          description: string | null
          framework: string
          grade_level: string | null
          id: string
          metadata: Json | null
          parent_standard_id: string | null
          subject_area: string | null
          title: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          code: string
          created_at?: string
          description?: string | null
          framework: string
          grade_level?: string | null
          id?: string
          metadata?: Json | null
          parent_standard_id?: string | null
          subject_area?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          code?: string
          created_at?: string
          description?: string | null
          framework?: string
          grade_level?: string | null
          id?: string
          metadata?: Json | null
          parent_standard_id?: string | null
          subject_area?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "educational_standards_parent_standard_id_fkey"
            columns: ["parent_standard_id"]
            isOneToOne: false
            referencedRelation: "educational_standards"
            referencedColumns: ["id"]
          },
        ]
      }
      generated_tests: {
        Row: {
          answer_key: Json | null
          course: string | null
          created_at: string
          created_by: string | null
          exam_period: string | null
          id: string
          instructions: string | null
          items: Json
          parent_test_id: string | null
          points_per_question: number | null
          question_order: Json | null
          school_year: string | null
          shuffle_choices: boolean | null
          shuffle_questions: boolean | null
          shuffle_seed: string | null
          subject: string | null
          time_limit: number | null
          title: string | null
          tos_id: string | null
          version_label: string | null
          version_number: number | null
          watermark_data: Json | null
          year_section: string | null
        }
        Insert: {
          answer_key?: Json | null
          course?: string | null
          created_at?: string
          created_by?: string | null
          exam_period?: string | null
          id?: string
          instructions?: string | null
          items: Json
          parent_test_id?: string | null
          points_per_question?: number | null
          question_order?: Json | null
          school_year?: string | null
          shuffle_choices?: boolean | null
          shuffle_questions?: boolean | null
          shuffle_seed?: string | null
          subject?: string | null
          time_limit?: number | null
          title?: string | null
          tos_id?: string | null
          version_label?: string | null
          version_number?: number | null
          watermark_data?: Json | null
          year_section?: string | null
        }
        Update: {
          answer_key?: Json | null
          course?: string | null
          created_at?: string
          created_by?: string | null
          exam_period?: string | null
          id?: string
          instructions?: string | null
          items?: Json
          parent_test_id?: string | null
          points_per_question?: number | null
          question_order?: Json | null
          school_year?: string | null
          shuffle_choices?: boolean | null
          shuffle_questions?: boolean | null
          shuffle_seed?: string | null
          subject?: string | null
          time_limit?: number | null
          title?: string | null
          tos_id?: string | null
          version_label?: string | null
          version_number?: number | null
          watermark_data?: Json | null
          year_section?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "generated_tests_parent_test_id_fkey"
            columns: ["parent_test_id"]
            isOneToOne: false
            referencedRelation: "generated_tests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generated_tests_tos_id_fkey"
            columns: ["tos_id"]
            isOneToOne: false
            referencedRelation: "tos_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      learning_competencies: {
        Row: {
          analyzing_items: number
          applying_items: number
          created_at: string
          creating_items: number
          evaluating_items: number
          hours: number | null
          id: string
          item_numbers: Json | null
          percentage: number | null
          remembering_items: number
          topic_name: string
          tos_id: string
          total_items: number
          understanding_items: number
        }
        Insert: {
          analyzing_items?: number
          applying_items?: number
          created_at?: string
          creating_items?: number
          evaluating_items?: number
          hours?: number | null
          id?: string
          item_numbers?: Json | null
          percentage?: number | null
          remembering_items?: number
          topic_name: string
          tos_id: string
          total_items: number
          understanding_items?: number
        }
        Update: {
          analyzing_items?: number
          applying_items?: number
          created_at?: string
          creating_items?: number
          evaluating_items?: number
          hours?: number | null
          id?: string
          item_numbers?: Json | null
          percentage?: number | null
          remembering_items?: number
          topic_name?: string
          tos_id?: string
          total_items?: number
          understanding_items?: number
        }
        Relationships: [
          {
            foreignKeyName: "learning_competencies_tos_id_fkey"
            columns: ["tos_id"]
            isOneToOne: false
            referencedRelation: "tos_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      performance_benchmarks: {
        Row: {
          average_response_time: number | null
          created_at: string
          error_rate: number | null
          id: string
          max_response_time: number | null
          measured_at: string
          measurement_period_minutes: number | null
          min_response_time: number | null
          operation_name: string
          throughput: number | null
        }
        Insert: {
          average_response_time?: number | null
          created_at?: string
          error_rate?: number | null
          id?: string
          max_response_time?: number | null
          measured_at: string
          measurement_period_minutes?: number | null
          min_response_time?: number | null
          operation_name: string
          throughput?: number | null
        }
        Update: {
          average_response_time?: number | null
          created_at?: string
          error_rate?: number | null
          id?: string
          max_response_time?: number | null
          measured_at?: string
          measurement_period_minutes?: number | null
          min_response_time?: number | null
          operation_name?: string
          throughput?: number | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          college: string | null
          created_at: string
          email: string
          full_name: string
          id: string
          institution: string | null
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          college?: string | null
          created_at?: string
          email: string
          full_name?: string
          id: string
          institution?: string | null
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          college?: string | null
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          institution?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      psychometric_analyses: {
        Row: {
          analysis_date: string
          analysis_type: string
          analyzed_by: string | null
          created_at: string
          difficulty_index: number | null
          discrimination_index: number | null
          id: string
          point_biserial_correlation: number | null
          question_id: string | null
          reliability_coefficient: number | null
          sample_size: number | null
          test_id: string | null
          validity_score: number | null
        }
        Insert: {
          analysis_date?: string
          analysis_type: string
          analyzed_by?: string | null
          created_at?: string
          difficulty_index?: number | null
          discrimination_index?: number | null
          id?: string
          point_biserial_correlation?: number | null
          question_id?: string | null
          reliability_coefficient?: number | null
          sample_size?: number | null
          test_id?: string | null
          validity_score?: number | null
        }
        Update: {
          analysis_date?: string
          analysis_type?: string
          analyzed_by?: string | null
          created_at?: string
          difficulty_index?: number | null
          discrimination_index?: number | null
          id?: string
          point_biserial_correlation?: number | null
          question_id?: string | null
          reliability_coefficient?: number | null
          sample_size?: number | null
          test_id?: string | null
          validity_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "psychometric_analyses_analyzed_by_fkey"
            columns: ["analyzed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "psychometric_analyses_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "psychometric_analyses_test_id_fkey"
            columns: ["test_id"]
            isOneToOne: false
            referencedRelation: "generated_tests"
            referencedColumns: ["id"]
          },
        ]
      }
      quality_assessments: {
        Row: {
          assessed_by: string | null
          assessment_date: string
          characteristics: Json
          compliance_level: string
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          next_review_date: string | null
          overall_score: number
          recommendations: string[] | null
          updated_at: string
        }
        Insert: {
          assessed_by?: string | null
          assessment_date?: string
          characteristics: Json
          compliance_level: string
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          next_review_date?: string | null
          overall_score: number
          recommendations?: string[] | null
          updated_at?: string
        }
        Update: {
          assessed_by?: string | null
          assessment_date?: string
          characteristics?: Json
          compliance_level?: string
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          next_review_date?: string | null
          overall_score?: number
          recommendations?: string[] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quality_assessments_assessed_by_fkey"
            columns: ["assessed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      quality_metrics: {
        Row: {
          automated: boolean
          characteristic: string
          entity_id: string
          entity_type: string
          id: string
          measured_at: string
          measured_by: string | null
          measurement_method: string | null
          metric_name: string
          unit: string | null
          value: number
        }
        Insert: {
          automated?: boolean
          characteristic: string
          entity_id: string
          entity_type: string
          id?: string
          measured_at?: string
          measured_by?: string | null
          measurement_method?: string | null
          metric_name: string
          unit?: string | null
          value: number
        }
        Update: {
          automated?: boolean
          characteristic?: string
          entity_id?: string
          entity_type?: string
          id?: string
          measured_at?: string
          measured_by?: string | null
          measurement_method?: string | null
          metric_name?: string
          unit?: string | null
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "quality_metrics_measured_by_fkey"
            columns: ["measured_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      question_similarities: {
        Row: {
          algorithm_used: string
          calculated_at: string
          id: string
          question1_id: string
          question2_id: string
          similarity_score: number
        }
        Insert: {
          algorithm_used: string
          calculated_at?: string
          id?: string
          question1_id: string
          question2_id: string
          similarity_score: number
        }
        Update: {
          algorithm_used?: string
          calculated_at?: string
          id?: string
          question1_id?: string
          question2_id?: string
          similarity_score?: number
        }
        Relationships: [
          {
            foreignKeyName: "question_similarities_question1_id_fkey"
            columns: ["question1_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_similarities_question2_id_fkey"
            columns: ["question2_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      question_standards: {
        Row: {
          alignment_strength: number | null
          created_at: string
          id: string
          notes: string | null
          question_id: string
          standard_id: string
          validated_at: string | null
          validated_by: string | null
        }
        Insert: {
          alignment_strength?: number | null
          created_at?: string
          id?: string
          notes?: string | null
          question_id: string
          standard_id: string
          validated_at?: string | null
          validated_by?: string | null
        }
        Update: {
          alignment_strength?: number | null
          created_at?: string
          id?: string
          notes?: string | null
          question_id?: string
          standard_id?: string
          validated_at?: string | null
          validated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "question_standards_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_standards_standard_id_fkey"
            columns: ["standard_id"]
            isOneToOne: false
            referencedRelation: "educational_standards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_standards_validated_by_fkey"
            columns: ["validated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      questions: {
        Row: {
          ai_confidence_score: number | null
          approval_confidence: number | null
          approval_notes: string | null
          approval_timestamp: string | null
          approved: boolean
          approved_by: string | null
          bloom_level: string | null
          category: string | null
          choices: Json | null
          classification_confidence: number | null
          cognitive_level: string | null
          correct_answer: string | null
          created_at: string
          created_by: string
          deleted: boolean
          difficulty: string | null
          grade_level: string | null
          id: string
          knowledge_dimension: string | null
          metadata: Json | null
          needs_review: boolean
          owner: string | null
          quality_score: number | null
          question_text: string
          question_type: string
          readability_score: number | null
          search_vector: unknown
          semantic_vector: string | null
          specialization: string | null
          status: string | null
          subject: string | null
          subject_code: string | null
          subject_description: string | null
          tags: string[] | null
          term: string | null
          topic: string
          tos_id: string | null
          updated_at: string
          used_count: number
          used_history: Json | null
          validated_by: string | null
          validation_status: string | null
          validation_timestamp: string | null
        }
        Insert: {
          ai_confidence_score?: number | null
          approval_confidence?: number | null
          approval_notes?: string | null
          approval_timestamp?: string | null
          approved?: boolean
          approved_by?: string | null
          bloom_level?: string | null
          category?: string | null
          choices?: Json | null
          classification_confidence?: number | null
          cognitive_level?: string | null
          correct_answer?: string | null
          created_at?: string
          created_by: string
          deleted?: boolean
          difficulty?: string | null
          grade_level?: string | null
          id?: string
          knowledge_dimension?: string | null
          metadata?: Json | null
          needs_review?: boolean
          owner?: string | null
          quality_score?: number | null
          question_text: string
          question_type: string
          readability_score?: number | null
          search_vector?: unknown
          semantic_vector?: string | null
          specialization?: string | null
          status?: string | null
          subject?: string | null
          subject_code?: string | null
          subject_description?: string | null
          tags?: string[] | null
          term?: string | null
          topic: string
          tos_id?: string | null
          updated_at?: string
          used_count?: number
          used_history?: Json | null
          validated_by?: string | null
          validation_status?: string | null
          validation_timestamp?: string | null
        }
        Update: {
          ai_confidence_score?: number | null
          approval_confidence?: number | null
          approval_notes?: string | null
          approval_timestamp?: string | null
          approved?: boolean
          approved_by?: string | null
          bloom_level?: string | null
          category?: string | null
          choices?: Json | null
          classification_confidence?: number | null
          cognitive_level?: string | null
          correct_answer?: string | null
          created_at?: string
          created_by?: string
          deleted?: boolean
          difficulty?: string | null
          grade_level?: string | null
          id?: string
          knowledge_dimension?: string | null
          metadata?: Json | null
          needs_review?: boolean
          owner?: string | null
          quality_score?: number | null
          question_text?: string
          question_type?: string
          readability_score?: number | null
          search_vector?: unknown
          semantic_vector?: string | null
          specialization?: string | null
          status?: string | null
          subject?: string | null
          subject_code?: string | null
          subject_description?: string | null
          tags?: string[] | null
          term?: string | null
          topic?: string
          tos_id?: string | null
          updated_at?: string
          used_count?: number
          used_history?: Json | null
          validated_by?: string | null
          validation_status?: string | null
          validation_timestamp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_questions_tos_id"
            columns: ["tos_id"]
            isOneToOne: false
            referencedRelation: "tos_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "questions_owner_fkey"
            columns: ["owner"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "questions_tos_id_fkey"
            columns: ["tos_id"]
            isOneToOne: false
            referencedRelation: "tos_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "questions_validated_by_fkey"
            columns: ["validated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      review_requests: {
        Row: {
          assigned_to: string | null
          completed_at: string | null
          created_at: string
          id: string
          notes: string | null
          question_id: string
          request_type: string
          requested_by: string
          review_result: Json | null
          status: string
        }
        Insert: {
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          question_id: string
          request_type: string
          requested_by: string
          review_result?: Json | null
          status?: string
        }
        Update: {
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          question_id?: string
          request_type?: string
          requested_by?: string
          review_result?: Json | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_requests_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_requests_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rubric_criteria: {
        Row: {
          created_at: string
          id: string
          max_score: number
          name: string
          order_index: number
          rubric_id: string
          weight: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          max_score: number
          name: string
          order_index: number
          rubric_id: string
          weight?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          max_score?: number
          name?: string
          order_index?: number
          rubric_id?: string
          weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "rubric_criteria_rubric_id_fkey"
            columns: ["rubric_id"]
            isOneToOne: false
            referencedRelation: "rubrics"
            referencedColumns: ["id"]
          },
        ]
      }
      rubric_scores: {
        Row: {
          comments: string | null
          created_at: string
          id: string
          question_id: string | null
          scorer_id: string
          scores: Json
          student_id: string | null
          student_name: string | null
          test_id: string | null
          total_score: number
        }
        Insert: {
          comments?: string | null
          created_at?: string
          id?: string
          question_id?: string | null
          scorer_id: string
          scores: Json
          student_id?: string | null
          student_name?: string | null
          test_id?: string | null
          total_score: number
        }
        Update: {
          comments?: string | null
          created_at?: string
          id?: string
          question_id?: string | null
          scorer_id?: string
          scores?: Json
          student_id?: string | null
          student_name?: string | null
          test_id?: string | null
          total_score?: number
        }
        Relationships: [
          {
            foreignKeyName: "rubric_scores_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rubric_scores_scorer_id_fkey"
            columns: ["scorer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rubric_scores_test_id_fkey"
            columns: ["test_id"]
            isOneToOne: false
            referencedRelation: "generated_tests"
            referencedColumns: ["id"]
          },
        ]
      }
      rubrics: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          id: string
          title: string
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          title: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "rubrics_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      system_metrics: {
        Row: {
          aggregation_period: string | null
          created_at: string
          dimensions: Json | null
          id: string
          measured_at: string
          metric_category: string
          metric_name: string
          metric_unit: string | null
          metric_value: number
        }
        Insert: {
          aggregation_period?: string | null
          created_at?: string
          dimensions?: Json | null
          id?: string
          measured_at: string
          metric_category: string
          metric_name: string
          metric_unit?: string | null
          metric_value: number
        }
        Update: {
          aggregation_period?: string | null
          created_at?: string
          dimensions?: Json | null
          id?: string
          measured_at?: string
          metric_category?: string
          metric_name?: string
          metric_unit?: string | null
          metric_value?: number
        }
        Relationships: []
      }
      system_settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      test_assemblies: {
        Row: {
          created_at: string
          created_by: string
          id: string
          params: Json | null
          status: string
          title: string
          tos_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          params?: Json | null
          status?: string
          title: string
          tos_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          params?: Json | null
          status?: string
          title?: string
          tos_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "test_assemblies_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "test_assemblies_tos_id_fkey"
            columns: ["tos_id"]
            isOneToOne: false
            referencedRelation: "tos_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      test_assembly_constraints: {
        Row: {
          constraint_config: Json
          constraint_type: string
          created_at: string
          created_by: string | null
          id: string
          is_required: boolean
          priority: number
          test_id: string
        }
        Insert: {
          constraint_config: Json
          constraint_type: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_required?: boolean
          priority?: number
          test_id: string
        }
        Update: {
          constraint_config?: Json
          constraint_type?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_required?: boolean
          priority?: number
          test_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "test_assembly_constraints_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "test_assembly_constraints_test_id_fkey"
            columns: ["test_id"]
            isOneToOne: false
            referencedRelation: "test_assemblies"
            referencedColumns: ["id"]
          },
        ]
      }
      test_assignments: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          created_at: string
          id: string
          metadata: Json | null
          seat_number: string | null
          started_at: string | null
          status: string
          student_id: string
          student_name: string
          submitted_at: string | null
          test_version_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          seat_number?: string | null
          started_at?: string | null
          status?: string
          student_id: string
          student_name: string
          submitted_at?: string | null
          test_version_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          seat_number?: string | null
          started_at?: string | null
          status?: string
          student_id?: string
          student_name?: string
          submitted_at?: string | null
          test_version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "test_assignments_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "test_assignments_test_version_id_fkey"
            columns: ["test_version_id"]
            isOneToOne: false
            referencedRelation: "test_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      test_distribution_logs: {
        Row: {
          created_at: string
          distributed_at: string
          distributed_by: string
          distribution_strategy: string
          id: string
          parent_test_id: string | null
          settings: Json | null
          total_students: number
          total_versions: number
        }
        Insert: {
          created_at?: string
          distributed_at?: string
          distributed_by: string
          distribution_strategy: string
          id?: string
          parent_test_id?: string | null
          settings?: Json | null
          total_students: number
          total_versions: number
        }
        Update: {
          created_at?: string
          distributed_at?: string
          distributed_by?: string
          distribution_strategy?: string
          id?: string
          parent_test_id?: string | null
          settings?: Json | null
          total_students?: number
          total_versions?: number
        }
        Relationships: [
          {
            foreignKeyName: "test_distribution_logs_distributed_by_fkey"
            columns: ["distributed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "test_distribution_logs_parent_test_id_fkey"
            columns: ["parent_test_id"]
            isOneToOne: false
            referencedRelation: "generated_tests"
            referencedColumns: ["id"]
          },
        ]
      }
      test_equivalence_groups: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          group_name: string
          id: string
          statistical_metrics: Json | null
          target_difficulty: number | null
          target_reliability: number | null
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          group_name: string
          id?: string
          statistical_metrics?: Json | null
          target_difficulty?: number | null
          target_reliability?: number | null
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          group_name?: string
          id?: string
          statistical_metrics?: Json | null
          target_difficulty?: number | null
          target_reliability?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "test_equivalence_groups_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      test_equivalence_members: {
        Row: {
          created_at: string
          equivalence_score: number | null
          group_id: string
          id: string
          test_id: string
        }
        Insert: {
          created_at?: string
          equivalence_score?: number | null
          group_id: string
          id?: string
          test_id: string
        }
        Update: {
          created_at?: string
          equivalence_score?: number | null
          group_id?: string
          id?: string
          test_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "test_equivalence_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "test_equivalence_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "test_equivalence_members_test_id_fkey"
            columns: ["test_id"]
            isOneToOne: false
            referencedRelation: "generated_tests"
            referencedColumns: ["id"]
          },
        ]
      }
      test_exports: {
        Row: {
          export_type: string
          exported_at: string
          exported_by: string | null
          file_name: string | null
          id: string
          test_version_id: string
        }
        Insert: {
          export_type: string
          exported_at?: string
          exported_by?: string | null
          file_name?: string | null
          id?: string
          test_version_id: string
        }
        Update: {
          export_type?: string
          exported_at?: string
          exported_by?: string | null
          file_name?: string | null
          id?: string
          test_version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "test_exports_test_version_id_fkey"
            columns: ["test_version_id"]
            isOneToOne: false
            referencedRelation: "test_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      test_metadata: {
        Row: {
          course: string | null
          created_at: string
          created_by: string | null
          exam_period: string | null
          id: string
          instructions: string | null
          number_of_versions: number
          points_per_question: number | null
          school_year: string | null
          shuffle_choices: boolean
          shuffle_questions: boolean
          subject: string
          time_limit: number | null
          title: string
          total_questions: number | null
          updated_at: string
          year_section: string | null
        }
        Insert: {
          course?: string | null
          created_at?: string
          created_by?: string | null
          exam_period?: string | null
          id?: string
          instructions?: string | null
          number_of_versions?: number
          points_per_question?: number | null
          school_year?: string | null
          shuffle_choices?: boolean
          shuffle_questions?: boolean
          subject: string
          time_limit?: number | null
          title: string
          total_questions?: number | null
          updated_at?: string
          year_section?: string | null
        }
        Update: {
          course?: string | null
          created_at?: string
          created_by?: string | null
          exam_period?: string | null
          id?: string
          instructions?: string | null
          number_of_versions?: number
          points_per_question?: number | null
          school_year?: string | null
          shuffle_choices?: boolean
          shuffle_questions?: boolean
          subject?: string
          time_limit?: number | null
          title?: string
          total_questions?: number | null
          updated_at?: string
          year_section?: string | null
        }
        Relationships: []
      }
      test_versions: {
        Row: {
          answer_key: Json
          created_at: string
          id: string
          question_order: string[] | null
          questions: Json
          test_metadata_id: string
          total_points: number | null
          version_label: string
        }
        Insert: {
          answer_key: Json
          created_at?: string
          id?: string
          question_order?: string[] | null
          questions: Json
          test_metadata_id: string
          total_points?: number | null
          version_label: string
        }
        Update: {
          answer_key?: Json
          created_at?: string
          id?: string
          question_order?: string[] | null
          questions?: Json
          test_metadata_id?: string
          total_points?: number | null
          version_label?: string
        }
        Relationships: [
          {
            foreignKeyName: "test_versions_test_metadata_id_fkey"
            columns: ["test_metadata_id"]
            isOneToOne: false
            referencedRelation: "test_metadata"
            referencedColumns: ["id"]
          },
        ]
      }
      tos_collaborators: {
        Row: {
          can_edit: boolean
          invited_at: string
          tos_id: string
          user_id: string
        }
        Insert: {
          can_edit?: boolean
          invited_at?: string
          tos_id: string
          user_id: string
        }
        Update: {
          can_edit?: boolean
          invited_at?: string
          tos_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tos_collaborators_tos_id_fkey"
            columns: ["tos_id"]
            isOneToOne: false
            referencedRelation: "tos_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tos_collaborators_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tos_entries: {
        Row: {
          bloom_distribution: Json | null
          checked_by: string | null
          course: string
          created_at: string
          created_by: string | null
          description: string | null
          distribution: Json | null
          exam_period: string | null
          id: string
          matrix: Json | null
          noted_by: string | null
          owner: string | null
          prepared_by: string
          school_year: string
          subject_no: string | null
          title: string
          topics: Json | null
          total_items: number
          updated_at: string
          year_section: string | null
        }
        Insert: {
          bloom_distribution?: Json | null
          checked_by?: string | null
          course: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          distribution?: Json | null
          exam_period?: string | null
          id?: string
          matrix?: Json | null
          noted_by?: string | null
          owner?: string | null
          prepared_by: string
          school_year: string
          subject_no?: string | null
          title: string
          topics?: Json | null
          total_items: number
          updated_at?: string
          year_section?: string | null
        }
        Update: {
          bloom_distribution?: Json | null
          checked_by?: string | null
          course?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          distribution?: Json | null
          exam_period?: string | null
          id?: string
          matrix?: Json | null
          noted_by?: string | null
          owner?: string | null
          prepared_by?: string
          school_year?: string
          subject_no?: string | null
          title?: string
          topics?: Json | null
          total_items?: number
          updated_at?: string
          year_section?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tos_entries_owner_fkey"
            columns: ["owner"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_analytics: {
        Row: {
          created_at: string
          event_data: Json | null
          event_type: string
          id: string
          ip_address: unknown
          occurred_at: string
          session_id: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          event_data?: Json | null
          event_type: string
          id?: string
          ip_address?: unknown
          occurred_at?: string
          session_id?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          event_data?: Json | null
          event_type?: string
          id?: string
          ip_address?: unknown
          occurred_at?: string
          session_id?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_analytics_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_drafts: {
        Row: {
          created_at: string
          draft_key: string
          id: string
          payload: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          draft_key: string
          id?: string
          payload?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          draft_key?: string
          id?: string
          payload?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          granted_at: string
          granted_by: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          granted_at?: string
          granted_by?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          granted_at?: string
          granted_by?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_settings: {
        Row: {
          created_at: string
          settings: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          settings?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          settings?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      version_security_logs: {
        Row: {
          detected_at: string
          event_data: Json | null
          event_type: string
          id: string
          severity: string
          test_version_id: string
        }
        Insert: {
          detected_at?: string
          event_data?: Json | null
          event_type: string
          id?: string
          severity?: string
          test_version_id: string
        }
        Update: {
          detected_at?: string
          event_data?: Json | null
          event_type?: string
          id?: string
          severity?: string
          test_version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "version_security_logs_test_version_id_fkey"
            columns: ["test_version_id"]
            isOneToOne: false
            referencedRelation: "test_versions"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      assign_admin_role: { Args: { user_email: string }; Returns: undefined }
      assign_user_role: {
        Args: { new_role: string; target_user_id: string }
        Returns: undefined
      }
      calculate_similarity_metrics: {
        Args: never
        Returns: {
          avg_similarity: number
          high_similarity_pairs: number
          max_similarity: number
          total_pairs: number
        }[]
      }
      can_access_tos: { Args: { tos_owner: string }; Returns: boolean }
      check_question_similarity: {
        Args: {
          p_bloom_level: string
          p_question_text: string
          p_threshold?: number
          p_topic: string
        }
        Returns: {
          question_text: string
          similar_question_id: string
          similarity_score: number
        }[]
      }
      cleanup_old_presence: { Args: never; Returns: undefined }
      get_available_test_versions: {
        Args: { p_parent_test_id: string }
        Returns: {
          assignment_count: number
          version_id: string
          version_number: number
        }[]
      }
      get_current_user_role: { Args: never; Returns: string }
      get_user_question_stats: {
        Args: { user_uuid: string }
        Returns: {
          approved_count: number
          bloom_level: string
          count: number
          difficulty: string
          knowledge_dimension: string
        }[]
      }
      get_user_role: { Args: { user_id: string }; Returns: string }
      get_validation_statistics: {
        Args: never
        Returns: {
          accepted_count: number
          avg_confidence: number
          modified_count: number
          rejected_count: number
          total_validations: number
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      increment_usage_count: {
        Args: { question_id: string }
        Returns: undefined
      }
      is_admin:
        | { Args: never; Returns: boolean }
        | { Args: { uid: string }; Returns: boolean }
      is_document_collaborator: {
        Args: { p_document_id: string; p_document_type: string }
        Returns: boolean
      }
      is_teacher_or_admin: { Args: { user_id: string }; Returns: boolean }
      is_tos_collaborator: { Args: { p_tos_id: string }; Returns: boolean }
      is_tos_owner: { Args: { p_tos_id: string }; Returns: boolean }
      log_classification_metric: {
        Args: {
          p_cognitive_level: string
          p_confidence: number
          p_question_id: string
          p_response_time_ms: number
        }
        Returns: undefined
      }
      mark_question_used: {
        Args: { p_question_id: string; p_test_id: string }
        Returns: undefined
      }
      validate_tos_exists: { Args: { p_tos_id: string }; Returns: boolean }
      validate_version_balance: {
        Args: { p_parent_test_id: string }
        Returns: {
          is_balanced: boolean
          max_diff: number
          warning_message: string
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "teacher"
      bloom_taxonomy:
        | "remember"
        | "understand"
        | "apply"
        | "analyze"
        | "evaluate"
        | "create"
      difficulty_level: "easy" | "medium" | "hard"
      question_type: "multiple_choice" | "true_false" | "essay" | "fill_blank"
      user_role: "admin" | "teacher"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "teacher"],
      bloom_taxonomy: [
        "remember",
        "understand",
        "apply",
        "analyze",
        "evaluate",
        "create",
      ],
      difficulty_level: ["easy", "medium", "hard"],
      question_type: ["multiple_choice", "true_false", "essay", "fill_blank"],
      user_role: ["admin", "teacher"],
    },
  },
} as const
