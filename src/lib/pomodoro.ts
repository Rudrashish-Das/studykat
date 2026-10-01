import type { PauseInterval, PomodoroConfig, StudySession } from '@/lib/supabase/types'
import { COIN_RULES } from '@/lib/economy/coins'
import { focusedSeconds } from '@/lib/timer'

/**
 * Pomodoro, as the server runs it.
 *
 * The database owns the breaks (0017_server_pomodoro.sql): every session call
 * first writes in any break that has come due, at the moment it came due, and
 * closes any that has run out when the session carries on by itself. The
 * settings are frozen on the session when it starts.
 *
 * `settlePauses` is the same reckoning in TypeScript — keep the two in step.
 * The client uses it only to show the right thing between server calls, and
 * to know when to ask the server to write a break in (`needsSync`). Every
 * device works it out from the same row, so they all agree.
 */

export type PomodoroPhase = 'focus' | 'shortBreak' | 'longBreak'

/** Bounds for the settings; the database checks the same ones. */
export const POMODORO_LIMITS = {
  focus_minutes: [5, 120],
  short_break_minutes: [1, 30],
  long_break_minutes: [5, 60],
  long_break_every: [2, 8],
} as const satisfies Partial<Record<keyof PomodoroConfig, readonly [number, number]>>

type SessionLike = Pick<StudySession, 'started_at' | 'pauses' | 'pomodoro'>

const isBreak = (p: PauseInterval) => p.reason === 'break'

/** Break number `n` (1-based): every `long_break_every`th one is long. */
export function breakKind(n: number, cfg: PomodoroConfig): PomodoroPhase {
  return n > 0 && n % cfg.long_break_every === 0 ? 'longBreak' : 'shortBreak'
}

export function breakSeconds(n: number, cfg: PomodoroConfig): number {
  return (breakKind(n, cfg) === 'longBreak' ? cfg.long_break_minutes : cfg.short_break_minutes) * 60
}

/** Exact milliseconds paused up to `nowMs`; the server's `paused_seconds_exact`. */
function pausedMsExact(pauses: PauseInterval[], nowMs: number): number {
  let total = 0
  for (const p of pauses) {
    const from = Date.parse(p.at)
    if (Number.isNaN(from)) continue
    total += Math.max(0, (p.until ? Date.parse(p.until) : nowMs) - from)
  }
  return total
}

/** The pauses as the server will have them at `nowMs`. Mirrors `pomodoro_settle`. */
export function settlePauses(session: SessionLike, nowMs: number): PauseInterval[] {
  const cfg = session.pomodoro
  if (!cfg) return session.pauses
  const started = Date.parse(session.started_at)
  const focusMs = cfg.focus_minutes * 60_000
  const pauses = [...session.pauses]

  for (let i = 0; i < 100; i++) {
    const last = pauses[pauses.length - 1]
    const breaks = pauses.filter(isBreak).length

    if (last?.until === null) {
      if (!isBreak(last) || !cfg.auto_resume) break
      const end = Date.parse(last.at) + breakSeconds(breaks, cfg) * 1000
      if (end > nowMs) break
      pauses[pauses.length - 1] = { ...last, until: new Date(end).toISOString() }
    } else {
      const target = (breaks + 1) * focusMs
      if (target > COIN_RULES.maxSeconds * 1000) break
      const focused = nowMs - started - pausedMsExact(pauses, nowMs)
      if (focused < target) break
      let at = nowMs - (focused - target)
      if (last?.until) at = Math.max(at, Date.parse(last.until))
      pauses.push({ at: new Date(at).toISOString(), until: null, reason: 'break' })
    }
  }
  return pauses
}

/**
 * Whether the server has yet to write in something that is already due — so
 * this device should call `sync_session`. Returns a key for what is due, so
 * the same thing is asked for once rather than every tick.
 */
export function pendingSync(session: SessionLike, nowMs: number): string | null {
  if (!session.pomodoro) return null
  const settled = settlePauses(session, nowMs)
  const last = settled[settled.length - 1]
  const serverLast = session.pauses[session.pauses.length - 1]
  if (settled.length === session.pauses.length && last?.until === serverLast?.until) return null
  return `${settled.length}:${last?.at ?? ''}:${last?.until ?? ''}`
}

export interface PomodoroState {
  phase: PomodoroPhase
  /** 1-based focus block running, or the one just finished during a break. */
  block: number
  /** Seconds left in this phase; zero or below once a break has run over. */
  remainingSeconds: number
  /** Focused seconds, counting the settled breaks as paused. */
  focusedSeconds: number
  /** When this phase (or, for a break that has run over, its overrun) began. */
  sinceMs: number
  /** Changes whenever the phase does, including a break running out. */
  key: string
}

export function pomodoroState(session: SessionLike, nowMs: number): PomodoroState | null {
  const cfg = session.pomodoro
  if (!cfg) return null
  const pauses = settlePauses(session, nowMs)
  const breaks = pauses.filter(isBreak)
  const last = pauses[pauses.length - 1]
  const focused = focusedSeconds({ started_at: session.started_at, pauses }, nowMs)

  if (last?.until === null && isBreak(last)) {
    const n = breaks.length
    const at = Date.parse(last.at)
    const lengthMs = breakSeconds(n, cfg) * 1000
    const over = nowMs >= at + lengthMs
    return {
      phase: breakKind(n, cfg),
      block: n,
      remainingSeconds: Math.ceil((at + lengthMs - nowMs) / 1000),
      focusedSeconds: focused,
      sinceMs: over ? at + lengthMs : at,
      key: `break:${n}:${over ? 'over' : 'on'}`,
    }
  }

  const lastBreak = breaks[breaks.length - 1]
  return {
    phase: 'focus',
    block: breaks.length + 1,
    remainingSeconds: Math.max(0, (breaks.length + 1) * cfg.focus_minutes * 60 - focused),
    focusedSeconds: focused,
    sinceMs: lastBreak?.until ? Date.parse(lastBreak.until) : Date.parse(session.started_at),
    key: `focus:${breaks.length + 1}`,
  }
}

/**
 * What to play between two readings of the same session: the full chime when
 * a focus block ends, the soft one when a break runs out (whether or not it
 * carries on by itself). Nothing for a break cut short, a change that
 * happened long ago (a reopened tab), or no change at all.
 */
export function chimeFor(
  prev: PomodoroState | null,
  next: PomodoroState | null,
  nowMs: number,
): 'full' | 'soft' | null {
  if (!prev || !next || prev.key === next.key) return null
  if (nowMs - next.sinceMs > 60_000) return null
  if (next.key.endsWith(':on')) return 'full'
  if (next.key.endsWith(':over')) return 'soft'
  // Back to focus: only a break that ran its course earns a chime.
  if (prev.key.endsWith(':on') && prev.remainingSeconds <= 2) return 'soft'
  return null
}
