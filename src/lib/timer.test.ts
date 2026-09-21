import { focusedSeconds, formatDuration, formatMinutes, isPaused, pausedMs } from './timer'
import { COIN_RULES } from '@/lib/economy/coins'

const START = '2025-06-10T10:00:00.000Z'
const startMs = Date.parse(START)
const at = (minutes: number) => startMs + minutes * 60_000

describe('focusedSeconds', () => {
  it('is derived from started_at, not from a counter', () => {
    expect(focusedSeconds({ started_at: START, pauses: [] }, at(25))).toBe(25 * 60)
  })

  it('survives a slept tab — a long gap is simply included', () => {
    // No ticks happened for six hours; the reading is still correct, and
    // clamped to the server's session ceiling.
    expect(focusedSeconds({ started_at: START, pauses: [] }, at(360))).toBe(COIN_RULES.maxSeconds)
  })

  it('subtracts a closed pause', () => {
    const pauses = [{ at: new Date(at(10)).toISOString(), until: new Date(at(15)).toISOString() }]
    expect(focusedSeconds({ started_at: START, pauses }, at(30))).toBe(25 * 60)
  })

  it('subtracts an open pause up to now, so the clock stops while paused', () => {
    const pauses = [{ at: new Date(at(10)).toISOString(), until: null }]
    expect(focusedSeconds({ started_at: START, pauses }, at(30))).toBe(10 * 60)
    expect(focusedSeconds({ started_at: START, pauses }, at(90))).toBe(10 * 60)
  })

  it('subtracts several pauses', () => {
    const pauses = [
      { at: new Date(at(5)).toISOString(), until: new Date(at(10)).toISOString() },
      { at: new Date(at(20)).toISOString(), until: new Date(at(22)).toISOString() },
    ]
    expect(focusedSeconds({ started_at: START, pauses }, at(30))).toBe(23 * 60)
  })

  it('never goes negative if the device clock is behind the server', () => {
    expect(focusedSeconds({ started_at: START, pauses: [] }, at(-30))).toBe(0)
  })

  it('ignores a malformed pause rather than throwing', () => {
    const pauses = [{ at: 'not-a-date', until: null }]
    expect(focusedSeconds({ started_at: START, pauses }, at(10))).toBe(10 * 60)
  })
})

describe('pausedMs', () => {
  it('is zero with no pauses', () => {
    expect(pausedMs([], at(10))).toBe(0)
  })

  it('clamps a pause that ends before it began', () => {
    const pauses = [{ at: new Date(at(20)).toISOString(), until: new Date(at(10)).toISOString() }]
    expect(pausedMs(pauses, at(30))).toBe(0)
  })
})

describe('isPaused', () => {
  it('is true only while the last interval is open', () => {
    expect(isPaused({ pauses: [] })).toBe(false)
    expect(isPaused({ pauses: [{ at: START, until: null }] })).toBe(true)
    expect(isPaused({ pauses: [{ at: START, until: START }] })).toBe(false)
    expect(
      isPaused({
        pauses: [
          { at: START, until: START },
          { at: START, until: null },
        ],
      }),
    ).toBe(true)
  })
})

describe('formatDuration', () => {
  it.each([
    [0, '00:00'],
    [9, '00:09'],
    [65, '01:05'],
    [600, '10:00'],
    [3599, '59:59'],
    [3600, '1:00:00'],
    [3849, '1:04:09'],
    [-5, '00:00'],
  ])('%i seconds reads as %s', (seconds, expected) => {
    expect(formatDuration(seconds)).toBe(expected)
  })
})

describe('formatMinutes', () => {
  it.each([
    [0, '0m'],
    [45, '45m'],
    [60, '1h'],
    [135, '2h 15m'],
  ])('%i minutes reads as %s', (minutes, expected) => {
    expect(formatMinutes(minutes)).toBe(expected)
  })
})
