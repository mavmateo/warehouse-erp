// AUTO-GENERATED – do not edit manually.
// Regenerate with:  pnpm db:generate
// Project:  baleshop-gh  (theqmgdegpotidrdhwqj)  eu-west-1

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      expenses: {
        Row: {
          amount:       number | null
          category:     string | null
          created_at:   string | null
          description:  string | null
          expense_date: string
          id:           number
        }
        Insert: {
          amount?:      number | null
          category?:    string | null
          created_at?:  string | null
          description?: string | null
          expense_date?: string
          id?:          number
        }
        Update: {
          amount?:      number | null
          category?:    string | null
          created_at?:  string | null
          description?: string | null
          expense_date?: string
          id?:          number
        }
        Relationships: []
      }
      products: {
        Row: {
          buy_price:     number | null
          category:      string | null
          created_at:    string | null
          id:            number
          name:          string
          reorder_level: number | null
          sell_price:    number | null
          sku:           string | null
          stock:         number | null
          supplier:      string | null
          unit:          string | null
        }
        Insert: {
          buy_price?:     number | null
          category?:      string | null
          created_at?:    string | null
          id?:            number
          name:           string
          reorder_level?: number | null
          sell_price?:    number | null
          sku?:           string | null
          stock?:         number | null
          supplier?:      string | null
          unit?:          string | null
        }
        Update: {
          buy_price?:     number | null
          category?:      string | null
          created_at?:    string | null
          id?:            number
          name?:          string
          reorder_level?: number | null
          sell_price?:    number | null
          sku?:           string | null
          stock?:         number | null
          supplier?:      string | null
          unit?:          string | null
        }
        Relationships: []
      }
      sale_items: {
        Row: {
          id:           number
          product_id:   number | null
          product_name: string | null
          quantity:     number | null
          sale_id:      number | null
          unit_price:   number | null
        }
        Insert: {
          id?:           number
          product_id?:   number | null
          product_name?: string | null
          quantity?:     number | null
          sale_id?:      number | null
          unit_price?:   number | null
        }
        Update: {
          id?:           number
          product_id?:   number | null
          product_name?: string | null
          quantity?:     number | null
          sale_id?:      number | null
          unit_price?:   number | null
        }
        Relationships: [
          {
            foreignKeyName:    "sale_items_product_id_fkey"
            columns:           ["product_id"]
            isOneToOne:        false
            referencedRelation:"products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName:    "sale_items_sale_id_fkey"
            columns:           ["sale_id"]
            isOneToOne:        false
            referencedRelation:"sales"
            referencedColumns: ["id"]
          },
        ]
      }
      sales: {
        Row: {
          created_at:     string | null
          customer:       string | null
          id:             number
          payment_method: string | null
          sale_date:      string
          total:          number | null
        }
        Insert: {
          created_at?:     string | null
          customer?:       string | null
          id?:             number
          payment_method?: string | null
          sale_date?:      string
          total?:          number | null
        }
        Update: {
          created_at?:     string | null
          customer?:       string | null
          id?:             number
          payment_method?: string | null
          sale_date?:      string
          total?:          number | null
        }
        Relationships: []
      }
      suppliers: {
        Row: {
          address:    string | null
          balance:    number | null
          created_at: string | null
          id:         number
          last_order: string | null
          name:       string
          phone:      string | null
        }
        Insert: {
          address?:    string | null
          balance?:    number | null
          created_at?: string | null
          id?:         number
          last_order?: string | null
          name:        string
          phone?:      string | null
        }
        Update: {
          address?:    string | null
          balance?:    number | null
          created_at?: string | null
          id?:         number
          last_order?: string | null
          name?:       string
          phone?:      string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      run_query: { Args: { sql: string }; Returns: Json }
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

export type Tables<T extends keyof DefaultSchema["Tables"]> =
  DefaultSchema["Tables"][T]["Row"]

export type TablesInsert<T extends keyof DefaultSchema["Tables"]> =
  DefaultSchema["Tables"][T]["Insert"]

export type TablesUpdate<T extends keyof DefaultSchema["Tables"]> =
  DefaultSchema["Tables"][T]["Update"]
