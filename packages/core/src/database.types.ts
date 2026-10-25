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
}
