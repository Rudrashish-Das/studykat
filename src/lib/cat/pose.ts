import type { CatPose } from '@/components/cat/Cat'
import { localHour } from '@/lib/economy/streak'

/** After this hour (local), the cat curls up. §7. */
export const SLEEP_FROM_HOUR = 22
export const WAKE_AT_HOUR = 6

export function isSleepyHour(now: Date, timeZone: string): boolean {
  const hour = localHour(now, timeZone)
  return hour >= SLEEP_FROM_HOUR || hour < WAKE_AT_HOUR
}

/**
 * What the cat should be doing right now. Session first — a cat studying
 * alongside you at 1am is better than a cat asleep while you work.
 */
export function poseForContext(input: {
  now: Date
  timeZone: string
  sessionActive: boolean
  celebrating?: boolean
}): CatPose {
  if (input.celebrating) return 'happy'
  if (input.sessionActive) return 'studying'
  if (isSleepyHour(input.now, input.timeZone)) return 'sleeping'
  return 'idle'
}

/** One line from the cat after a session. Deliberately low-key. */
export function catReaction(input: {
  credited: boolean
  coins: number
  streakAdvanced: boolean
  goalMet: boolean
  freezeUsed: boolean
  catName: string
}): string {
  const { catName } = input
  if (!input.credited) return `${catName} barely looked up. Anything under five minutes is a stretch.`
  if (input.freezeUsed) return `${catName} covered for you yesterday. That was the last favour.`
  if (input.goalMet) return `${catName} looks pleased. That is the whole goal, done.`
  if (input.streakAdvanced) return `${catName} noticed. Another day on the board.`
  if (input.coins >= 100) return `${catName} did not move the entire time.`
  return `${catName} sat with you the whole way.`
}
