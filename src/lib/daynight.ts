/**
 * How dark the room looks, from the user's local hour. Dusk comes on gradually
 * from 5pm and lifts again by 6am — a tint, never a blackout (§8).
 */
export function nightnessFor(hour: number): number {
  if (hour >= 6 && hour < 17) return 0
  if (hour >= 17 && hour < 20) return (hour - 17) / 3 // dusk
  if (hour >= 20 || hour < 4) return 1
  return Math.max(0, (6 - hour) / 2) // dawn
}
