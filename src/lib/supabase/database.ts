import type {
  CatalogItem,
  CatFood,
  EndSessionResult,
  InventoryRow,
  ItemCategory,
  Profile,
  RoomLayoutRow,
  SessionStatus,
  Streak,
  StudySession,
  Subject,
  TodaySummary,
  Transaction,
  TransactionReason,
  Wallet,
} from './types'

/**
 * The schema, in the shape `createClient<Database>` wants.
 *
 * Without this, every `.from(...)` and `.rpc(...)` hands back `any`, which
 * means a mistyped column name fails silently as `undefined` at runtime
 * instead of loudly at compile time. This is hand-written to match
 * `supabase/migrations/`; regenerate it with `supabase gen types typescript`
 * if the CLI is ever added, and edit it in the same commit as a migration.
 */

/** Rows the client may insert. Everything else is written by an RPC. */
type SubjectInsert = {
  user_id: string
  name: string
  color?: string
  archived?: boolean
}

type RoomLayoutInsert = {
  user_id: string
  item_id: string
  grid_x: number
  grid_y: number
  rotation?: number
  z_index?: number
}

/** Columns the client may change on its own profile. */
type ProfileUpdate = Partial<
  Pick<
    Profile,
    | 'display_name'
    | 'cat_name'
    | 'cat_variant'
    | 'daily_goal_minutes'
    | 'timezone'
    | 'onboarded_at'
  >
>

type ReadOnly<Row> = {
  Row: Row
  // These tables have no write policy at all — see 0002_economy_schema.sql.
  Insert: never
  Update: never
  Relationships: []
}

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: Profile
        Insert: never
        Update: ProfileUpdate
        Relationships: []
      }
      subjects: {
        Row: Subject
        Insert: SubjectInsert
        Update: Partial<SubjectInsert>
        Relationships: []
      }
      study_sessions: ReadOnly<StudySession>
      wallet: ReadOnly<Wallet>
      transactions: ReadOnly<Transaction>
      streaks: ReadOnly<Streak>
      inventory: ReadOnly<InventoryRow>
      catalog_items: ReadOnly<CatalogItem>
      cat_foods: ReadOnly<CatFood>
      room_layout: {
        Row: RoomLayoutRow
        Insert: RoomLayoutInsert
        Update: Partial<RoomLayoutInsert>
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: {
      start_session: {
        Args: { p_subject_id?: string | null; p_label?: string | null }
        Returns: StudySession
      }
      end_session: {
        Args: { p_session_id: string; p_client_seconds?: number | null }
        Returns: EndSessionResult
      }
      pause_session: { Args: { p_session_id: string }; Returns: StudySession }
      resume_session: { Args: { p_session_id: string }; Returns: StudySession }
      abandon_session: { Args: { p_session_id: string }; Returns: StudySession }
      purchase_item: {
        Args: { p_item_id: string }
        Returns: { item_id: string; spent: number; coins: number }
      }
      feed_cat: {
        Args: { p_food_id: string }
        Returns: { food_id: string; spent: number; coins: number }
      }
      get_today: {
        Args: Record<string, never>
        Returns: TodaySummary & { server_now: string }
      }
      complete_onboarding: {
        Args: {
          p_cat_name: string
          p_cat_variant: number
          p_daily_goal: number
          p_timezone: string
        }
        Returns: Profile
      }
      get_daily_totals: {
        Args: { p_days?: number }
        Returns: { day: string; seconds: number; sessions: number; coins: number }[]
      }
      get_subject_totals: {
        Args: Record<string, never>
        Returns: {
          subject_id: string | null
          name: string
          color: string
          seconds: number
          sessions: number
        }[]
      }
      delete_my_account: { Args: Record<string, never>; Returns: undefined }
    }
    Enums: {
      session_status: SessionStatus
      transaction_reason: TransactionReason
      item_category: ItemCategory
    }
    CompositeTypes: Record<string, never>
  }
}
