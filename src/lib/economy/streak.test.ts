import {
  addDays,
  advanceStreak,
  daysBetween,
  flameTier,
  localDay,
  localHour,
  streakNudge,
  type LocalDay,
  type StreakState,
} from './streak'

const day = (s: string) => s as LocalDay

describe('localDay across timezones', () => {
  it('puts one instant on different calendar days for different users', () => {
    // 23:30 UTC on 15 January.
    const at = new Date('2025-01-15T23:30:00Z')
    expect(localDay(at, 'UTC')).toBe('2025-01-15')
    expect(localDay(at, 'America/Los_Angeles')).toBe('2025-01-15') // 15:30, same day
    expect(localDay(at, 'Asia/Tokyo')).toBe('2025-01-16') // 08:30 next day
    expect(localDay(at, 'Pacific/Kiritimati')).toBe('2025-01-16') // UTC+14
  })

  it('rolls the day at local midnight, not UTC midnight', () => {
    // 04:30 UTC is still the previous evening in New York.
    const at = new Date('2025-06-10T04:30:00Z')
    expect(localDay(at, 'UTC')).toBe('2025-06-10')
    expect(localDay(at, 'America/New_York')).toBe('2025-06-10')

    const justBefore = new Date('2025-06-10T03:30:00Z') // 23:30 on the 9th in NY
    expect(localDay(justBefore, 'America/New_York')).toBe('2025-06-09')
    expect(localDay(justBefore, 'UTC')).toBe('2025-06-10')
  })

  it('handles a zone behind the date line at the moment it flips', () => {
    // Samoa is UTC+13; 11:30 UTC is already tomorrow there.
    const at = new Date('2025-03-20T11:30:00Z')
    expect(localDay(at, 'Pacific/Apia')).toBe('2025-03-21')
    expect(localDay(at, 'Pacific/Pago_Pago')).toBe('2025-03-20') // UTC-11
  })
})

describe('localHour', () => {
  it('reports the hour where the user lives', () => {
    const at = new Date('2025-01-15T23:30:00Z')
    expect(localHour(at, 'UTC')).toBe(23)
    expect(localHour(at, 'America/New_York')).toBe(18)
    expect(localHour(at, 'Asia/Tokyo')).toBe(8)
  })

  it('reports midnight as 0, not 24', () => {
    expect(localHour(new Date('2025-01-15T00:00:00Z'), 'UTC')).toBe(0)
  })
})

describe('daysBetween across DST', () => {
  it('counts a 23-hour spring-forward day as one day', () => {
    // US DST begins 2025-03-09. That local day is 23 hours long, so any
    // elapsed-milliseconds division would round it to zero.
    expect(daysBetween(day('2025-03-08'), day('2025-03-09'))).toBe(1)
    expect(daysBetween(day('2025-03-09'), day('2025-03-10'))).toBe(1)
  })

  it('counts a 25-hour fall-back day as one day', () => {
    // US DST ends 2025-11-02.
    expect(daysBetween(day('2025-11-01'), day('2025-11-02'))).toBe(1)
    expect(daysBetween(day('2025-11-02'), day('2025-11-03'))).toBe(1)
  })

  it('counts across a southern-hemisphere transition', () => {
    // Australia switches on 2025-10-05.
    expect(daysBetween(day('2025-10-04'), day('2025-10-05'))).toBe(1)
  })

  it('counts across month, year, and leap-day boundaries', () => {
    expect(daysBetween(day('2025-01-31'), day('2025-02-01'))).toBe(1)
    expect(daysBetween(day('2024-12-31'), day('2025-01-01'))).toBe(1)
    expect(daysBetween(day('2024-02-28'), day('2024-02-29'))).toBe(1)
    expect(daysBetween(day('2024-02-28'), day('2024-03-01'))).toBe(2)
    expect(daysBetween(day('2025-02-28'), day('2025-03-01'))).toBe(1)
  })

  it('is signed', () => {
    expect(daysBetween(day('2025-03-10'), day('2025-03-08'))).toBe(-2)
  })

  it('round-trips with addDays over a DST transition', () => {
    expect(addDays(day('2025-03-08'), 1)).toBe('2025-03-09')
    expect(addDays(day('2025-11-01'), 1)).toBe('2025-11-02')
    expect(addDays(day('2025-03-09'), -1)).toBe('2025-03-08')
  })
})

describe('advanceStreak', () => {
  const fresh: StreakState = {
    currentStreak: 0,
    longestStreak: 0,
    lastCreditedDay: null,
    freezeTokens: 0,
    freezeGrants: 0,
  }

  it('does nothing below the daily threshold', () => {
    const out = advanceStreak(fresh, {
      today: day('2025-03-09'),
      minutesToday: 14,
      thresholdMinutes: 30,
    })
    expect(out.advanced).toBe(false)
    expect(out.currentStreak).toBe(0)
    expect(out.lastCreditedDay).toBeNull()
  })

  it('starts a streak at 1 on the first credited day', () => {
    const out = advanceStreak(fresh, {
      today: day('2025-03-09'),
      minutesToday: 30,
      thresholdMinutes: 30,
    })
    expect(out).toMatchObject({ currentStreak: 1, longestStreak: 1, advanced: true })
    expect(out.lastCreditedDay).toBe('2025-03-09')
  })

  it('advances across a spring-forward boundary', () => {
    const state: StreakState = { ...fresh, currentStreak: 4, longestStreak: 4, lastCreditedDay: day('2025-03-08') }
    const out = advanceStreak(state, {
      today: day('2025-03-09'),
      minutesToday: 40,
      thresholdMinutes: 30,
    })
    expect(out.currentStreak).toBe(5)
    expect(out.advanced).toBe(true)
  })

  it('advances across a fall-back boundary', () => {
    const state: StreakState = { ...fresh, currentStreak: 9, longestStreak: 9, lastCreditedDay: day('2025-11-01') }
    expect(
      advanceStreak(state, { today: day('2025-11-02'), minutesToday: 40, thresholdMinutes: 30 })
        .currentStreak,
    ).toBe(10)
  })

  it('does not advance twice on the same day', () => {
    const state: StreakState = { ...fresh, currentStreak: 3, longestStreak: 3, lastCreditedDay: day('2025-03-09') }
    const out = advanceStreak(state, {
      today: day('2025-03-09'),
      minutesToday: 200,
      thresholdMinutes: 30,
    })
    expect(out.advanced).toBe(false)
    expect(out.currentStreak).toBe(3)
  })

  it('resets to 1 after a missed day with no token', () => {
    const state: StreakState = { ...fresh, currentStreak: 12, longestStreak: 12, lastCreditedDay: day('2025-03-07') }
    const out = advanceStreak(state, {
      today: day('2025-03-09'),
      minutesToday: 40,
      thresholdMinutes: 30,
    })
    expect(out.currentStreak).toBe(1)
    expect(out.freezeUsed).toBe(false)
    // The record survives the reset.
    expect(out.longestStreak).toBe(12)
  })

  it('spends a freeze token to cover exactly one missed day', () => {
    const state: StreakState = {
      currentStreak: 12,
      longestStreak: 12,
      lastCreditedDay: day('2025-03-07'),
      freezeTokens: 1,
      freezeGrants: 1,
    }
    const out = advanceStreak(state, {
      today: day('2025-03-09'),
      minutesToday: 40,
      thresholdMinutes: 30,
    })
    expect(out.currentStreak).toBe(13)
    expect(out.freezeUsed).toBe(true)
    expect(out.freezeTokens).toBe(0)
  })

  it('will not stretch one token over two missed days', () => {
    const state: StreakState = {
      currentStreak: 12,
      longestStreak: 12,
      lastCreditedDay: day('2025-03-06'),
      freezeTokens: 1,
      freezeGrants: 1,
    }
    const out = advanceStreak(state, {
      today: day('2025-03-09'),
      minutesToday: 40,
      thresholdMinutes: 30,
    })
    expect(out.currentStreak).toBe(1)
    expect(out.freezeUsed).toBe(false)
    expect(out.freezeTokens).toBe(1)
  })

  it('grants one token per 7-day block', () => {
    const state: StreakState = { ...fresh, currentStreak: 6, longestStreak: 6, lastCreditedDay: day('2025-03-08') }
    const out = advanceStreak(state, {
      today: day('2025-03-09'),
      minutesToday: 40,
      thresholdMinutes: 30,
    })
    expect(out.currentStreak).toBe(7)
    expect(out.tokensGranted).toBe(1)
    expect(out.freezeTokens).toBe(1)
  })

  it('holds at most two tokens', () => {
    const state: StreakState = {
      currentStreak: 20,
      longestStreak: 20,
      lastCreditedDay: day('2025-03-08'),
      freezeTokens: 2,
      freezeGrants: 2,
    }
    const out = advanceStreak(state, {
      today: day('2025-03-09'),
      minutesToday: 40,
      thresholdMinutes: 30,
    })
    expect(out.currentStreak).toBe(21)
    expect(out.freezeTokens).toBe(2)
  })

  it('starts earning tokens again after a reset', () => {
    const state: StreakState = {
      currentStreak: 30,
      longestStreak: 30,
      lastCreditedDay: day('2025-03-01'),
      freezeTokens: 0,
      freezeGrants: 4,
    }
    const out = advanceStreak(state, {
      today: day('2025-03-09'),
      minutesToday: 40,
      thresholdMinutes: 30,
    })
    expect(out.currentStreak).toBe(1)
    expect(out.freezeGrants).toBe(0)
  })

  it('credits the right day for a user near the date line', () => {
    // 10:00 UTC is already the 10th in Kiritimati and still the 9th in UTC.
    const at = new Date('2025-03-09T10:00:00Z')
    const today = localDay(at, 'Pacific/Kiritimati')
    expect(today).toBe('2025-03-10')

    const state: StreakState = { ...fresh, currentStreak: 2, longestStreak: 2, lastCreditedDay: day('2025-03-09') }
    expect(advanceStreak(state, { today, minutesToday: 40, thresholdMinutes: 30 }).currentStreak).toBe(3)
  })
})

describe('streakNudge', () => {
  const base = { timeZone: 'America/New_York', minutesToday: 10, thresholdMinutes: 30 }

  it('stays quiet before 6pm local', () => {
    // 20:00 UTC is 15:00 in New York.
    expect(streakNudge({ ...base, now: new Date('2025-06-10T19:00:00Z') }).show).toBe(false)
  })

  it('speaks up after 6pm local when the day is incomplete', () => {
    // 23:00 UTC is 19:00 in New York.
    const out = streakNudge({ ...base, now: new Date('2025-06-10T23:00:00Z') })
    expect(out.show).toBe(true)
    expect(out.minutesLeft).toBe(20)
  })

  it('stays quiet once the day is safe, however late it is', () => {
    const out = streakNudge({
      ...base,
      minutesToday: 45,
      now: new Date('2025-06-11T03:00:00Z'), // 23:00 in New York
    })
    expect(out.show).toBe(false)
    expect(out.minutesLeft).toBe(0)
  })
})

describe('flameTier', () => {
  it.each([
    [0, 0],
    [2, 0],
    [3, 1],
    [6, 1],
    [7, 2],
    [13, 2],
    [14, 3],
    [29, 3],
    [30, 4],
    [99, 4],
    [100, 5],
    [4000, 5],
  ])('a %i-day streak is tier %i', (streak, tier) => {
    expect(flameTier(streak)).toBe(tier)
  })
})
