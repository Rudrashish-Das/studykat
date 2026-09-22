import { createContext, useContext, useEffect, useState } from 'react'

/**
 * How dark the room looks, from the user's local time of day in fractional
 * hours (18.5 is half past six). Dusk comes on from 5pm and is full by 7pm, then
 * lifts again between 4am and 6am — a tint, never a blackout (§8).
 */
export function nightnessFor(hour: number): number {
  if (hour >= 6 && hour < 17) return 0
  if (hour >= 17 && hour < 19) return (hour - 17) / 2 // dusk
  if (hour >= 19 || hour < 4) return 1
  return Math.max(0, (6 - hour) / 2) // dawn
}

/** The local time of day in `timeZone` as fractional hours, e.g. 18.25. */
export function localTimeOfDay(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(at)
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0) % 24
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? 0)
  return hour + minute / 60
}

/**
 * The current time, refreshed every minute, so anything drawn from the clock —
 * the night tint, the cat falling asleep — changes while the page stays open.
 */
export function useNow(intervalMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), intervalMs)
    // Phones freeze timers in background tabs; catch up as soon as it is back.
    const onVisible = () => {
      if (document.visibilityState === 'visible') setNow(new Date())
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [intervalMs])
  return now
}

/**
 * The timezone the room's clocks keep. Screens that know the user's stored
 * timezone provide it, so a wall clock agrees with the night tint; anywhere
 * else (a shop preview) falls back to this device's own zone.
 */
export const ClockTimeZone = createContext<string | undefined>(undefined)

export function useClockTimeZone(): string {
  return useContext(ClockTimeZone) ?? Intl.DateTimeFormat().resolvedOptions().timeZone
}
