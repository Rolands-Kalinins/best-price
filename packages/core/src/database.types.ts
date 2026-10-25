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
          category: string | null
          condition: string | null
          ean: string | null
          ends_at: string | null
          external_id: string
          id: number
          image_url: string | null
          last_seen_at: string
          old_price: number | null
          packaging: string | null
          price: number
          source_id: number
          starts_at: string | null
          title: string
          unit: string | null
          unit_price: number | null
          url: string | null
        }
        Insert: {
          brand?: string | null
          category?: string | null
          condition?: string | null
          ean?: string | null
          ends_at?: string | null
          external_id: string
          id?: never
          image_url?: string | null
          last_seen_at?: string
          old_price?: number | null
          packaging?: string | null
          price: number
          source_id: number
          starts_at?: string | null
          title: string
          unit?: string | null
          unit_price?: number | null
          url?: string | null
        }
        Update: {
          brand?: string | null
          category?: string | null
          condition?: string | null
          ean?: string | null
          ends_at?: string | null
          external_id?: string
          id?: never
          image_url?: string | null
          last_seen_at?: string
          old_price?: number | null
          packaging?: string | null
          price?: number
          source_id?: number
          starts_at?: string | null
          title?: string
          unit?: string | null
          unit_price?: number | null
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "offers_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
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
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
