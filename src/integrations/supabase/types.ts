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
      admin_audit_log: {
        Row: {
          action: string
          admin_email: string
          created_at: string | null
          details: Json | null
          id: string
          target_email: string | null
          target_user_id: string | null
        }
        Insert: {
          action: string
          admin_email: string
          created_at?: string | null
          details?: Json | null
          id?: string
          target_email?: string | null
          target_user_id?: string | null
        }
        Update: {
          action?: string
          admin_email?: string
          created_at?: string | null
          details?: Json | null
          id?: string
          target_email?: string | null
          target_user_id?: string | null
        }
        Relationships: []
      }
      admin_users: {
        Row: {
          created_at: string | null
          email: string
          id: string
          is_active: boolean | null
          last_login: string | null
          name: string | null
          role: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          id?: string
          is_active?: boolean | null
          last_login?: string | null
          name?: string | null
          role?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          id?: string
          is_active?: boolean | null
          last_login?: string | null
          name?: string | null
          role?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      api_keys: {
        Row: {
          created_at: string | null
          expires_at: string | null
          id: string
          key_hash: string
          key_prefix: string
          last_used_at: string | null
          name: string
          revoked: boolean | null
          scopes: string[] | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          expires_at?: string | null
          id?: string
          key_hash: string
          key_prefix: string
          last_used_at?: string | null
          name: string
          revoked?: boolean | null
          scopes?: string[] | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          expires_at?: string | null
          id?: string
          key_hash?: string
          key_prefix?: string
          last_used_at?: string | null
          name?: string
          revoked?: boolean | null
          scopes?: string[] | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "api_keys_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "api_keys_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_plan_features"
            referencedColumns: ["user_id"]
          },
        ]
      }
      asana_configs: {
        Row: {
          access_token: string | null
          created_at: string | null
          enabled: boolean | null
          id: string
          project_gid: string | null
          updated_at: string | null
          user_id: string | null
          workspace_gid: string | null
          workspace_name: string | null
        }
        Insert: {
          access_token?: string | null
          created_at?: string | null
          enabled?: boolean | null
          id?: string
          project_gid?: string | null
          updated_at?: string | null
          user_id?: string | null
          workspace_gid?: string | null
          workspace_name?: string | null
        }
        Update: {
          access_token?: string | null
          created_at?: string | null
          enabled?: boolean | null
          id?: string
          project_gid?: string | null
          updated_at?: string | null
          user_id?: string | null
          workspace_gid?: string | null
          workspace_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "asana_configs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asana_configs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "user_plan_features"
            referencedColumns: ["user_id"]
          },
        ]
      }
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
      call_actions: {
        Row: {
          call_id: string
          completed_at: string | null
          created_at: string
          crm_provider: string | null
          crm_pushed: boolean
          crm_task_id: string | null
          draft_email_body: string | null
          draft_email_subject: string | null
          id: string
          is_completed: boolean
          priority_action: string
          updated_at: string
          user_id: string
        }
        Insert: {
          call_id: string
          completed_at?: string | null
          created_at?: string
          crm_provider?: string | null
          crm_pushed?: boolean
          crm_task_id?: string | null
          draft_email_body?: string | null
          draft_email_subject?: string | null
          id?: string
          is_completed?: boolean
          priority_action: string
          updated_at?: string
          user_id: string
        }
        Update: {
          call_id?: string
          completed_at?: string | null
          created_at?: string
          crm_provider?: string | null
          crm_pushed?: boolean
          crm_task_id?: string | null
          draft_email_body?: string | null
          draft_email_subject?: string | null
          id?: string
          is_completed?: boolean
          priority_action?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "call_actions_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "active_live_calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_actions_call_id_fkey"
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
          daily_room_name: string | null
          daily_room_url: string | null
          date: string
          deal_id: string | null
          deal_score: string | null
          description: string | null
          duration_minutes: number | null
          end_time: string | null
          hms_guest_code: string | null
          hms_recording_url: string | null
          hms_room_code: string | null
          hms_room_id: string | null
          hms_room_name: string | null
          hms_share_link: string | null
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
          daily_room_name?: string | null
          daily_room_url?: string | null
          date?: string
          deal_id?: string | null
          deal_score?: string | null
          description?: string | null
          duration_minutes?: number | null
          end_time?: string | null
          hms_guest_code?: string | null
          hms_recording_url?: string | null
          hms_room_code?: string | null
          hms_room_id?: string | null
          hms_room_name?: string | null
          hms_share_link?: string | null
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
          daily_room_name?: string | null
          daily_room_url?: string | null
          date?: string
          deal_id?: string | null
          deal_score?: string | null
          description?: string | null
          duration_minutes?: number | null
          end_time?: string | null
          hms_guest_code?: string | null
          hms_recording_url?: string | null
          hms_room_code?: string | null
          hms_room_id?: string | null
          hms_room_name?: string | null
          hms_share_link?: string | null
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
        Relationships: [
          {
            foreignKeyName: "calls_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      changelog_entries: {
        Row: {
          badge: string | null
          changes: Json
          created_at: string
          created_by: string | null
          id: string
          is_published: boolean
          release_date: string
          summary: string
          title: string
          updated_at: string
          version: string
        }
        Insert: {
          badge?: string | null
          changes?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          is_published?: boolean
          release_date?: string
          summary: string
          title: string
          updated_at?: string
          version: string
        }
        Update: {
          badge?: string | null
          changes?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          is_published?: boolean
          release_date?: string
          summary?: string
          title?: string
          updated_at?: string
          version?: string
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
      coaching_clip_reactions: {
        Row: {
          clip_id: string
          created_at: string | null
          emoji: string
          id: string
          user_id: string
        }
        Insert: {
          clip_id: string
          created_at?: string | null
          emoji: string
          id?: string
          user_id: string
        }
        Update: {
          clip_id?: string
          created_at?: string | null
          emoji?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coaching_clip_reactions_clip_id_fkey"
            columns: ["clip_id"]
            isOneToOne: false
            referencedRelation: "coaching_clips"
            referencedColumns: ["id"]
          },
        ]
      }
      coaching_clip_views: {
        Row: {
          clip_id: string
          id: string
          ip_hash: string | null
          viewed_at: string | null
          viewer_id: string | null
        }
        Insert: {
          clip_id: string
          id?: string
          ip_hash?: string | null
          viewed_at?: string | null
          viewer_id?: string | null
        }
        Update: {
          clip_id?: string
          id?: string
          ip_hash?: string | null
          viewed_at?: string | null
          viewer_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "coaching_clip_views_clip_id_fkey"
            columns: ["clip_id"]
            isOneToOne: false
            referencedRelation: "coaching_clips"
            referencedColumns: ["id"]
          },
        ]
      }
      coaching_clips: {
        Row: {
          call_id: string
          call_recording_url: string | null
          call_title: string | null
          coaching_tag: string | null
          created_at: string | null
          created_by: string
          duration_seconds: number | null
          end_seconds: number
          id: string
          is_public: boolean | null
          manager_comment: string
          playlist_id: string | null
          rating: number | null
          share_token: string | null
          start_seconds: number
          tags: string[] | null
          team_id: string | null
          title: string | null
          transcript_excerpt: Json
          updated_at: string | null
          view_count: number | null
        }
        Insert: {
          call_id: string
          call_recording_url?: string | null
          call_title?: string | null
          coaching_tag?: string | null
          created_at?: string | null
          created_by: string
          duration_seconds?: number | null
          end_seconds: number
          id?: string
          is_public?: boolean | null
          manager_comment: string
          playlist_id?: string | null
          rating?: number | null
          share_token?: string | null
          start_seconds?: number
          tags?: string[] | null
          team_id?: string | null
          title?: string | null
          transcript_excerpt?: Json
          updated_at?: string | null
          view_count?: number | null
        }
        Update: {
          call_id?: string
          call_recording_url?: string | null
          call_title?: string | null
          coaching_tag?: string | null
          created_at?: string | null
          created_by?: string
          duration_seconds?: number | null
          end_seconds?: number
          id?: string
          is_public?: boolean | null
          manager_comment?: string
          playlist_id?: string | null
          rating?: number | null
          share_token?: string | null
          start_seconds?: number
          tags?: string[] | null
          team_id?: string | null
          title?: string | null
          transcript_excerpt?: Json
          updated_at?: string | null
          view_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "coaching_clips_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "active_live_calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coaching_clips_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coaching_clips_playlist_id_fkey"
            columns: ["playlist_id"]
            isOneToOne: false
            referencedRelation: "coaching_playlists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coaching_clips_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      coaching_playlists: {
        Row: {
          created_at: string | null
          created_by: string
          description: string | null
          id: string
          team_id: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by: string
          description?: string | null
          id?: string
          team_id?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string
          description?: string | null
          id?: string
          team_id?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "coaching_playlists_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
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
      crm_contacts: {
        Row: {
          company: string | null
          created_at: string | null
          deal_stage: string | null
          deal_timeline: string | null
          deal_value: number | null
          email: string | null
          external_id: string
          id: string
          last_activity: string | null
          name: string | null
          phone: string | null
          provider: string
          raw_data: Json | null
          role: string | null
          synced_at: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          company?: string | null
          created_at?: string | null
          deal_stage?: string | null
          deal_timeline?: string | null
          deal_value?: number | null
          email?: string | null
          external_id: string
          id?: string
          last_activity?: string | null
          name?: string | null
          phone?: string | null
          provider: string
          raw_data?: Json | null
          role?: string | null
          synced_at?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          company?: string | null
          created_at?: string | null
          deal_stage?: string | null
          deal_timeline?: string | null
          deal_value?: number | null
          email?: string | null
          external_id?: string
          id?: string
          last_activity?: string | null
          name?: string | null
          phone?: string | null
          provider?: string
          raw_data?: Json | null
          role?: string | null
          synced_at?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_contacts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_contacts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_plan_features"
            referencedColumns: ["user_id"]
          },
        ]
      }
      crm_field_mappings: {
        Row: {
          created_at: string | null
          crm_property: string
          enabled: boolean | null
          fixsense_field: string
          id: string
          provider: string
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          crm_property: string
          enabled?: boolean | null
          fixsense_field: string
          id?: string
          provider: string
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          crm_property?: string
          enabled?: boolean | null
          fixsense_field?: string
          id?: string
          provider?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_field_mappings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_field_mappings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_plan_features"
            referencedColumns: ["user_id"]
          },
        ]
      }
      crm_sync_logs: {
        Row: {
          call_id: string
          created_at: string
          direction: string | null
          event_type: string | null
          external_id: string | null
          id: string
          idempotency_key: string | null
          payload: Json | null
          provider: string
          response_payload: Json | null
          status: string
          user_id: string
        }
        Insert: {
          call_id: string
          created_at?: string
          direction?: string | null
          event_type?: string | null
          external_id?: string | null
          id?: string
          idempotency_key?: string | null
          payload?: Json | null
          provider: string
          response_payload?: Json | null
          status?: string
          user_id: string
        }
        Update: {
          call_id?: string
          created_at?: string
          direction?: string | null
          event_type?: string | null
          external_id?: string | null
          id?: string
          idempotency_key?: string | null
          payload?: Json | null
          provider?: string
          response_payload?: Json | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      crm_webhook_events: {
        Row: {
          error: string | null
          event_type: string
          external_id: string | null
          id: string
          idempotency_key: string | null
          payload: Json
          processed: boolean | null
          processed_at: string | null
          provider: string
          received_at: string | null
        }
        Insert: {
          error?: string | null
          event_type: string
          external_id?: string | null
          id?: string
          idempotency_key?: string | null
          payload: Json
          processed?: boolean | null
          processed_at?: string | null
          provider: string
          received_at?: string | null
        }
        Update: {
          error?: string | null
          event_type?: string
          external_id?: string | null
          id?: string
          idempotency_key?: string | null
          payload?: Json
          processed?: boolean | null
          processed_at?: string | null
          provider?: string
          received_at?: string | null
        }
        Relationships: []
      }
      dcm_notification_prefs: {
        Row: {
          channel_id: string
          id: string
          mode: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          channel_id: string
          id?: string
          mode?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          channel_id?: string
          id?: string
          mode?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dcm_notification_prefs_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "deal_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dcm_notification_prefs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dcm_notification_prefs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_plan_features"
            referencedColumns: ["user_id"]
          },
        ]
      }
      dcm_reactions: {
        Row: {
          created_at: string | null
          emoji: string
          id: string
          message_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          emoji: string
          id?: string
          message_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          emoji?: string
          id?: string
          message_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dcm_reactions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "deal_channel_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dcm_reactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dcm_reactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_plan_features"
            referencedColumns: ["user_id"]
          },
        ]
      }
      dcm_typing: {
        Row: {
          channel_id: string
          started_at: string | null
          user_id: string
          user_name: string | null
        }
        Insert: {
          channel_id: string
          started_at?: string | null
          user_id: string
          user_name?: string | null
        }
        Update: {
          channel_id?: string
          started_at?: string | null
          user_id?: string
          user_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dcm_typing_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "deal_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dcm_typing_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dcm_typing_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_plan_features"
            referencedColumns: ["user_id"]
          },
        ]
      }
      deal_ai_analysis: {
        Row: {
          analyzed_at: string | null
          buying_signals: Json | null
          call_id: string | null
          deal_id: string
          health_score: number | null
          id: string
          insights: Json | null
          next_best_action: string | null
          objections_summary: Json | null
          risk_flags: Json | null
          sentiment_trend: string | null
        }
        Insert: {
          analyzed_at?: string | null
          buying_signals?: Json | null
          call_id?: string | null
          deal_id: string
          health_score?: number | null
          id?: string
          insights?: Json | null
          next_best_action?: string | null
          objections_summary?: Json | null
          risk_flags?: Json | null
          sentiment_trend?: string | null
        }
        Update: {
          analyzed_at?: string | null
          buying_signals?: Json | null
          call_id?: string | null
          deal_id?: string
          health_score?: number | null
          id?: string
          insights?: Json | null
          next_best_action?: string | null
          objections_summary?: Json | null
          risk_flags?: Json | null
          sentiment_trend?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deal_ai_analysis_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: true
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_calls: {
        Row: {
          call_id: string
          deal_id: string
          id: string
          linked_at: string | null
          linked_by: string | null
        }
        Insert: {
          call_id: string
          deal_id: string
          id?: string
          linked_at?: string | null
          linked_by?: string | null
        }
        Update: {
          call_id?: string
          deal_id?: string
          id?: string
          linked_at?: string | null
          linked_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deal_calls_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_channel_members: {
        Row: {
          channel_id: string
          id: string
          joined_at: string | null
          last_read_at: string | null
          user_id: string
        }
        Insert: {
          channel_id: string
          id?: string
          joined_at?: string | null
          last_read_at?: string | null
          user_id: string
        }
        Update: {
          channel_id?: string
          id?: string
          joined_at?: string | null
          last_read_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deal_channel_members_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "deal_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_channel_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_channel_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_plan_features"
            referencedColumns: ["user_id"]
          },
        ]
      }
      deal_channel_messages: {
        Row: {
          channel_id: string
          content: string
          created_at: string | null
          deleted_at: string | null
          edited_at: string | null
          id: string
          is_deleted: boolean | null
          is_pinned: boolean | null
          metadata: Json | null
          parent_id: string | null
          type: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          channel_id: string
          content: string
          created_at?: string | null
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          is_deleted?: boolean | null
          is_pinned?: boolean | null
          metadata?: Json | null
          parent_id?: string | null
          type?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          channel_id?: string
          content?: string
          created_at?: string | null
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          is_deleted?: boolean | null
          is_pinned?: boolean | null
          metadata?: Json | null
          parent_id?: string | null
          type?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deal_channel_messages_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "deal_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_channel_messages_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "deal_channel_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_channel_messages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_channel_messages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_plan_features"
            referencedColumns: ["user_id"]
          },
        ]
      }
      deal_channels: {
        Row: {
          call_id: string | null
          created_at: string | null
          created_by: string | null
          deal_id: string | null
          description: string | null
          id: string
          is_archived: boolean | null
          name: string
          team_id: string | null
          type: string
          updated_at: string | null
        }
        Insert: {
          call_id?: string | null
          created_at?: string | null
          created_by?: string | null
          deal_id?: string | null
          description?: string | null
          id?: string
          is_archived?: boolean | null
          name: string
          team_id?: string | null
          type?: string
          updated_at?: string | null
        }
        Update: {
          call_id?: string | null
          created_at?: string | null
          created_by?: string | null
          deal_id?: string | null
          description?: string | null
          id?: string
          is_archived?: boolean | null
          name?: string
          team_id?: string | null
          type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deal_channels_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "active_live_calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_channels_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_channels_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_channels_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_plan_features"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "deal_channels_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_channels_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_comments: {
        Row: {
          content: string
          created_at: string | null
          deal_id: string
          id: string
          mentions: Json | null
          parent_id: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string | null
          deal_id: string
          id?: string
          mentions?: Json | null
          parent_id?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string | null
          deal_id?: string
          id?: string
          mentions?: Json | null
          parent_id?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deal_comments_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_message_mentions: {
        Row: {
          created_at: string | null
          id: string
          mentioned_user: string
          message_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          mentioned_user: string
          message_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          mentioned_user?: string
          message_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deal_message_mentions_mentioned_user_fkey"
            columns: ["mentioned_user"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_message_mentions_mentioned_user_fkey"
            columns: ["mentioned_user"]
            isOneToOne: false
            referencedRelation: "user_plan_features"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "deal_message_mentions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "deal_channel_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_message_tasks: {
        Row: {
          assigned_to: string | null
          channel_id: string
          completed_at: string | null
          created_at: string | null
          created_by: string | null
          deal_id: string | null
          due_date: string | null
          id: string
          is_completed: boolean | null
          message_id: string
          team_id: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          channel_id: string
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          deal_id?: string | null
          due_date?: string | null
          id?: string
          is_completed?: boolean | null
          message_id: string
          team_id?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          channel_id?: string
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          deal_id?: string | null
          due_date?: string | null
          id?: string
          is_completed?: boolean | null
          message_id?: string
          team_id?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deal_message_tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_message_tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "user_plan_features"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "deal_message_tasks_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "deal_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_message_tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_message_tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_plan_features"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "deal_message_tasks_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_message_tasks_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "deal_channel_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_message_tasks_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_risk_alerts: {
        Row: {
          call_id: string | null
          created_at: string | null
          crm_external_id: string | null
          crm_provider: string | null
          crm_updated: boolean | null
          deal_id: string | null
          id: string
          new_stage: string | null
          previous_stage: string | null
          resolved: boolean | null
          resolved_at: string | null
          resolved_reason: string | null
          sentiment_score: number | null
          triggered_by: string | null
        }
        Insert: {
          call_id?: string | null
          created_at?: string | null
          crm_external_id?: string | null
          crm_provider?: string | null
          crm_updated?: boolean | null
          deal_id?: string | null
          id?: string
          new_stage?: string | null
          previous_stage?: string | null
          resolved?: boolean | null
          resolved_at?: string | null
          resolved_reason?: string | null
          sentiment_score?: number | null
          triggered_by?: string | null
        }
        Update: {
          call_id?: string | null
          created_at?: string | null
          crm_external_id?: string | null
          crm_provider?: string | null
          crm_updated?: boolean | null
          deal_id?: string | null
          id?: string
          new_stage?: string | null
          previous_stage?: string | null
          resolved?: boolean | null
          resolved_at?: string | null
          resolved_reason?: string | null
          sentiment_score?: number | null
          triggered_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deal_risk_alerts_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "active_live_calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_risk_alerts_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_risk_alerts_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
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
      deal_summaries: {
        Row: {
          buying_signals: string[] | null
          call_count: number
          deal_id: string
          generated_at: string
          id: string
          key_themes: string[] | null
          open_objections: string[] | null
          recommended_actions: string[] | null
          risks: string[] | null
          summary: string
        }
        Insert: {
          buying_signals?: string[] | null
          call_count?: number
          deal_id: string
          generated_at?: string
          id?: string
          key_themes?: string[] | null
          open_objections?: string[] | null
          recommended_actions?: string[] | null
          risks?: string[] | null
          summary: string
        }
        Update: {
          buying_signals?: string[] | null
          call_count?: number
          deal_id?: string
          generated_at?: string
          id?: string
          key_themes?: string[] | null
          open_objections?: string[] | null
          recommended_actions?: string[] | null
          risks?: string[] | null
          summary?: string
        }
        Relationships: [
          {
            foreignKeyName: "deal_summaries_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_timeline_events: {
        Row: {
          deal_id: string
          detail: string | null
          event_type: string
          happened_at: string
          id: string
          metadata: Json | null
          title: string
          user_id: string | null
        }
        Insert: {
          deal_id: string
          detail?: string | null
          event_type: string
          happened_at?: string
          id?: string
          metadata?: Json | null
          title: string
          user_id?: string | null
        }
        Update: {
          deal_id?: string
          detail?: string | null
          event_type?: string
          happened_at?: string
          id?: string
          metadata?: Json | null
          title?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deal_timeline_events_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_timeline_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_timeline_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_plan_features"
            referencedColumns: ["user_id"]
          },
        ]
      }
      deals: {
        Row: {
          ai_insights: Json | null
          assigned_to: string | null
          call_count: number | null
          close_date: string | null
          company: string | null
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          currency: string
          deal_health_score: number | null
          deal_summary: string | null
          deal_summary_at: string | null
          health_updated_at: string | null
          id: string
          last_call_at: string | null
          last_call_id: string | null
          name: string
          next_best_action: string | null
          next_step: string | null
          next_step_due: string | null
          notes: string | null
          owner_id: string
          probability: number | null
          risk_flags: Json | null
          risk_score: number | null
          sentiment_trend: string | null
          source: string | null
          stage: string
          tags: string[] | null
          team_id: string | null
          updated_at: string
          value: number | null
        }
        Insert: {
          ai_insights?: Json | null
          assigned_to?: string | null
          call_count?: number | null
          close_date?: string | null
          company?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          currency?: string
          deal_health_score?: number | null
          deal_summary?: string | null
          deal_summary_at?: string | null
          health_updated_at?: string | null
          id?: string
          last_call_at?: string | null
          last_call_id?: string | null
          name: string
          next_best_action?: string | null
          next_step?: string | null
          next_step_due?: string | null
          notes?: string | null
          owner_id: string
          probability?: number | null
          risk_flags?: Json | null
          risk_score?: number | null
          sentiment_trend?: string | null
          source?: string | null
          stage?: string
          tags?: string[] | null
          team_id?: string | null
          updated_at?: string
          value?: number | null
        }
        Update: {
          ai_insights?: Json | null
          assigned_to?: string | null
          call_count?: number | null
          close_date?: string | null
          company?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          currency?: string
          deal_health_score?: number | null
          deal_summary?: string | null
          deal_summary_at?: string | null
          health_updated_at?: string | null
          id?: string
          last_call_at?: string | null
          last_call_id?: string | null
          name?: string
          next_best_action?: string | null
          next_step?: string | null
          next_step_due?: string | null
          notes?: string | null
          owner_id?: string
          probability?: number | null
          risk_flags?: Json | null
          risk_score?: number | null
          sentiment_trend?: string | null
          source?: string | null
          stage?: string
          tags?: string[] | null
          team_id?: string | null
          updated_at?: string
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "deals_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "user_plan_features"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "deals_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
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
      hms_meeting_rooms: {
        Row: {
          call_id: string | null
          created_at: string
          description: string | null
          ended_at: string | null
          expires_at: string | null
          guest_room_code: string | null
          host_id: string | null
          host_room_code: string | null
          id: string
          meeting_type: string | null
          recording_id: string | null
          recording_status: string | null
          recording_url: string | null
          room_code: string | null
          room_id: string
          room_name: string | null
          share_link: string | null
          status: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          call_id?: string | null
          created_at?: string
          description?: string | null
          ended_at?: string | null
          expires_at?: string | null
          guest_room_code?: string | null
          host_id?: string | null
          host_room_code?: string | null
          id?: string
          meeting_type?: string | null
          recording_id?: string | null
          recording_status?: string | null
          recording_url?: string | null
          room_code?: string | null
          room_id: string
          room_name?: string | null
          share_link?: string | null
          status?: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          call_id?: string | null
          created_at?: string
          description?: string | null
          ended_at?: string | null
          expires_at?: string | null
          guest_room_code?: string | null
          host_id?: string | null
          host_room_code?: string | null
          id?: string
          meeting_type?: string | null
          recording_id?: string | null
          recording_status?: string | null
          recording_url?: string | null
          room_code?: string | null
          room_id?: string
          room_name?: string | null
          share_link?: string | null
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hms_meeting_rooms_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "active_live_calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hms_meeting_rooms_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "calls"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_tasks: {
        Row: {
          action: string
          call_id: string | null
          completed_at: string | null
          created_at: string | null
          deal_id: string | null
          error: string | null
          id: string
          integration: string
          payload: Json | null
          result: Json | null
          status: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          call_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          deal_id?: string | null
          error?: string | null
          id?: string
          integration: string
          payload?: Json | null
          result?: Json | null
          status?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          call_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          deal_id?: string | null
          error?: string | null
          id?: string
          integration?: string
          payload?: Json | null
          result?: Json | null
          status?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "integration_tasks_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "active_live_calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_tasks_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_tasks_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_tasks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_tasks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_plan_features"
            referencedColumns: ["user_id"]
          },
        ]
      }
      integrations: {
        Row: {
          access_token: string | null
          access_token_encrypted: string | null
          account_email: string | null
          account_name: string | null
          channel_id: string | null
          created_at: string
          expires_at: string | null
          id: string
          instance_url: string | null
          last_synced_at: string | null
          metadata: Json | null
          provider: string
          refresh_token: string | null
          refresh_token_encrypted: string | null
          scope: string | null
          status: string
          sync_error: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          access_token?: string | null
          access_token_encrypted?: string | null
          account_email?: string | null
          account_name?: string | null
          channel_id?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          instance_url?: string | null
          last_synced_at?: string | null
          metadata?: Json | null
          provider: string
          refresh_token?: string | null
          refresh_token_encrypted?: string | null
          scope?: string | null
          status?: string
          sync_error?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          access_token?: string | null
          access_token_encrypted?: string | null
          account_email?: string | null
          account_name?: string | null
          channel_id?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          instance_url?: string | null
          last_synced_at?: string | null
          metadata?: Json | null
          provider?: string
          refresh_token?: string | null
          refresh_token_encrypted?: string | null
          scope?: string | null
          status?: string
          sync_error?: string | null
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
      meeting_reminder_log: {
        Row: {
          channel: string
          id: string
          meeting_id: string
          reminder_type: string
          sent_at: string
          user_id: string
        }
        Insert: {
          channel?: string
          id?: string
          meeting_id: string
          reminder_type: string
          sent_at?: string
          user_id: string
        }
        Update: {
          channel?: string
          id?: string
          meeting_id?: string
          reminder_type?: string
          sent_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meeting_reminder_log_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "scheduled_meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_reminder_log_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "upcoming_meeting_reminders"
            referencedColumns: ["meeting_id"]
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
      message_read_receipts: {
        Row: {
          id: string
          message_id: string
          read_at: string
          user_id: string
        }
        Insert: {
          id?: string
          message_id: string
          read_at?: string
          user_id: string
        }
        Update: {
          id?: string
          message_id?: string
          read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_read_receipts_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "team_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      native_meeting_rooms: {
        Row: {
          call_id: string | null
          created_at: string
          description: string | null
          ended_at: string | null
          expires_at: string | null
          host_id: string
          id: string
          meeting_type: string | null
          recording_url: string | null
          room_name: string
          room_url: string
          share_link: string
          status: string
          title: string
        }
        Insert: {
          call_id?: string | null
          created_at?: string
          description?: string | null
          ended_at?: string | null
          expires_at?: string | null
          host_id: string
          id?: string
          meeting_type?: string | null
          recording_url?: string | null
          room_name: string
          room_url: string
          share_link: string
          status?: string
          title?: string
        }
        Update: {
          call_id?: string | null
          created_at?: string
          description?: string | null
          ended_at?: string | null
          expires_at?: string | null
          host_id?: string
          id?: string
          meeting_type?: string | null
          recording_url?: string | null
          room_name?: string
          room_url?: string
          share_link?: string
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "native_meeting_rooms_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "active_live_calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "native_meeting_rooms_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "calls"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          idempotency_key: string | null
          is_read: boolean
          link: string | null
          message: string
          reference_id: string | null
          title: string | null
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          idempotency_key?: string | null
          is_read?: boolean
          link?: string | null
          message: string
          reference_id?: string | null
          title?: string | null
          type?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          idempotency_key?: string | null
          is_read?: boolean
          link?: string | null
          message?: string
          reference_id?: string | null
          title?: string | null
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      notion_configs: {
        Row: {
          access_token: string | null
          created_at: string | null
          database_id: string | null
          enabled: boolean | null
          id: string
          updated_at: string | null
          user_id: string | null
          workspace_id: string | null
          workspace_name: string | null
        }
        Insert: {
          access_token?: string | null
          created_at?: string | null
          database_id?: string | null
          enabled?: boolean | null
          id?: string
          updated_at?: string | null
          user_id?: string | null
          workspace_id?: string | null
          workspace_name?: string | null
        }
        Update: {
          access_token?: string | null
          created_at?: string | null
          database_id?: string | null
          enabled?: boolean | null
          id?: string
          updated_at?: string | null
          user_id?: string | null
          workspace_id?: string | null
          workspace_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notion_configs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notion_configs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "user_plan_features"
            referencedColumns: ["user_id"]
          },
        ]
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
          amount: number | null
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
          amount?: number | null
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
          amount?: number | null
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
      plans: {
        Row: {
          calls_limit: number
          feature_flags: Json
          features: Json
          id: string
          is_active: boolean
          minute_quota: number
          monthly_price_ngn_kobo: number
          monthly_price_usd: number
          name: string
          overage_rate_kobo: number
          sort_order: number
          team_members_limit: number
        }
        Insert: {
          calls_limit?: number
          feature_flags?: Json
          features?: Json
          id: string
          is_active?: boolean
          minute_quota?: number
          monthly_price_ngn_kobo?: number
          monthly_price_usd?: number
          name: string
          overage_rate_kobo?: number
          sort_order?: number
          team_members_limit?: number
        }
        Update: {
          calls_limit?: number
          feature_flags?: Json
          features?: Json
          id?: string
          is_active?: boolean
          minute_quota?: number
          monthly_price_ngn_kobo?: number
          monthly_price_usd?: number
          name?: string
          overage_rate_kobo?: number
          sort_order?: number
          team_members_limit?: number
        }
        Relationships: []
      }
      platform_config: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
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
          onboarding_complete: boolean | null
          plan_type: string
          suspended: boolean
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
          onboarding_complete?: boolean | null
          plan_type?: string
          suspended?: boolean
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
          onboarding_complete?: boolean | null
          plan_type?: string
          suspended?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          browser_name: string | null
          created_at: string | null
          endpoint: string
          failed_count: number
          fcm_registration_token: string | null
          id: string
          is_active: boolean
          last_used_at: string | null
          p256dh: string
          platform: string | null
          updated_at: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          browser_name?: string | null
          created_at?: string | null
          endpoint: string
          failed_count?: number
          fcm_registration_token?: string | null
          id?: string
          is_active?: boolean
          last_used_at?: string | null
          p256dh: string
          platform?: string | null
          updated_at?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          browser_name?: string | null
          created_at?: string | null
          endpoint?: string
          failed_count?: number
          fcm_registration_token?: string | null
          id?: string
          is_active?: boolean
          last_used_at?: string | null
          p256dh?: string
          platform?: string | null
          updated_at?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      salesforce_sync_logs: {
        Row: {
          action: string
          call_id: string | null
          created_at: string
          error_message: string | null
          id: string
          payload: Json | null
          sf_object_id: string | null
          sf_object_type: string | null
          status: string
          user_id: string
        }
        Insert: {
          action: string
          call_id?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          payload?: Json | null
          sf_object_id?: string | null
          sf_object_type?: string | null
          status?: string
          user_id: string
        }
        Update: {
          action?: string
          call_id?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          payload?: Json | null
          sf_object_id?: string | null
          sf_object_type?: string | null
          status?: string
          user_id?: string
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
      scheduled_meetings: {
        Row: {
          call_id: string | null
          created_at: string
          id: string
          last_objection_summary: string | null
          last_sentiment: number | null
          meeting_link: string | null
          meeting_type: string | null
          notes: string | null
          participants: string[] | null
          reminder_10min_sent: boolean
          reminder_60min_sent: boolean
          reminder_start_sent: boolean
          reschedule_count: number
          rescheduled_from: string | null
          scheduled_time: string
          status: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          call_id?: string | null
          created_at?: string
          id?: string
          last_objection_summary?: string | null
          last_sentiment?: number | null
          meeting_link?: string | null
          meeting_type?: string | null
          notes?: string | null
          participants?: string[] | null
          reminder_10min_sent?: boolean
          reminder_60min_sent?: boolean
          reminder_start_sent?: boolean
          reschedule_count?: number
          rescheduled_from?: string | null
          scheduled_time: string
          status?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          call_id?: string | null
          created_at?: string
          id?: string
          last_objection_summary?: string | null
          last_sentiment?: number | null
          meeting_link?: string | null
          meeting_type?: string | null
          notes?: string | null
          participants?: string[] | null
          reminder_10min_sent?: boolean
          reminder_60min_sent?: boolean
          reminder_start_sent?: boolean
          reschedule_count?: number
          rescheduled_from?: string | null
          scheduled_time?: string
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_meetings_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "active_live_calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_meetings_call_id_fkey"
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
          billing_cycle_end: string | null
          billing_cycle_start: string | null
          card_brand: string | null
          card_last4: string | null
          created_at: string
          currency: string
          id: string
          minutes_limit: number | null
          minutes_used: number
          next_payment_date: string | null
          paystack_customer_code: string | null
          paystack_email_token: string | null
          paystack_subscription_code: string | null
          plan: string | null
          plan_id: string | null
          plan_name: string
          plan_price_usd: number | null
          status: string
          team_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_kobo?: number
          billing_cycle_end?: string | null
          billing_cycle_start?: string | null
          card_brand?: string | null
          card_last4?: string | null
          created_at?: string
          currency?: string
          id?: string
          minutes_limit?: number | null
          minutes_used?: number
          next_payment_date?: string | null
          paystack_customer_code?: string | null
          paystack_email_token?: string | null
          paystack_subscription_code?: string | null
          plan?: string | null
          plan_id?: string | null
          plan_name?: string
          plan_price_usd?: number | null
          status?: string
          team_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          amount_kobo?: number
          billing_cycle_end?: string | null
          billing_cycle_start?: string | null
          card_brand?: string | null
          card_last4?: string | null
          created_at?: string
          currency?: string
          id?: string
          minutes_limit?: number | null
          minutes_used?: number
          next_payment_date?: string | null
          paystack_customer_code?: string | null
          paystack_email_token?: string | null
          paystack_subscription_code?: string | null
          plan?: string | null
          plan_id?: string | null
          plan_name?: string
          plan_price_usd?: number | null
          status?: string
          team_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "user_plan_features"
            referencedColumns: ["plan_id"]
          },
          {
            foreignKeyName: "subscriptions_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
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
          accepted_at: string | null
          created_at: string
          email: string
          expires_at: string | null
          id: string
          invite_token: string | null
          invited_by: string
          inviter_name: string | null
          role: string
          status: string
          team_id: string
          team_name_cache: string | null
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          expires_at?: string | null
          id?: string
          invite_token?: string | null
          invited_by: string
          inviter_name?: string | null
          role?: string
          status?: string
          team_id: string
          team_name_cache?: string | null
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string | null
          id?: string
          invite_token?: string | null
          invited_by?: string
          inviter_name?: string | null
          role?: string
          status?: string
          team_id?: string
          team_name_cache?: string | null
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
          {
            foreignKeyName: "team_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_plan_features"
            referencedColumns: ["user_id"]
          },
        ]
      }
      team_message_reactions: {
        Row: {
          created_at: string | null
          emoji: string
          id: string
          message_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          emoji: string
          id?: string
          message_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          emoji?: string
          id?: string
          message_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_message_reactions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "team_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      team_messages: {
        Row: {
          conversation_id: string
          created_at: string
          edited_at: string | null
          file_name: string | null
          file_type: string | null
          file_url: string | null
          id: string
          is_deleted: boolean | null
          message_text: string
          parent_id: string | null
          sender_id: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          edited_at?: string | null
          file_name?: string | null
          file_type?: string | null
          file_url?: string | null
          id?: string
          is_deleted?: boolean | null
          message_text: string
          parent_id?: string | null
          sender_id: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          edited_at?: string | null
          file_name?: string | null
          file_type?: string | null
          file_url?: string | null
          id?: string
          is_deleted?: boolean | null
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
      team_minute_usage: {
        Row: {
          call_id: string
          id: string
          minutes_used: number
          recorded_at: string
          team_id: string
          user_id: string
        }
        Insert: {
          call_id: string
          id?: string
          minutes_used: number
          recorded_at?: string
          team_id: string
          user_id: string
        }
        Update: {
          call_id?: string
          id?: string
          minutes_used?: number
          recorded_at?: string
          team_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_minute_usage_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: true
            referencedRelation: "active_live_calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_minute_usage_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: true
            referencedRelation: "calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_minute_usage_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
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
          speaker_name: string | null
          speaker_role: string | null
          text: string
          timestamp: string
          user_id: string
        }
        Insert: {
          call_id: string
          id?: string
          speaker: string
          speaker_name?: string | null
          speaker_role?: string | null
          text: string
          timestamp?: string
          user_id: string
        }
        Update: {
          call_id?: string
          id?: string
          speaker?: string
          speaker_name?: string | null
          speaker_role?: string | null
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
      usage_logs: {
        Row: {
          billing_month: string
          call_id: string
          duration_minutes: number
          id: string
          is_overage: boolean
          overage_minutes: number
          recorded_at: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          billing_month: string
          call_id: string
          duration_minutes?: number
          id?: string
          is_overage?: boolean
          overage_minutes?: number
          recorded_at?: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          billing_month?: string
          call_id?: string
          duration_minutes?: number
          id?: string
          is_overage?: boolean
          overage_minutes?: number
          recorded_at?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "usage_logs_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: true
            referencedRelation: "active_live_calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usage_logs_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: true
            referencedRelation: "calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usage_logs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspace_meeting_usage"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "usage_logs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      usage_summary: {
        Row: {
          billing_month: string
          id: string
          overage_minutes: number
          reset_at: string | null
          total_minutes_used: number
          updated_at: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          billing_month: string
          id?: string
          overage_minutes?: number
          reset_at?: string | null
          total_minutes_used?: number
          updated_at?: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          billing_month?: string
          id?: string
          overage_minutes?: number
          reset_at?: string | null
          total_minutes_used?: number
          updated_at?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "usage_summary_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspace_meeting_usage"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "usage_summary_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      user_preferences: {
        Row: {
          ai_summary_auto_generate: boolean
          coaching_clips_enabled: boolean
          crm_auto_sync: boolean
          deal_room_auto_create: boolean
          id: string
          post_call_email_summary: boolean
          real_time_objection_alerts: boolean
          transcript_visible_to_team: boolean
          updated_at: string
          user_id: string
          weekly_digest_email: boolean
        }
        Insert: {
          ai_summary_auto_generate?: boolean
          coaching_clips_enabled?: boolean
          crm_auto_sync?: boolean
          deal_room_auto_create?: boolean
          id?: string
          post_call_email_summary?: boolean
          real_time_objection_alerts?: boolean
          transcript_visible_to_team?: boolean
          updated_at?: string
          user_id: string
          weekly_digest_email?: boolean
        }
        Update: {
          ai_summary_auto_generate?: boolean
          coaching_clips_enabled?: boolean
          crm_auto_sync?: boolean
          deal_room_auto_create?: boolean
          id?: string
          post_call_email_summary?: boolean
          real_time_objection_alerts?: boolean
          transcript_visible_to_team?: boolean
          updated_at?: string
          user_id?: string
          weekly_digest_email?: boolean
        }
        Relationships: []
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
      user_statuses: {
        Row: {
          auto_status_enabled: boolean | null
          custom_text: string | null
          is_manual: boolean | null
          last_activity_at: string | null
          last_page: string | null
          last_seen_at: string | null
          manual_override_until: string | null
          status: string
          team_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          auto_status_enabled?: boolean | null
          custom_text?: string | null
          is_manual?: boolean | null
          last_activity_at?: string | null
          last_page?: string | null
          last_seen_at?: string | null
          manual_override_until?: string | null
          status?: string
          team_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          auto_status_enabled?: boolean | null
          custom_text?: string | null
          is_manual?: boolean | null
          last_activity_at?: string | null
          last_page?: string | null
          last_seen_at?: string | null
          manual_override_until?: string | null
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
      webhook_deliveries: {
        Row: {
          attempt: number | null
          delivered_at: string | null
          event_type: string
          id: string
          payload: Json | null
          response_body: string | null
          response_status: number | null
          subscription_id: string | null
          success: boolean | null
        }
        Insert: {
          attempt?: number | null
          delivered_at?: string | null
          event_type: string
          id?: string
          payload?: Json | null
          response_body?: string | null
          response_status?: number | null
          subscription_id?: string | null
          success?: boolean | null
        }
        Update: {
          attempt?: number | null
          delivered_at?: string | null
          event_type?: string
          id?: string
          payload?: Json | null
          response_body?: string | null
          response_status?: number | null
          subscription_id?: string | null
          success?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "webhook_deliveries_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "webhook_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_events: {
        Row: {
          event_type: string
          id: string
          payload: Json | null
          processed_at: string
          provider: string
          reference: string
        }
        Insert: {
          event_type: string
          id?: string
          payload?: Json | null
          processed_at?: string
          provider?: string
          reference: string
        }
        Update: {
          event_type?: string
          id?: string
          payload?: Json | null
          processed_at?: string
          provider?: string
          reference?: string
        }
        Relationships: []
      }
      webhook_subscriptions: {
        Row: {
          active: boolean | null
          created_at: string | null
          events: string[]
          failure_count: number | null
          id: string
          last_triggered: string | null
          secret: string | null
          url: string
          user_id: string | null
        }
        Insert: {
          active?: boolean | null
          created_at?: string | null
          events: string[]
          failure_count?: number | null
          id?: string
          last_triggered?: string | null
          secret?: string | null
          url: string
          user_id?: string | null
        }
        Update: {
          active?: boolean | null
          created_at?: string | null
          events?: string[]
          failure_count?: number | null
          id?: string
          last_triggered?: string | null
          secret?: string | null
          url?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "webhook_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhook_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_plan_features"
            referencedColumns: ["user_id"]
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
      upcoming_meeting_reminders: {
        Row: {
          meeting_id: string | null
          meeting_link: string | null
          pending_reminder_type: string | null
          reminder_10min_sent: boolean | null
          reminder_60min_sent: boolean | null
          reminder_start_sent: boolean | null
          scheduled_time: string | null
          title: string | null
          user_email: string | null
          user_id: string | null
          user_name: string | null
        }
        Relationships: []
      }
      user_plan_features: {
        Row: {
          calls_limit: number | null
          email: string | null
          feature_flags: Json | null
          has_minutes_remaining: boolean | null
          minute_quota: number | null
          minutes_remaining: number | null
          minutes_used: number | null
          monthly_price_usd: number | null
          plan_id: string | null
          plan_type: string | null
          team_members_limit: number | null
          user_id: string | null
        }
        Relationships: []
      }
      workspace_meeting_usage: {
        Row: {
          meetings_used: number | null
          minutes_used: number | null
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
      accept_invitation_by_token: { Args: { p_token: string }; Returns: Json }
      accept_team_invitation: {
        Args: { p_team_id: string }
        Returns: undefined
      }
      admin_delete_user:
        | { Args: { p_user_id: string }; Returns: undefined }
        | { Args: { p_admin_id?: string; p_user_id: string }; Returns: Json }
      admin_get_all_users: {
        Args: never
        Returns: {
          amount_kobo: number
          billing_status: string
          calls_limit: number
          calls_used: number
          created_at: string
          email: string
          full_name: string
          minutes_used: number
          plan_price_usd: number
          plan_type: string
          subscription_created_at: string
          subscription_status: string
          team_id: string
          team_name: string
          team_role: string
          user_id: string
        }[]
      }
      admin_get_stats: { Args: never; Returns: Json }
      admin_log_action: {
        Args: {
          p_action: string
          p_admin_email: string
          p_details?: Json
          p_target_email?: string
          p_target_id?: string
        }
        Returns: undefined
      }
      admin_override_user_plan: {
        Args: {
          p_admin_id?: string
          p_calls_limit?: number
          p_plan_type: string
          p_user_id: string
        }
        Returns: Json
      }
      admin_override_user_usage: {
        Args: {
          p_admin_id?: string
          p_calls_limit: number
          p_calls_used: number
          p_user_id: string
        }
        Returns: Json
      }
      admin_reset_user_usage: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      admin_update_last_login: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      admin_update_user_limit: {
        Args: { p_calls_limit: number; p_user_id: string }
        Returns: undefined
      }
      admin_update_user_plan:
        | { Args: { p_plan: string; p_user_id: string }; Returns: undefined }
        | {
            Args: {
              p_calls_limit?: number
              p_plan_type: string
              p_user_id: string
            }
            Returns: undefined
          }
      attach_call_to_deal: {
        Args: { p_call_id: string; p_deal_id: string }
        Returns: undefined
      }
      auto_clear_zombie_calls: { Args: never; Returns: number }
      auto_set_user_status: {
        Args: { p_page: string; p_team_id?: string }
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
      check_call_quota: { Args: { p_user_id: string }; Returns: Json }
      check_feature_access: {
        Args: { p_feature: string; p_user_id: string }
        Returns: boolean
      }
      check_team_quota: {
        Args: { p_team_id: string; p_user_id: string }
        Returns: Json
      }
      check_team_usage_limit: { Args: { p_team_id: string }; Returns: boolean }
      check_usage_quota: {
        Args: { p_user_id: string }
        Returns: {
          is_over_quota: boolean
          minute_quota: number
          minutes_remaining: number
          minutes_used: number
          overage_minutes: number
          plan_id: string
        }[]
      }
      cleanup_stale_typing: { Args: never; Returns: undefined }
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
      create_notification: {
        Args: {
          p_idempotency_key?: string
          p_link?: string
          p_message: string
          p_reference_id?: string
          p_title: string
          p_type: string
          p_user_id: string
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
      current_billing_month: { Args: never; Returns: string }
      deactivate_push_subscription: {
        Args: { p_endpoint: string }
        Returns: undefined
      }
      decline_invitation_by_token: { Args: { p_token: string }; Returns: Json }
      decline_team_invitation: {
        Args: { p_team_id: string }
        Returns: undefined
      }
      delete_dcm_message: { Args: { p_message_id: string }; Returns: undefined }
      edit_dcm_message: {
        Args: { p_content: string; p_message_id: string }
        Returns: undefined
      }
      ensure_activity_channel: { Args: { p_team_id: string }; Returns: string }
      ensure_deal_channel: {
        Args: { p_deal_id: string; p_team_id: string }
        Returns: string
      }
      ensure_workspace_for_team: {
        Args: { p_admin_user_id: string; p_team_id: string }
        Returns: undefined
      }
      force_clear_user_live_calls: {
        Args: { p_user_id: string }
        Returns: number
      }
      get_active_webhook_subscriptions: {
        Args: { p_event_type: string; p_user_id: string }
        Returns: {
          events: string[]
          id: string
          secret: string
          url: string
        }[]
      }
      get_admin_dashboard_stats: { Args: never; Returns: Json }
      get_admin_effective_plan_key: {
        Args: { p_admin_id: string }
        Returns: string
      }
      get_admin_plan_clusters: { Args: never; Returns: Json }
      get_admin_platform_stats: { Args: never; Returns: Json }
      get_admin_revenue_breakdown: { Args: never; Returns: Json }
      get_admin_users: {
        Args: {
          p_limit?: number
          p_offset?: number
          p_plan_filter?: string
          p_search?: string
        }
        Returns: Json
      }
      get_channel_messages: {
        Args: { p_before?: string; p_channel_id: string; p_limit?: number }
        Returns: {
          channel_id: string
          content: string
          created_at: string
          edited_at: string
          id: string
          is_deleted: boolean
          is_pinned: boolean
          metadata: Json
          parent_id: string
          reactions: Json
          reply_count: number
          sender_avatar: string
          sender_email: string
          sender_name: string
          type: string
          user_id: string
        }[]
      }
      get_channel_messages_v2: {
        Args: { p_channel_id: string; p_limit?: number }
        Returns: {
          channel_id: string
          content: string
          created_at: string
          edited_at: string
          id: string
          is_deleted: boolean
          is_pinned: boolean
          metadata: Json
          parent_id: string
          reactions: Json
          reply_to_sender_name: string
          reply_to_text: string
          sender_email: string
          sender_full_name: string
          type: string
          user_id: string
        }[]
      }
      get_channel_reactions: {
        Args: { p_channel_id: string }
        Returns: {
          count: number
          emoji: string
          has_mine: boolean
          message_id: string
        }[]
      }
      get_conversations_with_context: {
        Args: { p_user_id: string }
        Returns: Json
      }
      get_deal_channels: {
        Args: { p_team_id: string }
        Returns: {
          call_id: string
          call_name: string
          deal_health: number
          deal_id: string
          deal_name: string
          deal_stage: string
          deal_value: number
          id: string
          last_msg: string
          last_msg_at: string
          last_msg_user: string
          msg_count: number
          name: string
          pinned_count: number
          type: string
          unread_count: number
        }[]
      }
      get_deal_channels_v2: {
        Args: { p_team_id: string }
        Returns: {
          call_id: string
          call_name: string
          call_sentiment: number
          call_summary: string
          deal_health: number
          deal_id: string
          deal_name: string
          deal_next_step: string
          deal_stage: string
          deal_value: number
          id: string
          is_muted: boolean
          last_msg: string
          last_msg_at: string
          msg_count: number
          name: string
          type: string
          unread_count: number
        }[]
      }
      get_deal_detail_v2: { Args: { p_deal_id: string }; Returns: Json }
      get_deal_with_calls: { Args: { p_deal_id: string }; Returns: Json }
      get_effective_calls_limit: { Args: { _user_id: string }; Returns: number }
      get_effective_plan: { Args: { _user_id: string }; Returns: string }
      get_effective_plan_id: { Args: { p_user_id: string }; Returns: string }
      get_invitation_by_token: {
        Args: { p_token: string }
        Returns: {
          email: string
          expires_at: string
          id: string
          inviter_name: string
          is_expired: boolean
          plan_key: string
          role: string
          status: string
          team_id: string
          team_name: string
        }[]
      }
      get_meetings_needing_reminders: {
        Args: never
        Returns: {
          meeting_id: string
          meeting_link: string
          reminder_type: string
          scheduled_time: string
          title: string
          user_id: string
        }[]
      }
      get_messages_with_senders: {
        Args: { p_conversation_id: string; p_user_id: string }
        Returns: Json
      }
      get_my_pending_invitations: {
        Args: never
        Returns: {
          created_at: string
          email: string
          id: string
          invite_token: string
          inviter_name: string
          role: string
          status: string
          team_id: string
          team_name: string
        }[]
      }
      get_my_plan: { Args: never; Returns: string }
      get_or_create_dm_channel: {
        Args: { p_other_user: string; p_team_id: string }
        Returns: string
      }
      get_pipeline_health: { Args: { p_user_id: string }; Returns: Json }
      get_plan_minute_quota: { Args: { p_plan_id: string }; Returns: number }
      get_public_clip: {
        Args: { p_share_token: string }
        Returns: {
          call_id: string
          call_recording_url: string
          call_title: string
          created_at: string
          creator_name: string
          duration_seconds: number
          end_seconds: number
          id: string
          is_public: boolean
          manager_comment: string
          start_seconds: number
          tags: string[]
          title: string
          transcript_excerpt: Json
          view_count: number
        }[]
      }
      get_team_clips: {
        Args: { p_team_id: string }
        Returns: {
          call_id: string
          call_recording_url: string
          call_title: string
          created_at: string
          creator_id: string
          creator_name: string
          duration_seconds: number
          end_seconds: number
          id: string
          is_public: boolean
          manager_comment: string
          reactions: Json
          share_token: string
          start_seconds: number
          tags: string[]
          title: string
          transcript_excerpt: Json
          view_count: number
        }[]
      }
      get_team_messages_with_senders: {
        Args: { p_conversation_id: string; p_limit?: number }
        Returns: {
          conversation_id: string
          created_at: string
          edited_at: string
          file_name: string
          file_type: string
          file_url: string
          id: string
          is_deleted: boolean
          message_text: string
          parent_id: string
          reactions: Json
          read_by: string[]
          reply_to_sender_name: string
          reply_to_text: string
          sender_email: string
          sender_full_name: string
          sender_id: string
        }[]
      }
      get_team_plan_info: { Args: { p_user_id: string }; Returns: Json }
      get_team_role: {
        Args: { _team_id: string; _user_id: string }
        Returns: string
      }
      get_team_subscription: {
        Args: { p_team_id: string }
        Returns: {
          amount_kobo: number
          billing_cycle_end: string | null
          billing_cycle_start: string | null
          card_brand: string | null
          card_last4: string | null
          created_at: string
          currency: string
          id: string
          minutes_limit: number | null
          minutes_used: number
          next_payment_date: string | null
          paystack_customer_code: string | null
          paystack_email_token: string | null
          paystack_subscription_code: string | null
          plan: string | null
          plan_id: string | null
          plan_name: string
          plan_price_usd: number | null
          status: string
          team_id: string | null
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "subscriptions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_team_usage_summary: { Args: { p_team_id: string }; Returns: Json }
      get_thread_replies: {
        Args: { p_parent_id: string }
        Returns: {
          channel_id: string
          content: string
          created_at: string
          edited_at: string
          id: string
          is_deleted: boolean
          metadata: Json
          reactions: Json
          sender_email: string
          sender_name: string
          type: string
          user_id: string
        }[]
      }
      get_total_unread_for_user: {
        Args: { p_user_id: string }
        Returns: number
      }
      get_upcoming_meetings_with_context: {
        Args: { p_hours_ahead?: number }
        Returns: {
          id: string
          is_starting_soon: boolean
          last_objection_summary: string
          last_sentiment: number
          meeting_link: string
          meeting_type: string
          minutes_until_start: number
          notes: string
          reschedule_count: number
          rescheduled_from: string
          scheduled_time: string
          status: string
          title: string
        }[]
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
      get_user_entitlements: { Args: { p_user_id: string }; Returns: Json }
      get_user_plan_features: { Args: { p_user_id: string }; Returns: Json }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      increment_join_attempts: { Args: { p_call_id: string }; Returns: number }
      increment_usage_summary: {
        Args: { p_minutes: number; p_month: string; p_user_id: string }
        Returns: undefined
      }
      is_admin:
        | { Args: never; Returns: boolean }
        | { Args: { p_user_id: string }; Returns: boolean }
      is_conversation_participant: {
        Args: { _conversation_id: string; _user_id: string }
        Returns: boolean
      }
      is_team_member: {
        Args: { _team_id: string; _user_id: string }
        Returns: boolean
      }
      link_call_to_deal_v2: {
        Args: { p_call_id: string; p_deal_id: string }
        Returns: undefined
      }
      list_deals_v2: {
        Args: never
        Returns: {
          ai_insights: Json
          assigned_to: string
          avg_sentiment: number
          call_count: number
          close_date: string
          company: string
          contact_email: string
          contact_name: string
          created_at: string
          currency: string
          deal_health_score: number
          deal_summary: string
          id: string
          last_call_at: string
          name: string
          next_best_action: string
          next_step: string
          next_step_due: string
          notes: string
          owner_id: string
          probability: number
          risk_flags: Json
          risk_score: number
          sentiment_trend: string
          source: string
          stage: string
          tags: string[]
          team_id: string
          updated_at: string
          value: number
        }[]
      }
      list_my_deals: {
        Args: never
        Returns: {
          avg_sentiment: number
          call_count: number
          close_date: string
          company: string
          contact_name: string
          created_at: string
          deal_summary: string
          id: string
          last_call_at: string
          name: string
          next_step: string
          probability: number
          risk_score: number
          sentiment_trend: string
          stage: string
          updated_at: string
          value: number
        }[]
      }
      log_call_usage: {
        Args: {
          p_call_id: string
          p_duration_minutes: number
          p_user_id: string
        }
        Returns: undefined
      }
      mark_inactive_users_away: { Args: never; Returns: undefined }
      mark_reminder_sent: {
        Args: { p_meeting_id: string; p_reminder_type: string }
        Returns: undefined
      }
      my_plan_has_feature: { Args: { p_feature: string }; Returns: boolean }
      normalize_plan_key: { Args: { plan_name: string }; Returns: string }
      plan_name_to_key: { Args: { plan_name: string }; Returns: string }
      plan_tier_order: { Args: { plan_key: string }; Returns: number }
      post_call_insight_to_channel: {
        Args: { p_call_id: string; p_channel_id: string; p_insight: Json }
        Returns: string
      }
      propagate_team_plan: { Args: { p_admin_id: string }; Returns: undefined }
      record_team_minute_usage: {
        Args: {
          p_call_id: string
          p_minutes: number
          p_team_id: string
          p_user_id: string
        }
        Returns: undefined
      }
      reschedule_meeting: {
        Args: { p_meeting_id: string; p_new_time: string }
        Returns: {
          call_id: string | null
          created_at: string
          id: string
          last_objection_summary: string | null
          last_sentiment: number | null
          meeting_link: string | null
          meeting_type: string | null
          notes: string | null
          participants: string[] | null
          reminder_10min_sent: boolean
          reminder_60min_sent: boolean
          reminder_start_sent: boolean
          reschedule_count: number
          rescheduled_from: string | null
          scheduled_time: string
          status: string
          title: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "scheduled_meetings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reset_monthly_usage: { Args: never; Returns: number }
      reset_team_monthly_usage: { Args: never; Returns: number }
      resolve_minute_quota: { Args: { p_plan_name: string }; Returns: number }
      search_deal_messages: {
        Args: { p_query: string; p_team_id: string }
        Returns: {
          channel_id: string
          channel_name: string
          content: string
          created_at: string
          deal_name: string
          message_id: string
          sender_name: string
        }[]
      }
      set_typing_status: {
        Args: {
          p_channel_id: string
          p_is_typing: boolean
          p_user_name?: string
        }
        Returns: undefined
      }
      toggle_dcm_reaction: {
        Args: { p_emoji: string; p_message_id: string }
        Returns: Json
      }
      update_deal_health: {
        Args: {
          p_deal_id: string
          p_health_score: number
          p_insights: Json
          p_next_best_action: string
          p_risk_flags: Json
          p_sentiment_trend: string
        }
        Returns: undefined
      }
      update_meeting_status: {
        Args: { p_meeting_id: string; p_status: string }
        Returns: undefined
      }
      upsert_user_presence: {
        Args: {
          p_custom_text?: string
          p_is_manual?: boolean
          p_last_page?: string
          p_status?: string
          p_team_id?: string
        }
        Returns: undefined
      }
      upsert_user_status: {
        Args: {
          p_custom_text?: string
          p_is_manual?: boolean
          p_last_page?: string
          p_status: string
          p_team_id?: string
        }
        Returns: undefined
      }
      verify_admin_user: { Args: { p_email: string }; Returns: Json }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
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
      app_role: ["admin", "moderator", "user"],
    },
  },
} as const
