/**
 * Hand-written to match `supabase/migrations/`. Regenerate with
 * `supabase gen types typescript` if you ever add the CLI; until then, this
 * file and the migrations must be edited together.
 */

export type SessionStatus = 'active' | 'completed' | 'abandoned'

export type TransactionReason =
  | 'session'
  | 'streak_bonus'
  | 'purchase'
  | 'milestone'
  | 'refund'

export type ItemCategory =
  | 'floor'
  | 'wall'
  | 'rug'
  | 'furniture'
  | 'plant'
  | 'toy'
  | 'light'
  | 'wallcolor'
  | 'decor'

/** Shape of `catalog_items.unlock_rule`. `null` means always available. */
export type UnlockRule =
  | { kind: 'streak'; days: number }
  | { kind: 'lifetime_hours'; hours: number }
  | { kind: 'lifetime_coins'; coins: number }

export type PauseInterval = { at: string; until: string | null }

export interface Profile {
  id: string
  display_name: string | null
  cat_name: string
  cat_seed: string
  /** Which of the three onboarding candidates was picked (0, 1, or 2). */
  cat_variant: number
  daily_goal_minutes: number
  timezone: string
  onboarded_at: string | null
  created_at: string
}

export interface Subject {
  id: string
  user_id: string
  name: string
  color: string
  archived: boolean
  created_at: string
}

export interface StudySession {
  id: string
  user_id: string
  subject_id: string | null
  started_at: string
  ended_at: string | null
  awarded_seconds: number
  coins_awarded: number
  status: SessionStatus
  client_reported_seconds: number | null
  pauses: PauseInterval[]
  /** Optional free-text subject label typed at the start of a session. */
  label: string | null
}

export interface Wallet {
  user_id: string
  coins: number
  lifetime_coins: number
}

export interface Transaction {
  id: string
  user_id: string
  delta: number
  reason: TransactionReason
  ref_id: string | null
  created_at: string
}

export interface Streak {
  user_id: string
  current_streak: number
  longest_streak: number
  last_credited_day: string | null
  freeze_tokens: number
}

export interface CatalogItem {
  id: string
  slug: string
  name: string
  description: string | null
  category: ItemCategory
  price: number
  unlock_rule: UnlockRule | null
  footprint_w: number
  footprint_h: number
  layer: number
  art_key: string
}

export interface InventoryRow {
  id: string
  user_id: string
  item_id: string
  acquired_at: string
}

export interface RoomLayoutRow {
  id: string
  user_id: string
  item_id: string
  grid_x: number
  grid_y: number
  rotation: number
  z_index: number
}

/** Returned by the `end_session` RPC — the full, server-computed payoff. */
export interface EndSessionResult {
  session_id: string
  focused_seconds: number
  credited: boolean
  coins_awarded: number
  base_coins: number
  tier_bonus: number
  streak_multiplier: number
  goal_bonus: number
  daily_cap_hit: boolean
  current_streak: number
  streak_advanced: boolean
  freeze_used: boolean
  goal_met: boolean
  minutes_today: number
}

/** Returned by `get_today` — everything the HUD needs in one round trip. */
export interface TodaySummary {
  local_day: string
  minutes_today: number
  daily_goal_minutes: number
  goal_met: boolean
  streak_day_threshold_minutes: number
  streak_day_met: boolean
  coins_from_sessions_today: number
  current_streak: number
  longest_streak: number
  freeze_tokens: number
  coins: number
  lifetime_coins: number
  lifetime_seconds: number
}
