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
      certificates: {
        Row: {
          created_at: string
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
      documents: {
        Row: {
          admin_notes: string | null
          created_at: string
          created_by: string | null
          description: string | null
          estimated_completion: string | null
          file_name: string
          file_size: number | null
          id: string
          mime_type: string | null
          organization_id: string | null
          status: string
          storage_path: string
          submitted_at: string
          title: string
          trademark_id: string | null
          updated_at: string
        }
        Insert: {
          admin_notes?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          estimated_completion?: string | null
          file_name: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          organization_id?: string | null
          status?: string
          storage_path: string
          submitted_at?: string
          title: string
          trademark_id?: string | null
          updated_at?: string
        }
        Update: {
          admin_notes?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          estimated_completion?: string | null
          file_name?: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          organization_id?: string | null
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
            foreignKeyName: "documents_trademark_id_fkey"
            columns: ["trademark_id"]
            isOneToOne: false
            referencedRelation: "trademarks"
            referencedColumns: ["id"]
          },
        ]
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
      support_notifications: {
        Row: {
          created_at: string
          id: string
          read_at: string | null
          recipient_id: string
          support_request_id: string
          type: Database["public"]["Enums"]["support_notification_type"]
        }
        Insert: {
          created_at?: string
          id?: string
          read_at?: string | null
          recipient_id: string
          support_request_id: string
          type: Database["public"]["Enums"]["support_notification_type"]
        }
        Update: {
          created_at?: string
          id?: string
          read_at?: string | null
          recipient_id?: string
          support_request_id?: string
          type?: Database["public"]["Enums"]["support_notification_type"]
        }
        Relationships: [
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
      trademarks: {
        Row: {
          admin_notes: string | null
          created_at: string
          created_by: string | null
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
    }
    Enums: {
      app_role: "admin" | "cliente"
      shared_resource_type: "trademark" | "document" | "certificate"
      support_notification_type: "new_support_request" | "support_response"
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
      support_notification_type: ["new_support_request", "support_response"],
    },
  },
} as const
