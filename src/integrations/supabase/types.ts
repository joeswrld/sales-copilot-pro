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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      call_summaries: {
        Row: {
          call_id: string
          created_at: string
          id: string
          key_decisions: string[] | null
          next_steps: string[] | null
          objections: Json | null
          summary: string | null
          topics: string[] | null
          transcript: Json | null
          user_id: string
        }
        Insert: {
          call_id: string
          created_at?: string
          id?: string
          key_decisions?: string[] | null
          next_steps?: string[] | null
          objections?: Json | null
          summary?: string | null
          topics?: string[] | null
          transcript?: Json | null
          user_id: string
        }
        Update: {
          call_id?: string
          created_at?: string
          id?: string
          key_decisions?: string[] | null
          next_steps?: string[] | null
          objections?: Json | null
          summary?: string | null
          topics?: string[] | null
          transcript?: Json | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "call_summaries_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "calls"
            referencedColumns: ["id"]
          },
        ]
      }
      calls: {
        Row: {
          created_at: string
          date: string
          deal_score: string | null
          duration_minutes: number | null
          end_time: string | null
          id: string
          meeting_id: string | null
          meeting_provider: string | null
          meeting_url: string | null
          name: string
          objections_count: number | null
          participants: string[] | null
          platform: string | null
          sentiment_score: number | null
          start_time: string | null
          status: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          date?: string
          deal_score?: string | null
          duration_minutes?: number | null
          end_time?: string | null
          id?: string
          meeting_id?: string | null
          meeting_provider?: string | null
          meeting_url?: string | null
          name: string
          objections_count?: number | null
          participants?: string[] | null
          platform?: string | null
          sentiment_score?: number | null
          start_time?: string | null
          status?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          date?: string
          deal_score?: string | null
          duration_minutes?: number | null
          end_time?: string | null
          id?: string
          meeting_id?: string | null
          meeting_provider?: string | null
          meeting_url?: string | null
          name?: string
          objections_count?: number | null
          participants?: string[] | null
          platform?: string | null
          sentiment_score?: number | null
          start_time?: string | null
          status?: string | null
          user_id?: string
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          role: string
          user_id: string
        }
        Insert: {
          content: string
          conversation_id?: string
          created_at?: string
          id?: string
          role: string
          user_id: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: []
      }
      conversation_participants: {
        Row: {
          conversation_id: string
          id: string
          last_read_at: string | null
          user_id: string
        }
        Insert: {
          conversation_id: string
          id?: string
          last_read_at?: string | null
          user_id: string
        }
        Update: {
          conversation_id?: string
          id?: string
          last_read_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_participants_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "team_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_sync_logs: {
        Row: {
          call_id: string
          created_at: string
          id: string
          provider: string
          response_payload: Json | null
          status: string
          user_id: string
        }
        Insert: {
          call_id: string
          created_at?: string
          id?: string
          provider: string
          response_payload?: Json | null
          status?: string
          user_id: string
        }
        Update: {
          call_id?: string
          created_at?: string
          id?: string
          provider?: string
          response_payload?: Json | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      integrations: {
        Row: {
          access_token_encrypted: string | null
          channel_id: string | null
          created_at: string
          expires_at: string | null
          id: string
          instance_url: string | null
          provider: string
          refresh_token_encrypted: string | null
          status: string
          user_id: string
        }
        Insert: {
          access_token_encrypted?: string | null
          channel_id?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          instance_url?: string | null
          provider: string
          refresh_token_encrypted?: string | null
          status?: string
          user_id: string
        }
        Update: {
          access_token_encrypted?: string | null
          channel_id?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          instance_url?: string | null
          provider?: string
          refresh_token_encrypted?: string | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      key_topics: {
        Row: {
          call_id: string
          detected_at: string
          id: string
          topic: string
          user_id: string
        }
        Insert: {
          call_id: string
          detected_at?: string
          id?: string
          topic: string
          user_id: string
        }
        Update: {
          call_id?: string
          detected_at?: string
          id?: string
          topic?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "key_topics_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "calls"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_comments: {
        Row: {
          comment_text: string
          created_at: string
          id: string
          meeting_id: string
          parent_id: string | null
          user_id: string
        }
        Insert: {
          comment_text: string
          created_at?: string
          id?: string
          meeting_id: string
          parent_id?: string | null
          user_id: string
        }
        Update: {
          comment_text?: string
          created_at?: string
          id?: string
          meeting_id?: string
          parent_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meeting_comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "meeting_comments"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          is_read: boolean
          message: string
          reference_id: string | null
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean
          message: string
          reference_id?: string | null
          type?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string
          reference_id?: string | null
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      objections: {
        Row: {
          call_id: string
          confidence_score: number | null
          detected_at: string
          id: string
          objection_type: string
          suggestion: string | null
          user_id: string
        }
        Insert: {
          call_id: string
          confidence_score?: number | null
          detected_at?: string
          id?: string
          objection_type: string
          suggestion?: string | null
          user_id: string
        }
        Update: {
          call_id?: string
          confidence_score?: number | null
          detected_at?: string
          id?: string
          objection_type?: string
          suggestion?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "objections_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "calls"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          calls_limit: number
          calls_used: number
          created_at: string
          email: string | null
          full_name: string | null
          gdpr_consent: boolean
          id: string
          plan_type: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          calls_limit?: number
          calls_used?: number
          created_at?: string
          email?: string | null
          full_name?: string | null
          gdpr_consent?: boolean
          id: string
          plan_type?: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          calls_limit?: number
          calls_used?: number
          created_at?: string
          email?: string | null
          full_name?: string | null
          gdpr_consent?: boolean
          id?: string
          plan_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      scheduled_calls: {
        Row: {
          created_at: string
          id: string
          meeting_provider: string
          meeting_url: string | null
          scheduled_time: string
          status: string
          title: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          meeting_provider: string
          meeting_url?: string | null
          scheduled_time: string
          status?: string
          title?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          meeting_provider?: string
          meeting_url?: string | null
          scheduled_time?: string
          status?: string
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          amount_kobo: number
          card_brand: string | null
          card_last4: string | null
          created_at: string
          currency: string
          id: string
          next_payment_date: string | null
          paystack_customer_code: string | null
          paystack_email_token: string | null
          paystack_subscription_code: string | null
          plan_name: string
          plan_price_usd: number | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_kobo?: number
          card_brand?: string | null
          card_last4?: string | null
          created_at?: string
          currency?: string
          id?: string
          next_payment_date?: string | null
          paystack_customer_code?: string | null
          paystack_email_token?: string | null
          paystack_subscription_code?: string | null
          plan_name?: string
          plan_price_usd?: number | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount_kobo?: number
          card_brand?: string | null
          card_last4?: string | null
          created_at?: string
          currency?: string
          id?: string
          next_payment_date?: string | null
          paystack_customer_code?: string | null
          paystack_email_token?: string | null
          paystack_subscription_code?: string | null
          plan_name?: string
          plan_price_usd?: number | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      team_conversations: {
        Row: {
          created_at: string
          id: string
          team_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          team_id: string
        }
        Update: {
          created_at?: string
          id?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_conversations_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      team_members: {
        Row: {
          created_at: string
          id: string
          invited_email: string | null
          role: string
          status: string
          team_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          invited_email?: string | null
          role?: string
          status?: string
          team_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          invited_email?: string | null
          role?: string
          status?: string
          team_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      team_messages: {
        Row: {
          conversation_id: string
          created_at: string
          id: string
          message_text: string
          sender_id: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          id?: string
          message_text: string
          sender_id: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          id?: string
          message_text?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "team_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          created_at: string
          created_by: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          name?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      transcripts: {
        Row: {
          call_id: string
          id: string
          speaker: string
          text: string
          timestamp: string
          user_id: string
        }
        Insert: {
          call_id: string
          id?: string
          speaker: string
          text: string
          timestamp?: string
          user_id: string
        }
        Update: {
          call_id?: string
          id?: string
          speaker?: string
          text?: string
          timestamp?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transcripts_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "calls"
            referencedColumns: ["id"]
          },
        ]
      }
      user_preferences: {
        Row: {
          auto_join_meetings: boolean
          crm_auto_sync: boolean
          id: string
          post_call_email_summary: boolean
          real_time_objection_alerts: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          auto_join_meetings?: boolean
          crm_auto_sync?: boolean
          id?: string
          post_call_email_summary?: boolean
          real_time_objection_alerts?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          auto_join_meetings?: boolean
          crm_auto_sync?: boolean
          id?: string
          post_call_email_summary?: boolean
          real_time_objection_alerts?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_team_with_owner: {
        Args: { team_name?: string }
        Returns: {
          created_at: string
          created_by: string
          id: string
          name: string
        }
        SetofOptions: {
          from: "*"
          to: "teams"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_team_role: {
        Args: { _team_id: string; _user_id: string }
        Returns: string
      }
      is_team_member: {
        Args: { _team_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
