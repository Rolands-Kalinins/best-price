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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      allowed_emails: {
        Row: {
          email: string
          role: string
        }
        Insert: {
          email: string
          role?: string
        }
        Update: {
          email?: string
          role?: string
        }
        Relationships: []
      }
      scrape_runs: {
        Row: {
          error: string | null
          finished_at: string
          id: number
          invalid_count: number
          items_count: number
          source_id: number
          started_at: string
          status: string
        }
        Insert: {
          error?: string | null
          finished_at?: string
          id?: never
          invalid_count?: number
          items_count?: number
          source_id: number
          started_at: string
          status: string
        }
        Update: {
          error?: string | null
          finished_at?: string
          id?: never
          invalid_count?: number
          items_count?: number
          source_id?: number
          started_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "scrape_runs_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      sources: {
        Row: {
          enabled: boolean
          id: number
          module: string
          name: string
          slug: string
          url: string
        }
        Insert: {
          enabled?: boolean
          id?: never
          module: string
          name: string
          slug: string
          url: string
        }
        Update: {
          enabled?: boolean
          id?: never
          module?: string
          name?: string
          slug?: string
          url?: string
        }
        Relationships: []
      }
      users: {
        Row: {
          email: string
          id: string
          role: string
        }
        Insert: {
          email: string
          id: string
          role?: string
        }
        Update: {
          email?: string
          id?: string
          role?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_admin: { Args: never; Returns: boolean }
      is_member: { Args: never; Returns: boolean }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  // Вручную: генератор Supabase отдаёт только схему public. Обновлять вместе с миграциями grocery.
  grocery: {
    Tables: {
      offers: {
        Row: {
          brand: string | null
          cat: string | null
          category: string | null
          condition: string | null
          discount: number | null
          discount_percent: number | null
          ean: string | null
          ends_at: string | null
          external_id: string
          id: number
          image_url: string | null
          last_seen_at: string
          old_price: number | null
          packaging: string | null
          price: number | null
          product_id: number | null
          search: string
          source_id: number
          starts_at: string | null
          title: string
          unit: string | null
          unit_price: number | null
          url: string | null
        }
        Insert: {
          brand?: string | null
          cat?: string | null
          category?: string | null
          condition?: string | null
          discount?: never
          discount_percent?: number | null
          ean?: string | null
          ends_at?: string | null
          external_id: string
          id?: never
          image_url?: string | null
          last_seen_at?: string
          old_price?: number | null
          packaging?: string | null
          price?: number | null
          product_id?: number | null
          search?: never
          source_id: number
          starts_at?: string | null
          title: string
          unit?: string | null
          unit_price?: number | null
          url?: string | null
        }
        Update: {
          brand?: string | null
          cat?: string | null
          category?: string | null
          condition?: string | null
          discount?: never
          discount_percent?: number | null
          ean?: string | null
          ends_at?: string | null
          external_id?: string
          id?: never
          image_url?: string | null
          last_seen_at?: string
          old_price?: number | null
          packaging?: string | null
          price?: number | null
          product_id?: number | null
          search?: never
          source_id?: number
          starts_at?: string | null
          title?: string
          unit?: string | null
          unit_price?: number | null
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "offers_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offers_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: { id: number; key: string; title: string }
        Insert: { id?: never; key: string; title: string }
        Update: { id?: never; key?: string; title?: string }
        Relationships: []
      }
      match_decisions: {
        Row: { key_a: string; key_b: string; same: boolean; decided_at: string }
        Insert: { key_a: string; key_b: string; same: boolean; decided_at?: string }
        Update: { key_a?: string; key_b?: string; same?: boolean; decided_at?: string }
        Relationships: []
      }
      match_exclusions: {
        Row: { offer_id: number; excluded_at: string }
        Insert: { offer_id: number; excluded_at?: string }
        Update: { offer_id?: number; excluded_at?: string }
        Relationships: [
          {
            foreignKeyName: "match_exclusions_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: true
            referencedRelation: "offers"
            referencedColumns: ["id"]
          },
        ]
      }
      match_suggestions: {
        Row: { ai_reason: string | null; ai_same: boolean | null; key_a: string; key_b: string; offer_ids: number[] }
        Insert: { ai_reason?: string | null; ai_same?: boolean | null; key_a: string; key_b: string; offer_ids: number[] }
        Update: { ai_reason?: string | null; ai_same?: boolean | null; key_a?: string; key_b?: string; offer_ids?: number[] }
        Relationships: []
      }
      ai_limits: {
        Row: { model: string; rpd: number; rpm: number; tpm: number }
        Insert: { model: string; rpd: number; rpm: number; tpm: number }
        Update: { model?: string; rpd?: number; rpm?: number; tpm?: number }
        Relationships: []
      }
      ai_usage: {
        Row: { day: string; errors: number; last_error: string | null; last_quota_hit_at: string | null; model: string; quota_hits: number; requests: number; tokens_in: number; tokens_out: number; updated_at: string }
        Insert: { day: string; errors?: number; last_error?: string | null; last_quota_hit_at?: string | null; model: string; quota_hits?: number; requests?: number; tokens_in?: number; tokens_out?: number; updated_at?: string }
        Update: { day?: string; errors?: number; last_error?: string | null; last_quota_hit_at?: string | null; model?: string; quota_hits?: number; requests?: number; tokens_in?: number; tokens_out?: number; updated_at?: string }
        Relationships: []
      }
      pair_verdicts: {
        Row: { key_a: string; key_b: string; prompt_version: number; reason: string; same: boolean }
        Insert: { key_a: string; key_b: string; prompt_version: number; reason: string; same: boolean }
        Update: { key_a?: string; key_b?: string; prompt_version?: number; reason?: string; same?: boolean }
        Relationships: []
      }
      title_attrs: {
        Row: { brand: string | null; prompt_version: number; title_key: string }
        Insert: { brand?: string | null; prompt_version: number; title_key: string }
        Update: { brand?: string | null; prompt_version?: number; title_key?: string }
        Relationships: []
      }
      price_history: {
        Row: {
          day: string
          offer_id: number
          price: number
        }
        Insert: {
          day?: string
          offer_id: number
          price: number
        }
        Update: {
          day?: string
          offer_id?: number
          price?: number
        }
        Relationships: [
          {
            foreignKeyName: "price_history_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "offers"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_ai_usage: {
        Args: { p_day: string; p_errors: number; p_last_error: string | null; p_model: string; p_quota_hit_at: string | null; p_quota_hits: number; p_requests: number; p_tokens_in: number; p_tokens_out: number }
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
