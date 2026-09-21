/**
 * Streak rules, in TypeScript.
 *
 * As with the coin formula, the SQL in 0003 is what actually advances a
 * streak. This mirror drives the HUD ("22 minutes left to keep your streak")
 * and makes the day-boundary rules testable without a database.
 *
 * Two things this file exists to get right:
 *
 *   1. A "day" is a calendar day in the user's stored IANA timezone. Not UTC,
 *      and not the browser's guess at read time.
 *   2. The gap between two days is calendar arithmetic, never elapsed
 *      milliseconds divided by 86,400,000 — on a DST transition a local day is
 *      23 or 25 hours long and that division is off by one.
 */

/** A calendar day as `YYYY-MM-DD`, with no time and no zone attached. */
export type LocalDay = string & { readonly __localDay?: unique symbol }

/** Which calendar day `at` falls on for someone living in `timeZone`. */
export function localDay(at: Date, timeZone: string): LocalDay {
  // `en-CA` formats as YYYY-MM-DD, which sorts and compares correctly as text.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at) as LocalDay
}

/** The hour (0-23) it is for someone living in `timeZone`. */
export function localHour(at: Date, timeZone: string): number {
  const hour = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    hour12: false,
  }).format(at)
  // Midnight formats as "24" in some ICU versions.
  return Number(hour) % 24
}

/**
 * Whole days from `from` to `to`, counted on the calendar.
 *
 * Both are parsed at UTC midnight purely as a counting device — they carry no
 * zone of their own, so no DST transition can shorten or lengthen them.
 */
export function daysBetween(from: LocalDay, to: LocalDay): number {
  const a = Date.parse(`${from}T00:00:00Z`)
  const b = Date.parse(`${to}T00:00:00Z`)
  return Math.round((b - a) / 86_400_000)
}

export function addDays(day: LocalDay, delta: number): LocalDay {
  const ms = Date.parse(`${day}T00:00:00Z`) + delta * 86_400_000
  return new Date(ms).toISOString().slice(0, 10) as LocalDay
}

export interface StreakState {
  currentStreak: number
  longestStreak: number
  lastCreditedDay: LocalDay | null
  freezeTokens: number
  /** How many 7-day blocks have already paid out a token. */
  freezeGrants: number
}

export interface StreakOutcome extends StreakState {
  advanced: boolean
  freezeUsed: boolean
  /** Tokens granted by this advance, for the "you earned a freeze" line. */
  tokensGranted: number
}

export const MAX_FREEZE_TOKENS = 2
export const FREEZE_GRANT_EVERY = 7

/**
 * Mirrors `end_session`'s streak block. `minutesToday` is credited minutes for
 * `today` including the session that just ended.
 */
export function advanceStreak(
  state: StreakState,
  input: { today: LocalDay; minutesToday: number; thresholdMinutes: number },
): StreakOutcome {
  const unchanged: StreakOutcome = {
    ...state,
    advanced: false,
    freezeUsed: false,
    tokensGranted: 0,
  }

  if (input.minutesToday < input.thresholdMinutes) return unchanged
  // Already credited today — a second session does not advance it again.
  if (state.lastCreditedDay === input.today) return unchanged

  let next: number
  let freezeUsed = false

  if (state.lastCreditedDay === null) {
    next = 1
  } else {
    const gap = daysBetween(state.lastCreditedDay, input.today)
    if (gap === 1) {
      next = state.currentStreak + 1
    } else if (gap === 2 && state.freezeTokens > 0) {
      // A freeze token covers exactly one missed day.
      next = state.currentStreak + 1
      freezeUsed = true
    } else {
      next = 1
    }
  }

  const grants = Math.floor(next / FREEZE_GRANT_EVERY)
  const tokensGranted = Math.max(0, grants - state.freezeGrants)
  const freezeTokens = Math.min(
    MAX_FREEZE_TOKENS,
    Math.max(0, state.freezeTokens - (freezeUsed ? 1 : 0)) + tokensGranted,
  )

  return {
    currentStreak: next,
    longestStreak: Math.max(state.longestStreak, next),
    lastCreditedDay: input.today,
    freezeTokens,
    freezeGrants: grants,
    advanced: true,
    freezeUsed,
    tokensGranted,
  }
}

/**
 * The HUD nudge. Deliberately quiet: nothing is shown until 6pm local, and
 * nothing is shown once the day is already safe.
 */
export function streakNudge(input: {
  now: Date
  timeZone: string
  minutesToday: number
  thresholdMinutes: number
}): { show: boolean; minutesLeft: number } {
  const minutesLeft = Math.max(0, input.thresholdMinutes - input.minutesToday)
  const show = minutesLeft > 0 && localHour(input.now, input.timeZone) >= 18
  return { show, minutesLeft }
}

/** Flame size tiers from §8 — progress you can see without reading a number. */
export const FLAME_TIERS = [0, 3, 7, 14, 30, 100] as const
export type FlameTier = 0 | 1 | 2 | 3 | 4 | 5

export function flameTier(streak: number): FlameTier {
  let tier = 0
  for (let i = 0; i < FLAME_TIERS.length; i += 1) {
    if (streak >= (FLAME_TIERS[i] ?? 0)) tier = i
  }
  return tier as FlameTier
}
