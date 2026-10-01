import type { PauseInterval, PomodoroConfig } from '@/lib/supabase/types'
import { breakKind, chimeFor, pendingSync, pomodoroState, settlePauses } from './pomodoro'

/*
 * The same scenarios as the Pomodoro block in supabase/tests/rls_and_rpc.sql,
 * so the TypeScript copy of `pomodoro_settle` cannot drift from the server's.
 */

const START = '2025-06-10T10:00:00.000Z'
const startMs = Date.parse(START)
const at = (minutes: number) => startMs + minutes * 60_000
const iso = (minutes: number) => new Date(at(minutes)).toISOString()

const cfg: PomodoroConfig = {
  focus_minutes: 25,
  short_break_minutes: 5,
  long_break_minutes: 15,
  long_break_every: 4,
  auto_resume: false,
}
const session = (pauses: PauseInterval[] = [], pomodoro: PomodoroConfig | null = cfg) => ({
  started_at: START,
  pauses,
  pomodoro,
})

describe('settlePauses', () => {
  it('leaves a stopwatch session alone', () => {
    expect(settlePauses(session([], null), at(40))).toEqual([])
  })

  it('writes in a due break at exactly the end of the block, left open', () => {
    expect(settlePauses(session(), at(40))).toEqual([{ at: iso(25), until: null, reason: 'break' }])
  })

  it('writes nothing before the block ends', () => {
    expect(settlePauses(session(), at(24.9))).toEqual([])
  })

  it('carries on by itself, with the long break where it belongs', () => {
    // focus 0–25, short 25–30, focus 30–55, long 55–70, focus 70–75.
    const auto = { ...cfg, long_break_every: 2, auto_resume: true }
    expect(settlePauses(session([], auto), at(75))).toEqual([
      { at: iso(25), until: iso(30), reason: 'break' },
      { at: iso(55), until: iso(70), reason: 'break' },
    ])
  })

  it('pushes the next block back by a manual pause', () => {
    const pauses: PauseInterval[] = [{ at: iso(10), until: iso(20), reason: 'manual' }]
    expect(settlePauses(session(pauses), at(40))).toEqual([
      ...pauses,
      { at: iso(35), until: null, reason: 'break' },
    ])
  })

  it('counts a skipped break as that block handled', () => {
    const pauses: PauseInterval[] = [{ at: iso(25), until: iso(26), reason: 'break' }]
    // Next block ends at 26 + 25 = 51.
    expect(settlePauses(session(pauses), at(60))).toEqual([
      ...pauses,
      { at: iso(51), until: null, reason: 'break' },
    ])
  })
})

describe('pendingSync', () => {
  it('asks for a sync once something is due, and not otherwise', () => {
    expect(pendingSync(session(), at(10))).toBeNull()
    expect(pendingSync(session(), at(25.1))).not.toBeNull()
    const written: PauseInterval[] = [{ at: iso(25), until: null, reason: 'break' }]
    expect(pendingSync(session(written), at(27))).toBeNull()
  })
})

describe('pomodoroState', () => {
  it('counts down the first block', () => {
    const s = pomodoroState(session(), at(10))
    expect(s).toMatchObject({ phase: 'focus', block: 1, remainingSeconds: 15 * 60 })
  })

  it('shows a break before the server has written it in, with the clock stopped', () => {
    const s = pomodoroState(session(), at(27))
    expect(s).toMatchObject({ phase: 'shortBreak', block: 1, remainingSeconds: 3 * 60 })
    expect(s?.focusedSeconds).toBe(25 * 60)
  })

  it('shows a break that has run over', () => {
    const s = pomodoroState(session(), at(32))
    expect(s?.remainingSeconds).toBe(-2 * 60)
    expect(s?.key).toBe('break:1:over')
  })

  it('takes a long break every few blocks', () => {
    expect([1, 2, 3, 4, 8].map((n) => breakKind(n, cfg))).toEqual([
      'shortBreak',
      'shortBreak',
      'shortBreak',
      'longBreak',
      'longBreak',
    ])
  })
})

describe('chimeFor', () => {
  const read = (minutes: number, pauses: PauseInterval[] = []) =>
    pomodoroState(session(pauses), at(minutes))

  it('chimes when a block ends, softly when a break runs out', () => {
    expect(chimeFor(read(24.99), read(25.01), at(25.01))).toBe('full')
    expect(chimeFor(read(29.99), read(30.01), at(30.01))).toBe('soft')
  })

  it('stays quiet for a break cut short', () => {
    const skipped: PauseInterval[] = [{ at: iso(25), until: iso(26), reason: 'break' }]
    expect(chimeFor(read(26), read(26.01, skipped), at(26.01))).toBeNull()
  })

  it('stays quiet about something that ended while the screen was closed', () => {
    expect(chimeFor(read(10), read(40), at(40))).toBeNull()
  })

  it('stays quiet with nothing to compare against', () => {
    expect(chimeFor(null, read(25.01), at(25.01))).toBeNull()
  })
})
