/**
 * The coin formula, in TypeScript.
 *
 * The SQL in `supabase/migrations/0003_economy_functions.sql` is the authority
 * — it is what actually pays out, and it measures its own clock. This mirror
 * exists so the UI can show an honest "you'll earn about X" while a session is
 * running, and so the rules are unit-testable without a database.
 *
 * The two must agree. `supabase/tests/rls_and_rpc.sql` asserts the same table
 * of cases as `coins.test.ts`; if you change one, change both.
 */

export const COIN_RULES = {
  /** Below this, a session pays nothing and does not count toward the streak. */
  minSeconds: 300,
  /** Sessions are clamped to this before anything is computed. */
  maxSeconds: 180 * 60,
  /** The long-session bonus applies to minutes after this one… */
  tierStartMinutes: 25,
  /** …and stops counting here. */
  tierEndMinutes: 90,
  tierRate: 0.25,
  dailyCap: 400,
  goalBonus: 30,
  streakCapDays: 30,
  streakStep: 0.02,
} as const

export interface CoinBreakdown {
  /** 1 coin per whole focused minute. */
  base: number
  /** 25% of base over the bonus-eligible stretch. */
  tierBonus: number
  /** 1.0 to 1.6, from the streak that will stand for today. */
  streakMultiplier: number
  /** Before the daily cap. */
  gross: number
  /** After the daily cap. */
  capped: number
  goalBonus: number
  total: number
  dailyCapHit: boolean
}

export interface CoinInput {
  focusedSeconds: number
  /**
   * The streak as it will stand for today — i.e. after any advancement this
   * session triggers. Every session on a given day uses the same multiplier.
   */
  currentStreak: number
  /** Coins already paid out by sessions today, for the daily cap. */
  coinsToday: number
  /** Whether this session is the one that first meets today's goal. */
  meetsGoalFirstTime: boolean
}

export function streakMultiplier(currentStreak: number): number {
  const days = Math.min(Math.max(currentStreak, 0), COIN_RULES.streakCapDays)
  // Two decimal places, so 0.02 * 30 is exactly 0.6 rather than 0.6000000000000001.
  return Math.round((1 + days * COIN_RULES.streakStep) * 100) / 100
}

export function computeCoins(input: CoinInput): CoinBreakdown {
  const focused = Math.min(Math.max(input.focusedSeconds, 0), COIN_RULES.maxSeconds)
  const multiplier = streakMultiplier(input.currentStreak)

  const empty: CoinBreakdown = {
    base: 0,
    tierBonus: 0,
    streakMultiplier: multiplier,
    gross: 0,
    capped: 0,
    goalBonus: 0,
    total: 0,
    dailyCapHit: false,
  }

  if (focused < COIN_RULES.minSeconds) return empty

  const base = Math.floor(focused / 60)
  const bonusMinutes = Math.max(
    0,
    Math.min(base, COIN_RULES.tierEndMinutes) - COIN_RULES.tierStartMinutes,
  )
  const tierBonus = bonusMinutes * COIN_RULES.tierRate

  const gross = Math.round((base + tierBonus) * multiplier)
  const remaining = Math.max(0, COIN_RULES.dailyCap - Math.max(input.coinsToday, 0))
  const capped = Math.min(gross, remaining)
  const goalBonus = input.meetsGoalFirstTime ? COIN_RULES.goalBonus : 0

  return {
    base,
    tierBonus,
    streakMultiplier: multiplier,
    gross,
    capped,
    goalBonus,
    total: capped + goalBonus,
    dailyCapHit: capped < gross,
  }
}

/** Minutes that make a day count toward the streak: max(15, half the goal). */
export function streakThresholdMinutes(dailyGoalMinutes: number): number {
  return Math.max(15, Math.ceil(dailyGoalMinutes / 2))
}
