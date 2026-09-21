import { computeCoins, streakMultiplier, streakThresholdMinutes, COIN_RULES } from './coins'

/**
 * Table-driven, and deliberately the same table as the SQL assertions in
 * `supabase/tests/rls_and_rpc.sql`. If these two ever disagree, the SQL wins —
 * it is what actually pays out — and this file is the bug.
 */
describe('coin formula', () => {
  const cases: Array<{
    name: string
    seconds: number
    streak?: number
    coinsToday?: number
    goal?: boolean
    total: number
  }> = [
    { name: '0 seconds', seconds: 0, total: 0 },
    { name: '4m59s is below the floor', seconds: 299, total: 0 },
    { name: '5m exactly clears the floor', seconds: 300, total: 5 },
    { name: '12m30s floors to 12 whole minutes', seconds: 750, total: 12 },
    { name: '25m is the last minute with no bonus', seconds: 25 * 60, total: 25 },
    // 45 base + (45-25)*0.25 = 45 + 5 = 50
    { name: '45m earns the long-session bonus', seconds: 45 * 60, total: 50 },
    // 90 base + (90-25)*0.25 = 90 + 16.25 = 106.25 -> 106
    { name: '90m is where the bonus stops accruing', seconds: 90 * 60, total: 106 },
    // 120 base + 16.25 (bonus still capped at 65 minutes) = 136.25 -> 136
    { name: '120m gets no bonus past minute 90', seconds: 120 * 60, total: 136 },
    // Clamped to 180m: 180 + 16.25 = 196.25 -> 196
    { name: '4h clamps to the 180m session cap', seconds: 4 * 3600, total: 196 },
    // 60 + 8.75 = 68.75, x1.2 = 82.5 -> 83 (half-up, matching SQL round())
    { name: 'a 10-day streak multiplies by 1.2', seconds: 60 * 60, streak: 10, total: 83 },
    // 68.75 x 1.6 = 110
    { name: 'a 30-day streak multiplies by 1.6', seconds: 60 * 60, streak: 30, total: 110 },
    { name: 'the multiplier caps at 30 days', seconds: 60 * 60, streak: 365, total: 110 },
    { name: 'the daily cap clips the award', seconds: 60 * 60, coinsToday: 390, total: 10 },
    { name: 'nothing is paid once the cap is reached', seconds: 60 * 60, coinsToday: 400, total: 0 },
    {
      name: 'the goal bonus survives a capped day',
      seconds: 60 * 60,
      coinsToday: 400,
      goal: true,
      total: 30,
    },
    {
      name: 'the goal bonus is added on top of a normal award',
      seconds: 30 * 60,
      goal: true,
      total: 31 + 30,
    },
    {
      name: 'a sub-floor session earns nothing even when the goal flag is set',
      seconds: 120,
      goal: true,
      total: 0,
    },
  ]

  it.each(cases)('$name', ({ seconds, streak = 0, coinsToday = 0, goal = false, total }) => {
    const result = computeCoins({
      focusedSeconds: seconds,
      currentStreak: streak,
      coinsToday,
      meetsGoalFirstTime: goal,
    })
    expect(result.total).toBe(total)
  })

  it('reports the breakdown the session-complete screen shows', () => {
    const result = computeCoins({
      focusedSeconds: 45 * 60,
      currentStreak: 5,
      coinsToday: 0,
      meetsGoalFirstTime: true,
    })
    expect(result).toMatchObject({
      base: 45,
      tierBonus: 5,
      streakMultiplier: 1.1,
      gross: 55, // round(50 * 1.1)
      capped: 55,
      goalBonus: 30,
      total: 85,
      dailyCapHit: false,
    })
  })

  it('flags when the daily cap actually bit', () => {
    expect(
      computeCoins({
        focusedSeconds: 60 * 60,
        currentStreak: 0,
        coinsToday: 399,
        meetsGoalFirstTime: false,
      }).dailyCapHit,
    ).toBe(true)

    expect(
      computeCoins({
        focusedSeconds: 60 * 60,
        currentStreak: 0,
        coinsToday: 0,
        meetsGoalFirstTime: false,
      }).dailyCapHit,
    ).toBe(false)
  })

  it('never pays more than the cap plus the goal bonus in one session', () => {
    const result = computeCoins({
      focusedSeconds: COIN_RULES.maxSeconds,
      currentStreak: 30,
      coinsToday: 0,
      meetsGoalFirstTime: true,
    })
    expect(result.capped).toBeLessThanOrEqual(COIN_RULES.dailyCap)
    expect(result.total).toBeLessThanOrEqual(COIN_RULES.dailyCap + COIN_RULES.goalBonus)
  })

  it('treats negative input as zero rather than paying out', () => {
    expect(
      computeCoins({
        focusedSeconds: -600,
        currentStreak: -5,
        coinsToday: -100,
        meetsGoalFirstTime: false,
      }).total,
    ).toBe(0)
  })
})

describe('streakMultiplier', () => {
  it.each([
    [0, 1],
    [1, 1.02],
    [15, 1.3],
    [29, 1.58],
    [30, 1.6],
    [31, 1.6],
    [10_000, 1.6],
  ])('a %i-day streak gives %fx', (days, expected) => {
    expect(streakMultiplier(days)).toBe(expected)
  })
})

describe('streakThresholdMinutes', () => {
  it.each([
    [5, 15], // the 15-minute floor wins for small goals
    [20, 15],
    [30, 15],
    [31, 16], // half, rounded up
    [60, 30],
    [45, 23],
    [120, 60],
  ])('a %i-minute goal needs %i minutes to count', (goal, expected) => {
    expect(streakThresholdMinutes(goal)).toBe(expected)
  })
})
