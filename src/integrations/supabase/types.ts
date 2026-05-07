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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      ai_conversations: {
        Row: {
          active_intent: string | null
          created_at: string | null
          id: string
          last_message_at: string | null
          messages: Json | null
          title: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          active_intent?: string | null
          created_at?: string | null
          id?: string
          last_message_at?: string | null
          messages?: Json | null
          title?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          active_intent?: string | null
          created_at?: string | null
          id?: string
          last_message_at?: string | null
          messages?: Json | null
          title?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      ai_generation_logs: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string | null
          generated_by: string | null
          generation_type: string
          id: string
          metadata: Json | null
          model_used: string | null
          prompt_used: string | null
          question_id: string | null
          rejection_reason: string | null
          tos_id: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string | null
          generated_by?: string | null
          generation_type?: string
          id?: string
          metadata?: Json | null
          model_used?: string | null
          prompt_used?: string | null
          question_id?: string | null
          rejection_reason?: string | null
          tos_id?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string | null
          generated_by?: string | null
          generation_type?: string
          id?: string
          metadata?: Json | null
          model_used?: string | null
          prompt_used?: string | null
          question_id?: string | null
          rejection_reason?: string | null
          tos_id?: string | null
        }
        Relationships: []
      }
      assembly_versions: {
        Row: {
          assembly_id: string | null
          created_at: string | null
          id: string
          metadata: Json | null
          question_order: Json | null
          shuffle_seed: string | null
          updated_at: string | null
          version_label: string | null
        }
        Insert: {
          assembly_id?: string | null
          created_at?: string | null
          id?: string
          metadata?: Json | null
          question_order?: Json | null
          shuffle_seed?: string | null
          updated_at?: string | null
          version_label?: string | null
        }
        Update: {
          assembly_id?: string | null
          created_at?: string | null
          id?: string
          metadata?: Json | null
          question_order?: Json | null
          shuffle_seed?: string | null
          updated_at?: string | null
          version_label?: string | null
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
          confidence_score: number | null
          created_at: string | null
          created_by: string | null
          id: string
          metadata: Json | null
          notes: string | null
          original_bloom_level: string | null
          original_classification: Json | null
          original_difficulty: string | null
          original_knowledge_dimension: string | null
          question_id: string | null
          reviewer_id: string | null
          reviewer_notes: string | null
          suggested_bloom_level: string | null
          suggested_difficulty: string | null
          suggested_knowledge_dimension: string | null
          updated_at: string | null
          validated_classification: Json | null
          validation_confidence: number | null
          validation_status: string | null
          validation_type: string | null
          validator_id: string | null
        }
        Insert: {
          confidence_score?: number | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          metadata?: Json | null
          notes?: string | null
          original_bloom_level?: string | null
          original_classification?: Json | null
          original_difficulty?: string | null
          original_knowledge_dimension?: string | null
          question_id?: string | null
          reviewer_id?: string | null
          reviewer_notes?: string | null
          suggested_bloom_level?: string | null
          suggested_difficulty?: string | null
          suggested_knowledge_dimension?: string | null
          updated_at?: string | null
          validated_classification?: Json | null
          validation_confidence?: number | null
          validation_status?: string | null
          validation_type?: string | null
          validator_id?: string | null
        }
        Update: {
          confidence_score?: number | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          metadata?: Json | null
          notes?: string | null
          original_bloom_level?: string | null
          original_classification?: Json | null
          original_difficulty?: string | null
          original_knowledge_dimension?: string | null
          question_id?: string | null
          reviewer_id?: string | null
          reviewer_notes?: string | null
          suggested_bloom_level?: string | null
          suggested_difficulty?: string | null
          suggested_knowledge_dimension?: string | null
          updated_at?: string | null
          validated_classification?: Json | null
          validation_confidence?: number | null
          validation_status?: string | null
          validation_type?: string | null
          validator_id?: string | null
        }
        Relationships: []
      }
      collaboration_messages: {
        Row: {
          created_at: string | null
          document_id: string
          document_type: string | null
          id: string
          message: string
          timestamp: string | null
          user_email: string | null
          user_id: string | null
          user_name: string | null
        }
        Insert: {
          created_at?: string | null
          document_id: string
          document_type?: string | null
          id?: string
          message: string
          timestamp?: string | null
          user_email?: string | null
          user_id?: string | null
          user_name?: string | null
        }
        Update: {
          created_at?: string | null
          document_id?: string
          document_type?: string | null
          id?: string
          message?: string
          timestamp?: string | null
          user_email?: string | null
          user_id?: string | null
          user_name?: string | null
        }
        Relationships: []
      }
      document_activity: {
        Row: {
          action_details: Json | null
          action_type: string
          created_at: string | null
          document_id: string
          document_type: string
          id: string
          timestamp: string | null
          user_email: string | null
          user_id: string | null
          user_name: string | null
        }
        Insert: {
          action_details?: Json | null
          action_type: string
          created_at?: string | null
          document_id: string
          document_type: string
          id?: string
          timestamp?: string | null
          user_email?: string | null
          user_id?: string | null
          user_name?: string | null
        }
        Update: {
          action_details?: Json | null
          action_type?: string
          created_at?: string | null
          document_id?: string
          document_type?: string
          id?: string
          timestamp?: string | null
          user_email?: string | null
          user_id?: string | null
          user_name?: string | null
        }
        Relationships: []
      }
      educational_standards: {
        Row: {
          category: string
          code: string
          created_at: string | null
          description: string | null
          framework: string | null
          grade_level: string | null
          id: string
          metadata: Json | null
          parent_standard_id: string | null
          subject_area: string
          title: string
          updated_at: string | null
        }
        Insert: {
          category?: string
          code: string
          created_at?: string | null
          description?: string | null
          framework?: string | null
          grade_level?: string | null
          id?: string
          metadata?: Json | null
          parent_standard_id?: string | null
          subject_area?: string
          title: string
          updated_at?: string | null
        }
        Update: {
          category?: string
          code?: string
          created_at?: string | null
          description?: string | null
          framework?: string | null
          grade_level?: string | null
          id?: string
          metadata?: Json | null
          parent_standard_id?: string | null
          subject_area?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      generated_tests: {
        Row: {
          answer_key: Json | null
          answer_keys: Json | null
          course: string | null
          created_at: string | null
          created_by: string | null
          exam_period: string | null
          id: string
          instructions: string | null
          items: Json | null
          num_versions: number | null
          owner: string | null
          parent_test_id: string | null
          points_per_question: number | null
          school_year: string | null
          shuffle_choices: boolean | null
          shuffle_questions: boolean | null
          subject: string | null
          test_title: string | null
          time_limit: number | null
          title: string | null
          tos_id: string | null
          total_points: number | null
          updated_at: string | null
          version_label: string | null
          version_number: number | null
          versions: Json | null
          year_section: string | null
        }
        Insert: {
          answer_key?: Json | null
          answer_keys?: Json | null
          course?: string | null
          created_at?: string | null
          created_by?: string | null
          exam_period?: string | null
          id?: string
          instructions?: string | null
          items?: Json | null
          num_versions?: number | null
          owner?: string | null
          parent_test_id?: string | null
          points_per_question?: number | null
          school_year?: string | null
          shuffle_choices?: boolean | null
          shuffle_questions?: boolean | null
          subject?: string | null
          test_title?: string | null
          time_limit?: number | null
          title?: string | null
          tos_id?: string | null
          total_points?: number | null
          updated_at?: string | null
          version_label?: string | null
          version_number?: number | null
          versions?: Json | null
          year_section?: string | null
        }
        Update: {
          answer_key?: Json | null
          answer_keys?: Json | null
          course?: string | null
          created_at?: string | null
          created_by?: string | null
          exam_period?: string | null
          id?: string
          instructions?: string | null
          items?: Json | null
          num_versions?: number | null
          owner?: string | null
          parent_test_id?: string | null
          points_per_question?: number | null
          school_year?: string | null
          shuffle_choices?: boolean | null
          shuffle_questions?: boolean | null
          subject?: string | null
          test_title?: string | null
          time_limit?: number | null
          title?: string | null
          tos_id?: string | null
          total_points?: number | null
          updated_at?: string | null
          version_label?: string | null
          version_number?: number | null
          versions?: Json | null
          year_section?: string | null
        }
        Relationships: []
      }
      learning_competencies: {
        Row: {
          competencies: Json | null
          created_at: string | null
          hours: number | null
          id: string
          topic_name: string
          tos_id: string | null
          updated_at: string | null
        }
        Insert: {
          competencies?: Json | null
          created_at?: string | null
          hours?: number | null
          id?: string
          topic_name: string
          tos_id?: string | null
          updated_at?: string | null
        }
        Update: {
          competencies?: Json | null
          created_at?: string | null
          hours?: number | null
          id?: string
          topic_name?: string
          tos_id?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          college: string | null
          created_at: string | null
          email: string | null
          full_name: string | null
          id: string
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          college?: string | null
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id: string
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          college?: string | null
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      question_similarities: {
        Row: {
          algorithm_used: string | null
          created_at: string | null
          id: string
          question1_id: string
          question2_id: string
          similarity_score: number
        }
        Insert: {
          algorithm_used?: string | null
          created_at?: string | null
          id?: string
          question1_id: string
          question2_id: string
          similarity_score?: number
        }
        Update: {
          algorithm_used?: string | null
          created_at?: string | null
          id?: string
          question1_id?: string
          question2_id?: string
          similarity_score?: number
        }
        Relationships: []
      }
      question_standards: {
        Row: {
          alignment_strength: number
          created_at: string | null
          id: string
          notes: string | null
          question_id: string
          standard_id: string
          validated_at: string | null
          validated_by: string | null
        }
        Insert: {
          alignment_strength?: number
          created_at?: string | null
          id?: string
          notes?: string | null
          question_id: string
          standard_id: string
          validated_at?: string | null
          validated_by?: string | null
        }
        Update: {
          alignment_strength?: number
          created_at?: string | null
          id?: string
          notes?: string | null
          question_id?: string
          standard_id?: string
          validated_at?: string | null
          validated_by?: string | null
        }
        Relationships: []
      }
      questions: {
        Row: {
          ai_confidence_score: number | null
          approval_notes: string | null
          approval_timestamp: string | null
          approved: boolean
          approved_by: string | null
          bloom_level: string
          category: string | null
          choices: Json | null
          classification_confidence: number | null
          cognitive_level: string | null
          correct_answer: string | null
          created_at: string | null
          created_by: string | null
          deleted: boolean | null
          difficulty: string
          grade_level: string | null
          id: string
          knowledge_dimension: string | null
          metadata: Json | null
          needs_review: boolean | null
          owner: string | null
          quality_score: number | null
          question_text: string
          question_type: string
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
          updated_at: string | null
          used_count: number | null
          used_history: Json | null
          validated_by: string | null
          validation_status: string | null
          validation_timestamp: string | null
        }
        Insert: {
          ai_confidence_score?: number | null
          approval_notes?: string | null
          approval_timestamp?: string | null
          approved?: boolean
          approved_by?: string | null
          bloom_level?: string
          category?: string | null
          choices?: Json | null
          classification_confidence?: number | null
          cognitive_level?: string | null
          correct_answer?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted?: boolean | null
          difficulty?: string
          grade_level?: string | null
          id?: string
          knowledge_dimension?: string | null
          metadata?: Json | null
          needs_review?: boolean | null
          owner?: string | null
          quality_score?: number | null
          question_text: string
          question_type?: string
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
          updated_at?: string | null
          used_count?: number | null
          used_history?: Json | null
          validated_by?: string | null
          validation_status?: string | null
          validation_timestamp?: string | null
        }
        Update: {
          ai_confidence_score?: number | null
          approval_notes?: string | null
          approval_timestamp?: string | null
          approved?: boolean
          approved_by?: string | null
          bloom_level?: string
          category?: string | null
          choices?: Json | null
          classification_confidence?: number | null
          cognitive_level?: string | null
          correct_answer?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted?: boolean | null
          difficulty?: string
          grade_level?: string | null
          id?: string
          knowledge_dimension?: string | null
          metadata?: Json | null
          needs_review?: boolean | null
          owner?: string | null
          quality_score?: number | null
          question_text?: string
          question_type?: string
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
          updated_at?: string | null
          used_count?: number | null
          used_history?: Json | null
          validated_by?: string | null
          validation_status?: string | null
          validation_timestamp?: string | null
        }
        Relationships: []
      }
      system_settings: {
        Row: {
          created_at: string | null
          id: string
          key: string
          updated_at: string | null
          updated_by: string | null
          value: Json | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          key: string
          updated_at?: string | null
          updated_by?: string | null
          value?: Json | null
        }
        Update: {
          created_at?: string | null
          id?: string
          key?: string
          updated_at?: string | null
          updated_by?: string | null
          value?: Json | null
        }
        Relationships: []
      }
      test_assemblies: {
        Row: {
          created_at: string | null
          created_by: string
          id: string
          metadata: Json | null
          params: Json | null
          status: string | null
          title: string
          tos_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by: string
          id?: string
          metadata?: Json | null
          params?: Json | null
          status?: string | null
          title: string
          tos_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string
          id?: string
          metadata?: Json | null
          params?: Json | null
          status?: string | null
          title?: string
          tos_id?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      test_exports: {
        Row: {
          created_at: string | null
          export_type: string
          exported_by: string | null
          exported_by_user: string | null
          file_name: string | null
          generated_test_id: string | null
          id: string
          storage_url: string | null
          test_version_id: string | null
        }
        Insert: {
          created_at?: string | null
          export_type: string
          exported_by?: string | null
          exported_by_user?: string | null
          file_name?: string | null
          generated_test_id?: string | null
          id?: string
          storage_url?: string | null
          test_version_id?: string | null
        }
        Update: {
          created_at?: string | null
          export_type?: string
          exported_by?: string | null
          exported_by_user?: string | null
          file_name?: string | null
          generated_test_id?: string | null
          id?: string
          storage_url?: string | null
          test_version_id?: string | null
        }
        Relationships: []
      }
      tos_entries: {
        Row: {
          approved_by: string | null
          bloom_distribution: Json | null
          checked_by: string | null
          course: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          distribution: Json | null
          exam_period: string | null
          id: string
          matrix: Json | null
          noted_by: string | null
          owner: string | null
          period: string | null
          prepared_by: string | null
          school_year: string | null
          subject: string | null
          subject_code: string | null
          subject_description: string | null
          subject_no: string | null
          title: string | null
          topics: Json | null
          total_items: number | null
          updated_at: string | null
          year_section: string | null
        }
        Insert: {
          approved_by?: string | null
          bloom_distribution?: Json | null
          checked_by?: string | null
          course?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          distribution?: Json | null
          exam_period?: string | null
          id?: string
          matrix?: Json | null
          noted_by?: string | null
          owner?: string | null
          period?: string | null
          prepared_by?: string | null
          school_year?: string | null
          subject?: string | null
          subject_code?: string | null
          subject_description?: string | null
          subject_no?: string | null
          title?: string | null
          topics?: Json | null
          total_items?: number | null
          updated_at?: string | null
          year_section?: string | null
        }
        Update: {
          approved_by?: string | null
          bloom_distribution?: Json | null
          checked_by?: string | null
          course?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          distribution?: Json | null
          exam_period?: string | null
          id?: string
          matrix?: Json | null
          noted_by?: string | null
          owner?: string | null
          period?: string | null
          prepared_by?: string | null
          school_year?: string | null
          subject?: string | null
          subject_code?: string | null
          subject_description?: string | null
          subject_no?: string | null
          title?: string | null
          topics?: Json | null
          total_items?: number | null
          updated_at?: string | null
          year_section?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_settings: {
        Row: {
          created_at: string | null
          id: string
          settings: Json | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          settings?: Json | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          settings?: Json | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      calculate_similarity_metrics: { Args: never; Returns: Json }
      check_question_similarity: {
        Args: {
          p_bloom_level?: string
          p_question_text: string
          p_threshold?: number
          p_topic?: string
        }
        Returns: {
          similar_question_id: string
          similarity_score: number
        }[]
      }
      cleanup_old_presence: { Args: never; Returns: number }
      get_user_question_stats: { Args: { user_uuid: string }; Returns: Json }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      log_classification_metric: {
        Args: {
          p_cognitive_level?: string
          p_confidence?: number
          p_question_id?: string
          p_response_time_ms?: number
        }
        Returns: undefined
      }
      mark_question_used: {
        Args: { p_question_id: string; p_test_id?: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "teacher"
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
    },
  },
} as const
