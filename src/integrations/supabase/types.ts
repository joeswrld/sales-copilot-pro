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
      bot_sessions: {
        Row: {
          audio_url: string | null
          bot_id: string | null
          call_id: string
          created_at: string
          error_message: string | null
          id: string
          join_attempts: number
          last_attempt_at: string | null
          meeting_url: string
          platform: string
          recording_url: string | null
          status: string
          updated_at: string
        }
        Insert: {
          audio_url?: string | null
          bot_id?: string | null
          call_id: string
          created_at?: string
          error_message?: string | null
          id?: string
          join_attempts?: number
          last_attempt_at?: string | null
          meeting_url?: string
          platform?: string
          recording_url?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          audio_url?: string | null
          bot_id?: string | null
          call_id?: string
          created_at?: string
          error_message?: string | null
          id?: string
          join_attempts?: number
          last_attempt_at?: string | null
          meeting_url?: string
          platform?: string
          recording_url?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bot_sessions_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: true
            referencedRelation: "active_live_calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bot_sessions_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: true
            referencedRelation: "calls"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_events: {
        Row: {
          attendees: Json | null
          bot_dispatched: boolean | null
          bot_id: string | null
          call_id: string | null
          created_at: string | null
          description: string | null
          end_time: string
          google_event_id: string
          id: string
          meeting_url: string | null
          start_time: string
          status: string | null
          synced_at: string | null
          title: string
          user_id: string
        }
        Insert: {
          attendees?: Json | null
          bot_dispatched?: boolean | null
          bot_id?: string | null
          call_id?: string | null
          created_at?: string | null
          description?: string | null
          end_time: string
          google_event_id: string
          id?: string
          meeting_url?: string | null
          start_time: string
          status?: string | null
          synced_at?: string | null
          title: string
          user_id: string
        }
        Update: {
          attendees?: Json | null
          bot_dispatched?: boolean | null
          bot_id?: string | null
          call_id?: string | null
          created_at?: string | null
          description?: string | null
          end_time?: string
          google_event_id?: string
          id?: string
          meeting_url?: string | null
          start_time?: string
          status?: string | null
          synced_at?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_events_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "active_live_calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "calls"
            referencedColumns: ["id"]
          },
        ]
      }
      call_summaries: {
        Row: {
          action_items: string[] | null
          buying_signals: string[] | null
          call_id: string
          created_at: string
          id: string
          key_decisions: string[] | null
          meeting_score: number | null
          next_steps: string[] | null
          objections: Json | null
          summary: string | null
          talk_ratio: Json | null
          topics: string[] | null
          transcript: Json | null
          user_id: string
        }
        Insert: {
          action_items?: string[] | null
          buying_signals?: string[] | null
          call_id: string
          created_at?: string
          id?: string
          key_decisions?: string[] | null
          meeting_score?: number | null
          next_steps?: string[] | null
          objections?: Json | null
          summary?: string | null
          talk_ratio?: Json | null
          topics?: string[] | null
          transcript?: Json | null
          user_id: string
        }
        Update: {
          action_items?: string[] | null
          buying_signals?: string[] | null
          call_id?: string
          created_at?: string
          id?: string
          key_decisions?: string[] | null
          meeting_score?: number | null
          next_steps?: string[] | null
          objections?: Json | null
          summary?: string | null
          talk_ratio?: Json | null
          topics?: string[] | null
          transcript?: Json | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "call_summaries_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "active_live_calls"
            referencedColumns: ["id"]
          },
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
          audio_url: string | null
          auto_joined: boolean | null
          calendar_event_id: string | null
          created_at: string
          date: string
          deal_score: string | null
          duration_minutes: number | null
          end_time: string | null
          id: string
          meeting_id: string | null
          meeting_provider: string | null
          meeting_type: string | null
          meeting_url: string | null
          name: string
          objections_count: number | null
          participants: string[] | null
          platform: string | null
          recall_bot_id: string | null
          recall_bot_status: string | null
          recording_url: string | null
          sentiment_score: number | null
          start_time: string | null
          status: string | null
          user_id: string
        }
        Insert: {
          audio_url?: string | null
          auto_joined?: boolean | null
          calendar_event_id?: string | null
          created_at?: string
          date?: string
          deal_score?: string | null
          duration_minutes?: number | null
          end_time?: string | null
          id?: string
          meeting_id?: string | null
          meeting_provider?: string | null
          meeting_type?: string | null
          meeting_url?: string | null
          name: string
          objections_count?: number | null
          participants?: string[] | null
          platform?: string | null
          recall_bot_id?: string | null
          recall_bot_status?: string | null
          recording_url?: string | null
          sentiment_score?: number | null
          start_time?: string | null
          status?: string | null
          user_id: string
        }
        Update: {
          audio_url?: string | null
          auto_joined?: boolean | null
          calendar_event_id?: string | null
          created_at?: string
          date?: string
          deal_score?: string | null
          duration_minutes?: number | null
          end_time?: string | null
          id?: string
          meeting_id?: string | null
          meeting_provider?: string | null
          meeting_type?: string | null
          meeting_url?: string | null
          name?: string
          objections_count?: number | null
          participants?: string[] | null
          platform?: string | null
          recall_bot_id?: string | null
          recall_bot_status?: string | null
          recording_url?: string | null
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
      conversation_preferences: {
        Row: {
          conversation_id: string
          id: string
          is_muted: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          conversation_id: string
          id?: string
          is_muted?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          conversation_id?: string
          id?: string
          is_muted?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_preferences_conversation_id_fkey"
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
      deal_room_members: {
        Row: {
          added_at: string
          deal_room_id: string
          id: string
          role: string
          user_id: string
        }
        Insert: {
          added_at?: string
          deal_room_id: string
          id?: string
          role?: string
          user_id: string
        }
        Update: {
          added_at?: string
          deal_room_id?: string
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deal_room_members_deal_room_id_fkey"
            columns: ["deal_room_id"]
            isOneToOne: false
            referencedRelation: "deal_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_rooms: {
        Row: {
          assigned_to: string | null
          call_id: string | null
          company: string | null
          conversation_id: string | null
          created_at: string
          created_by: string | null
          deal_name: string
          id: string
          last_call_score: number | null
          next_step: string | null
          sentiment_score: number | null
          stage: string
          team_id: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          call_id?: string | null
          company?: string | null
          conversation_id?: string | null
          created_at?: string
          created_by?: string | null
          deal_name: string
          id?: string
          last_call_score?: number | null
          next_step?: string | null
          sentiment_score?: number | null
          stage?: string
          team_id: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          call_id?: string | null
          company?: string | null
          conversation_id?: string | null
          created_at?: string
          created_by?: string | null
          deal_name?: string
          id?: string
          last_call_score?: number | null
          next_step?: string | null
          sentiment_score?: number | null
          stage?: string
          team_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "deal_rooms_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "active_live_calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_rooms_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_rooms_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "team_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_rooms_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_stage_history: {
        Row: {
          changed_at: string
          changed_by: string | null
          deal_room_id: string
          id: string
          new_stage: string
          note: string | null
          old_stage: string | null
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          deal_room_id: string
          id?: string
          new_stage: string
          note?: string | null
          old_stage?: string | null
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          deal_room_id?: string
          id?: string
          new_stage?: string
          note?: string | null
          old_stage?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deal_stage_history_deal_room_id_fkey"
            columns: ["deal_room_id"]
            isOneToOne: false
            referencedRelation: "deal_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      google_tokens: {
        Row: {
          access_token: string
          created_at: string | null
          email: string | null
          expires_at: string
          refresh_token: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          access_token: string
          created_at?: string | null
          email?: string | null
          expires_at: string
          refresh_token: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          access_token?: string
          created_at?: string | null
          email?: string | null
          expires_at?: string
          refresh_token?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      integrations: {
        Row: {
          access_token: string | null
          access_token_encrypted: string | null
          channel_id: string | null
          created_at: string
          expires_at: string | null
          id: string
          instance_url: string | null
          provider: string
          refresh_token: string | null
          refresh_token_encrypted: string | null
          scope: string | null
          status: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          access_token?: string | null
          access_token_encrypted?: string | null
          channel_id?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          instance_url?: string | null
          provider: string
          refresh_token?: string | null
          refresh_token_encrypted?: string | null
          scope?: string | null
          status?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          access_token?: string | null
          access_token_encrypted?: string | null
          channel_id?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          instance_url?: string | null
          provider?: string
          refresh_token?: string | null
          refresh_token_encrypted?: string | null
          scope?: string | null
          status?: string
          updated_at?: string | null
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
            referencedRelation: "active_live_calls"
            referencedColumns: ["id"]
          },
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
      message_reactions: {
        Row: {
          created_at: string
          emoji: string
          id: string
          message_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          emoji: string
          id?: string
          message_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          emoji?: string
          id?: string
          message_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_reactions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "team_messages"
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
            referencedRelation: "active_live_calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "objections_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "calls"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount_kobo: number | null
          created_at: string
          currency: string | null
          id: string
          paystack_reference: string | null
          paystack_response: Json | null
          plan_selected: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_kobo?: number | null
          created_at?: string
          currency?: string | null
          id?: string
          paystack_reference?: string | null
          paystack_response?: Json | null
          plan_selected: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount_kobo?: number | null
          created_at?: string
          currency?: string | null
          id?: string
          paystack_reference?: string | null
          paystack_response?: Json | null
          plan_selected?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      pinned_messages: {
        Row: {
          conversation_id: string
          created_at: string
          id: string
          message_id: string
          message_preview: string | null
          pinned_by: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          id?: string
          message_id: string
          message_preview?: string | null
          pinned_by: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          id?: string
          message_id?: string
          message_preview?: string | null
          pinned_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "pinned_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "team_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pinned_messages_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "team_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          billing_status: string
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
          billing_status?: string
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
          billing_status?: string
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
      saved_messages: {
        Row: {
          created_at: string
          id: string
          message_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_messages_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "team_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduled_calls: {
        Row: {
          bot_dispatched: boolean | null
          bot_dispatched_at: string | null
          bot_id: string | null
          calendar_event_id: string | null
          call_id: string | null
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
          bot_dispatched?: boolean | null
          bot_dispatched_at?: string | null
          bot_id?: string | null
          calendar_event_id?: string | null
          call_id?: string | null
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
          bot_dispatched?: boolean | null
          bot_dispatched_at?: string | null
          bot_id?: string | null
          calendar_event_id?: string | null
          call_id?: string | null
          created_at?: string
          id?: string
          meeting_provider?: string
          meeting_url?: string | null
          scheduled_time?: string
          status?: string
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_calls_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "active_live_calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_calls_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "calls"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduled_messages: {
        Row: {
          conversation_id: string
          created_at: string
          id: string
          message_text: string
          scheduled_for: string
          sender_id: string
          status: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          id?: string
          message_text: string
          scheduled_for: string
          sender_id: string
          status?: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          id?: string
          message_text?: string
          scheduled_for?: string
          sender_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "team_conversations"
            referencedColumns: ["id"]
          },
        ]
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
      team_invitations: {
        Row: {
          created_at: string
          email: string
          id: string
          invited_by: string
          role: string
          status: string
          team_id: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          invited_by: string
          role?: string
          status?: string
          team_id: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          invited_by?: string
          role?: string
          status?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_invitations_team_id_fkey"
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
          previous_calls_limit: number | null
          previous_plan_type: string | null
          role: string
          status: string
          team_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          invited_email?: string | null
          previous_calls_limit?: number | null
          previous_plan_type?: string | null
          role?: string
          status?: string
          team_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          invited_email?: string | null
          previous_calls_limit?: number | null
          previous_plan_type?: string | null
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
          file_name: string | null
          file_type: string | null
          file_url: string | null
          id: string
          message_text: string
          parent_id: string | null
          sender_id: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          file_name?: string | null
          file_type?: string | null
          file_url?: string | null
          id?: string
          message_text: string
          parent_id?: string | null
          sender_id: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          file_name?: string | null
          file_type?: string | null
          file_url?: string | null
          id?: string
          message_text?: string
          parent_id?: string | null
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
          {
            foreignKeyName: "team_messages_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "team_messages"
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
            referencedRelation: "active_live_calls"
            referencedColumns: ["id"]
          },
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
      user_statuses: {
        Row: {
          custom_text: string | null
          status: string
          team_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          custom_text?: string | null
          status?: string
          team_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          custom_text?: string | null
          status?: string
          team_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_statuses_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          created_at: string
          id: string
          owner_id: string
          team_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          owner_id: string
          team_id: string
        }
        Update: {
          created_at?: string
          id?: string
          owner_id?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspaces_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: true
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      active_live_calls: {
        Row: {
          calendar_event_id: string | null
          id: string | null
          meeting_type: string | null
          meeting_url: string | null
          name: string | null
          participants: string[] | null
          platform: string | null
          sentiment_score: number | null
          start_time: string | null
          user_email: string | null
          user_id: string | null
          user_name: string | null
        }
        Relationships: []
      }
      workspace_meeting_usage: {
        Row: {
          meetings_used: number | null
          owner_id: string | null
          team_id: string | null
          workspace_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workspaces_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: true
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      accept_team_invitation: {
        Args: { p_team_id: string }
        Returns: undefined
      }
      can_add_conversation_participant: {
        Args: { _conversation_id: string; _participant_user_id: string }
        Returns: boolean
      }
      can_create_team_conversation: {
        Args: { _team_id: string }
        Returns: boolean
      }
      create_deal_room_for_call: {
        Args: {
          p_call_id: string
          p_company?: string
          p_deal_name: string
          p_last_call_score?: number
          p_next_step?: string
          p_sentiment_score?: number
          p_stage?: string
          p_team_id: string
        }
        Returns: string
      }
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
      decline_team_invitation: {
        Args: { p_team_id: string }
        Returns: undefined
      }
      get_effective_calls_limit: { Args: { _user_id: string }; Returns: number }
      get_effective_plan: { Args: { _user_id: string }; Returns: string }
      get_team_role: {
        Args: { _team_id: string; _user_id: string }
        Returns: string
      }
      get_user_active_plan: { Args: { p_user_id: string }; Returns: string }
      get_user_active_plan_details: {
        Args: { p_user_id: string }
        Returns: {
          calls_limit: number
          is_inherited: boolean
          owner_user_id: string
          plan_key: string
          plan_name: string
          team_members_limit: number
          workspace_id: string
        }[]
      }
      increment_join_attempts: { Args: { p_call_id: string }; Returns: number }
      is_conversation_participant: {
        Args: { _conversation_id: string; _user_id: string }
        Returns: boolean
      }
      is_team_member: {
        Args: { _team_id: string; _user_id: string }
        Returns: boolean
      }
      upsert_user_status: {
        Args: { p_custom_text?: string; p_status: string; p_team_id?: string }
        Returns: undefined
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
