/**
 * A tiny seeded PRNG. The cat depends on this being stable forever: the same
 * seed must produce the same cat on every device, in every browser, for the
 * life of the account. So this is a fixed algorithm with fixed constants and
 * no reliance on `Math.random`, `Date`, or anything else that varies.
 *
 * Do not "improve" the constants. Changing them rewrites everybody's cat.
 */

/** xmur3 — turns a string seed into a well-mixed 32-bit integer. */
export function hashSeed(seed: string): number {
  let h = 1779033703 ^ seed.length
  for (let i = 0; i < seed.length; i += 1) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507)
  h = Math.imul(h ^ (h >>> 13), 3266489909)
  return (h ^= h >>> 16) >>> 0
}

export interface Rng {
  /** A float in [0, 1). */
  next: () => number
  /** An integer in [0, max). */
  int: (max: number) => number
  /** An element of `items`. Never called with an empty array. */
  pick: <T>(items: readonly T[]) => T
  /** True with probability `p`. */
  chance: (p: number) => boolean
}

/** mulberry32 — small, fast, and good enough for picking cat markings. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0

  const next = (): number => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  const int = (max: number): number => Math.floor(next() * Math.max(1, max))

  const pick = <T,>(items: readonly T[]): T => {
    const item = items[int(items.length)]
    // `noUncheckedIndexedAccess` makes this explicit; int() cannot exceed the
    // bounds, so the fallback is only ever reached for an empty array.
    if (item === undefined) throw new Error('pick() called with an empty list')
    return item
  }

  const chance = (p: number): boolean => next() < p

  return { next, int, pick, chance }
}

/**
 * The generator for one account's cat.
 *
 * `variant` offsets the seed so onboarding can show three different cats that
 * are all still derived from — and permanently tied to — the one account seed.
 * The offset is the golden-ratio constant, which decorrelates the three.
 */
export function rngForSeed(seed: string, variant = 0): Rng {
  return mulberry32((hashSeed(seed) + variant * 0x9e3779b9) >>> 0)
}
