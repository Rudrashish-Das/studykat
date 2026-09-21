import { useEffect } from 'react'
import { create } from 'zustand'
import type { PauseInterval, StudySession } from '@/lib/supabase/types'
import { COIN_RULES } from '@/lib/economy/coins'

/**
 * The live timer.
 *
 * The rule from §6.1: elapsed time is *derived* from the session's
 * `started_at`, recomputed from wall-clock on every tick. Nothing here
 * increments a counter, so a slept tab, a refresh, a locked phone, or a
 * closed-and-reopened browser all resume at the right number instead of
 * silently losing the minutes in between.
 *
 * The device clock is not trusted either: `serverOffsetMs` is the difference
 * between the database clock and this machine's, learned from `get_today`, and
 * every reading goes through it.
 */
interface TimerState {
  /** serverNow - clientNow, in milliseconds. */
  serverOffsetMs: number
  /** Ticks so subscribers re-render; the value is a corrected server time. */
  now: number
  setServerNow: (iso: string) => void
  tick: () => void
}

export const useTimerStore = create<TimerState>((set, get) => ({
  serverOffsetMs: 0,
  now: Date.now(),
  setServerNow: (iso: string) => {
    const serverMs = Date.parse(iso)
    if (Number.isNaN(serverMs)) return
    const offset = serverMs - Date.now()
    // Ignore sub-second noise; it is round-trip latency, not clock drift.
    if (Math.abs(offset - get().serverOffsetMs) < 1000) return
    set({ serverOffsetMs: offset, now: Date.now() + offset })
  },
  tick: () => set((state) => ({ now: Date.now() + state.serverOffsetMs })),
}))

/** Corrected "now", read once outside React. */
export function serverNow(): number {
  return Date.now() + useTimerStore.getState().serverOffsetMs
}

/**
 * Drives the store's clock while `active`. One interval for the whole app.
 *
 * It also ticks on visibilitychange: a background tab gets throttled to about
 * once a minute, so without this the first frame after returning would show a
 * stale number for a moment.
 */
export function useTicker(active: boolean, intervalMs = 500): void {
  useEffect(() => {
    if (!active) return
    const tick = useTimerStore.getState().tick
    tick()
    const id = window.setInterval(tick, intervalMs)
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [active, intervalMs])
}

/* ------------------------------------------------------------ derivation */

/** Milliseconds spent paused, with an open pause closed at `nowMs`. */
export function pausedMs(pauses: PauseInterval[], nowMs: number): number {
  let total = 0
  for (const pause of pauses) {
    const from = Date.parse(pause.at)
    if (Number.isNaN(from)) continue
    const to = pause.until ? Date.parse(pause.until) : nowMs
    total += Math.max(0, to - from)
  }
  return total
}

export function isPaused(session: Pick<StudySession, 'pauses'>): boolean {
  const last = session.pauses[session.pauses.length - 1]
  return last?.until === null
}

/**
 * Focused seconds so far, clamped to the same 180-minute ceiling the server
 * applies — so the number on screen never promises more than `end_session`
 * will actually pay.
 */
export function focusedSeconds(
  session: Pick<StudySession, 'started_at' | 'pauses'>,
  nowMs: number,
): number {
  const started = Date.parse(session.started_at)
  if (Number.isNaN(started)) return 0
  const elapsed = nowMs - started - pausedMs(session.pauses, nowMs)
  return Math.min(Math.max(Math.floor(elapsed / 1000), 0), COIN_RULES.maxSeconds)
}

/** `1:04:09`, or `04:09` under an hour. */
export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds))
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
}

/** "2h 15m" / "45m" — for summaries rather than the running clock. */
export function formatMinutes(totalMinutes: number): string {
  const minutes = Math.max(0, Math.round(totalMinutes))
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}
