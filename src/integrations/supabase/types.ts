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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      ai_question_usage: {
        Row: {
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_usage_daily: {
        Row: {
          count: number
          day: string
          input_tokens: number
          output_tokens: number
          user_id: string
        }
        Insert: {
          count?: number
          day: string
          input_tokens?: number
          output_tokens?: number
          user_id: string
        }
        Update: {
          count?: number
          day?: string
          input_tokens?: number
          output_tokens?: number
          user_id?: string
        }
        Relationships: []
      }
      certificates: {
        Row: {
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          document_id: string | null
          file_name: string | null
          id: string
          issued_at: string
          network: string | null
          notes: string | null
          storage_path: string | null
          title: string
          trademark_id: string | null
          tx_hash: string | null
          updated_at: string
          verification_url: string | null
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          document_id?: string | null
          file_name?: string | null
          id?: string
          issued_at?: string
          network?: string | null
          notes?: string | null
          storage_path?: string | null
          title: string
          trademark_id?: string | null
          tx_hash?: string | null
          updated_at?: string
          verification_url?: string | null
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          document_id?: string | null
          file_name?: string | null
          id?: string
          issued_at?: string
          network?: string | null
          notes?: string | null
          storage_path?: string | null
          title?: string
          trademark_id?: string | null
          tx_hash?: string | null
          updated_at?: string
          verification_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "certificates_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificates_trademark_id_fkey"
            columns: ["trademark_id"]
            isOneToOne: false
            referencedRelation: "trademarks"
            referencedColumns: ["id"]
          },
        ]
      }
      document_events: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          details: Json
          document_id: string
          id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          details?: Json
          document_id: string
          id?: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          details?: Json
          document_id?: string
          id?: string
        }
        Relationships: []
      }
      documents: {
        Row: {
          admin_notes: string | null
          archived_at: string | null
          archived_by: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          estimated_completion: string | null
          file_name: string
          file_size: number | null
          id: string
          is_additional: boolean
          mime_type: string | null
          organization_id: string | null
          process_start_confirmed_at: string | null
          process_start_confirmed_by: string | null
          process_started_at: string | null
          related_document_id: string | null
          status: string
          storage_path: string
          submitted_at: string
          title: string
          trademark_id: string | null
          updated_at: string
        }
        Insert: {
          admin_notes?: string | null
          archived_at?: string | null
          archived_by?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          estimated_completion?: string | null
          file_name: string
          file_size?: number | null
          id?: string
          is_additional?: boolean
          mime_type?: string | null
          organization_id?: string | null
          process_start_confirmed_at?: string | null
          process_start_confirmed_by?: string | null
          process_started_at?: string | null
          related_document_id?: string | null
          status?: string
          storage_path: string
          submitted_at?: string
          title: string
          trademark_id?: string | null
          updated_at?: string
        }
        Update: {
          admin_notes?: string | null
          archived_at?: string | null
          archived_by?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          estimated_completion?: string | null
          file_name?: string
          file_size?: number | null
          id?: string
          is_additional?: boolean
          mime_type?: string | null
          organization_id?: string | null
          process_start_confirmed_at?: string | null
          process_start_confirmed_by?: string | null
          process_started_at?: string | null
          related_document_id?: string | null
          status?: string
          storage_path?: string
          submitted_at?: string
          title?: string
          trademark_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_related_document_id_fkey"
            columns: ["related_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_trademark_id_fkey"
            columns: ["trademark_id"]
            isOneToOne: false
            referencedRelation: "trademarks"
            referencedColumns: ["id"]
          },
        ]
      }
      internal_config: {
        Row: {
          created_at: string
          key: string
          value: string
        }
        Insert: {
          created_at?: string
          key: string
          value: string
        }
        Update: {
          created_at?: string
          key?: string
          value?: string
        }
        Relationships: []
      }
      organization_members: {
        Row: {
          created_at: string
          id: string
          organization_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          name: string
          notes: string | null
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      page_visits: {
        Row: {
          created_at: string
          id: string
          page_title: string | null
          path: string
          user_agent: string | null
          user_id: string
          visited_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          page_title?: string | null
          path: string
          user_agent?: string | null
          user_id: string
          visited_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          page_title?: string | null
          path?: string
          user_agent?: string | null
          user_id?: string
          visited_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
        }
        Relationships: []
      }
      resource_lifecycle_events: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          details: Json
          id: string
          resource_id: string
          resource_type: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          resource_id: string
          resource_type: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          resource_id?: string
          resource_type?: string
        }
        Relationships: []
      }
      resource_shares: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          note: string | null
          resource_id: string
          resource_type: Database["public"]["Enums"]["shared_resource_type"]
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          resource_id: string
          resource_type: Database["public"]["Enums"]["shared_resource_type"]
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          resource_id?: string
          resource_type?: Database["public"]["Enums"]["shared_resource_type"]
          user_id?: string
        }
        Relationships: []
      }
      resource_views: {
        Row: {
          action: string
          id: string
          resource_id: string
          resource_type: Database["public"]["Enums"]["shared_resource_type"]
          user_id: string
          viewed_at: string
        }
        Insert: {
          action?: string
          id?: string
          resource_id: string
          resource_type: Database["public"]["Enums"]["shared_resource_type"]
          user_id: string
          viewed_at?: string
        }
        Update: {
          action?: string
          id?: string
          resource_id?: string
          resource_type?: Database["public"]["Enums"]["shared_resource_type"]
          user_id?: string
          viewed_at?: string
        }
        Relationships: []
      }
      restoration_candidates: {
        Row: {
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision: string
          decision_note: string | null
          dependencies: Json
          file_bucket: string | null
          file_path: string | null
          id: string
          organization_label: string | null
          original_date: string | null
          owner_label: string | null
          payload: Json
          previous_id: string | null
          resource_type: string
          source_label: string
          title: string | null
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision?: string
          decision_note?: string | null
          dependencies?: Json
          file_bucket?: string | null
          file_path?: string | null
          id?: string
          organization_label?: string | null
          original_date?: string | null
          owner_label?: string | null
          payload?: Json
          previous_id?: string | null
          resource_type: string
          source_label: string
          title?: string | null
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision?: string
          decision_note?: string | null
          dependencies?: Json
          file_bucket?: string | null
          file_path?: string | null
          id?: string
          organization_label?: string | null
          original_date?: string | null
          owner_label?: string | null
          payload?: Json
          previous_id?: string | null
          resource_type?: string
          source_label?: string
          title?: string | null
        }
        Relationships: []
      }
      support_notifications: {
        Row: {
          certificate_id: string | null
          created_at: string
          document_id: string | null
          id: string
          read_at: string | null
          recipient_id: string
          support_request_id: string | null
          type: Database["public"]["Enums"]["support_notification_type"]
        }
        Insert: {
          certificate_id?: string | null
          created_at?: string
          document_id?: string | null
          id?: string
          read_at?: string | null
          recipient_id: string
          support_request_id?: string | null
          type: Database["public"]["Enums"]["support_notification_type"]
        }
        Update: {
          certificate_id?: string | null
          created_at?: string
          document_id?: string | null
          id?: string
          read_at?: string | null
          recipient_id?: string
          support_request_id?: string | null
          type?: Database["public"]["Enums"]["support_notification_type"]
        }
        Relationships: [
          {
            foreignKeyName: "support_notifications_certificate_id_fkey"
            columns: ["certificate_id"]
            isOneToOne: false
            referencedRelation: "certificates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_notifications_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_notifications_support_request_id_fkey"
            columns: ["support_request_id"]
            isOneToOne: false
            referencedRelation: "support_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      support_requests: {
        Row: {
          admin_reply: string | null
          created_at: string
          created_by: string | null
          id: string
          message: string
          status: string
          subject: string
          updated_at: string
        }
        Insert: {
          admin_reply?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          message: string
          status?: string
          subject: string
          updated_at?: string
        }
        Update: {
          admin_reply?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          message?: string
          status?: string
          subject?: string
          updated_at?: string
        }
        Relationships: []
      }
      test_markers: {
        Row: {
          created_at: string
          id: string
          marked_by: string
          note: string | null
          resource_id: string
          resource_type: string
        }
        Insert: {
          created_at?: string
          id?: string
          marked_by: string
          note?: string | null
          resource_id: string
          resource_type: string
        }
        Update: {
          created_at?: string
          id?: string
          marked_by?: string
          note?: string | null
          resource_id?: string
          resource_type?: string
        }
        Relationships: []
      }
      trademarks: {
        Row: {
          admin_notes: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          holder: string | null
          id: string
          name: string
          nice_class: string | null
          notes: string | null
          organization_id: string | null
          protocol_number: string | null
          segment: string | null
          status: string
          submitted_at: string
          updated_at: string
        }
        Insert: {
          admin_notes?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          holder?: string | null
          id?: string
          name: string
          nice_class?: string | null
          notes?: string | null
          organization_id?: string | null
          protocol_number?: string | null
          segment?: string | null
          status?: string
          submitted_at?: string
          updated_at?: string
        }
        Update: {
          admin_notes?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          holder?: string | null
          id?: string
          name?: string
          nice_class?: string | null
          notes?: string | null
          organization_id?: string | null
          protocol_number?: string | null
          segment?: string | null
          status?: string
          submitted_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trademarks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_ai_usage_summary: {
        Args: never
        Returns: {
          email: string
          full_name: string
          input_tokens_30d: number
          last_24h: number
          last_30d: number
          last_7d: number
          last_day: string
          output_tokens_30d: number
          total_90d: number
          user_id: string
        }[]
      }
      admin_list_user_activity: {
        Args: never
        Returns: {
          created_at: string
          email: string
          full_name: string
          last_sign_in_at: string
          roles: string[]
          user_id: string
        }[]
      }
      admin_page_visit_summary: {
        Args: never
        Returns: {
          email: string
          first_visit_at: string
          full_name: string
          last_path: string
          last_visit_at: string
          user_id: string
          visits: number
        }[]
      }
      admin_privacy_overview: {
        Args: never
        Returns: {
          check_expression: string
          command: string
          is_broad: boolean
          policy_name: string
          rls_enabled: boolean
          roles: string[]
          table_name: string
          using_expression: string
        }[]
      }
      ai_usage_status: {
        Args: { _user: string }
        Returns: {
          day_retry_at: string
          day_used: number
          hour_retry_at: string
          hour_used: number
        }[]
      }
      can_view_document: {
        Args: { _document_id: string; _user_id: string }
        Returns: boolean
      }
      can_view_storage_object: {
        Args: { _bucket: string; _path: string; _user_id: string }
        Returns: boolean
      }
      can_view_trademark: {
        Args: { _trademark_id: string; _user_id: string }
        Returns: boolean
      }
      consume_ai_question: {
        Args: { _limit_day?: number; _limit_hour?: number; _user: string }
        Returns: {
          allowed: boolean
          day_retry_at: string
          day_used: number
          hour_retry_at: string
          hour_used: number
          reason: string
        }[]
      }
      document_viewer_ids: { Args: { _doc: string }; Returns: string[] }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_share: {
        Args: {
          _resource_id: string
          _type: Database["public"]["Enums"]["shared_resource_type"]
          _user_id: string
        }
        Returns: boolean
      }
      is_org_member: {
        Args: { _org_id: string; _user_id: string }
        Returns: boolean
      }
      mark_all_support_notifications_read: {
        Args: {
          _type: Database["public"]["Enums"]["support_notification_type"]
        }
        Returns: undefined
      }
      mark_support_notification_read: {
        Args: { _notification_id: string }
        Returns: undefined
      }
      me_account_status: {
        Args: never
        Returns: {
          created_at: string
          email: string
          email_confirmed_at: string
          full_name: string
          last_sign_in_at: string
          roles: string[]
          user_id: string
        }[]
      }
      record_ai_tokens: {
        Args: { _input: number; _output: number; _user: string }
        Returns: undefined
      }
      restore_candidate: {
        Args: { _actor: string; _candidate: string }
        Returns: string
      }
      trademark_viewer_ids: { Args: { _tm: string }; Returns: string[] }
    }
    Enums: {
      app_role: "admin" | "cliente"
      shared_resource_type: "trademark" | "document" | "certificate"
      support_notification_type:
        | "new_support_request"
        | "support_response"
        | "new_document"
        | "additional_document"
        | "document_status"
        | "documents_requested"
        | "certificate_available"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: ["admin", "cliente"],
      shared_resource_type: ["trademark", "document", "certificate"],
      support_notification_type: [
        "new_support_request",
        "support_response",
        "new_document",
        "additional_document",
        "document_status",
        "documents_requested",
        "certificate_available",
      ],
    },
  },
} as const
