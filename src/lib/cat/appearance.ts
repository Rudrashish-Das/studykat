import { rngForSeed } from './prng'

/**
 * Every cat in StudyCat is this object, and this object is a pure function of
 * (seed, variant). Nothing here reads the clock, the network, or a random
 * source — regenerate it a thousand times and it comes back identical.
 */

/**
 * Curated coats: warm, muted, nothing neon, no pure black and no pure white.
 * The darkest is a soft charcoal and the lightest a warm ivory, so a cat always
 * reads against both the cream room and the dim focus-mode background.
 */
export const COAT_COLORS = [
  { name: 'ginger', body: '#d9a06a', shade: '#b97f4c' },
  { name: 'marmalade', body: '#e0b177', shade: '#c08f55' },
  { name: 'caramel', body: '#c99a6b', shade: '#a67a4f' },
  { name: 'fawn', body: '#e3c9a4', shade: '#c4a67e' },
  { name: 'ivory', body: '#f0e2cd', shade: '#d6c2a6' },
  { name: 'oat', body: '#dcd0bb', shade: '#bcae96' },
  { name: 'ash', body: '#b9b3ae', shade: '#968f8a' },
  { name: 'slate', body: '#8d8a92', shade: '#6e6b74' },
  { name: 'charcoal', body: '#59535c', shade: '#423d46' },
  { name: 'chocolate', body: '#7a5c4b', shade: '#5d4437' },
  { name: 'cinnamon', body: '#a4704f', shade: '#83573b' },
  { name: 'smoke', body: '#a0a6a3', shade: '#7d8380' },
  { name: 'sage', body: '#a7b89b', shade: '#84957a' },
  { name: 'dove', body: '#c7bfc4', shade: '#a49ba1' },
] as const

export const EYE_COLORS = [
  { name: 'amber', color: '#d99a3d' },
  { name: 'gold', color: '#e3b755' },
  { name: 'copper', color: '#c07a4a' },
  { name: 'green', color: '#7f9b62' },
  { name: 'moss', color: '#68855a' },
  { name: 'blue', color: '#7fa8c4' },
  { name: 'sky', color: '#9dc0d4' },
  { name: 'hazel', color: '#a8894f' },
] as const

export const NOSE_COLORS = [
  { name: 'rose', color: '#d9a5a0' },
  { name: 'clay', color: '#bb8079' },
  { name: 'mauve', color: '#b08f95' },
  { name: 'ash', color: '#8d8188' },
] as const

export const PATTERNS = [
  'solid',
  'tabby',
  'tuxedo',
  'calico',
  'colorpoint',
  'bicolor',
  'van',
] as const

export const EAR_SHAPES = ['pointed', 'round', 'folded'] as const
export const TAILS = ['long', 'short', 'curl'] as const
export const FACE_MARKINGS = ['none', 'blaze', 'mask', 'freckles', 'brow'] as const

export type Pattern = (typeof PATTERNS)[number]
export type EarShape = (typeof EAR_SHAPES)[number]
export type Tail = (typeof TAILS)[number]
export type FaceMarking = (typeof FACE_MARKINGS)[number]

export interface CatAppearance {
  /** For debugging and for the "your cat's code" line in Settings. */
  seed: string
  variant: number
  coat: { name: string; body: string; shade: string }
  pattern: Pattern
  accent: string
  eye: string
  /** Set only for the ~3% of cats with two different eyes. */
  eyeRight: string | null
  ear: EarShape
  tail: Tail
  face: FaceMarking
  /** 0-4 white socks. */
  socks: number
  nose: string
  /** ~1% of cats. A faint shimmer, nothing loud. */
  sparkle: boolean
}

/** The lighter coats a pattern's accent is drawn from. */
const ACCENT_LIGHT = ['#f3e8d8', '#ece0cd', '#f0e6d5'] as const
/** The darker accents, for tabby stripes and colorpoints. */
const ACCENT_DARK = ['#6b5a51', '#5d4437', '#4a3b34', '#57505a'] as const

export function generateAppearance(seed: string, variant = 0): CatAppearance {
  const rng = rngForSeed(seed, variant)

  const coat = rng.pick(COAT_COLORS)
  const pattern = rng.pick(PATTERNS)

  // Patterns that read as "two-tone" want a light accent; striped and pointed
  // patterns want a darker one, or the markings disappear.
  const accent =
    pattern === 'tabby' || pattern === 'colorpoint'
      ? rng.pick(ACCENT_DARK)
      : rng.pick(ACCENT_LIGHT)

  const eye = rng.pick(EYE_COLORS).color
  const heterochromia = rng.chance(0.03)
  // Draw the second colour regardless, so the stream stays aligned whether or
  // not this cat has two eye colours. Otherwise adding a trait later would
  // reshuffle every existing cat.
  const secondEye = rng.pick(EYE_COLORS).color

  const ear = rng.pick(EAR_SHAPES)
  const tail = rng.pick(TAILS)
  const face = rng.pick(FACE_MARKINGS)
  const socks = rng.int(5)
  const nose = rng.pick(NOSE_COLORS).color
  const sparkle = rng.chance(0.01)

  return {
    seed,
    variant,
    coat,
    pattern,
    accent,
    eye,
    eyeRight: heterochromia && secondEye !== eye ? secondEye : null,
    ear,
    tail,
    face,
    socks,
    nose,
    sparkle,
  }
}

/** The three candidates offered at onboarding. */
export function candidateAppearances(seed: string): [CatAppearance, CatAppearance, CatAppearance] {
  return [generateAppearance(seed, 0), generateAppearance(seed, 1), generateAppearance(seed, 2)]
}

/** A short human description, used as the SVG's accessible label. */
export function describeAppearance(cat: CatAppearance): string {
  const parts = [cat.coat.name]
  if (cat.pattern !== 'solid') parts.push(cat.pattern)
  parts.push('cat')

  const details: string[] = []
  if (cat.eyeRight) details.push('odd eyes')
  if (cat.socks > 0) details.push(`${cat.socks} white sock${cat.socks > 1 ? 's' : ''}`)
  if (cat.ear === 'folded') details.push('folded ears')
  if (cat.tail === 'curl') details.push('a curled tail')
  if (cat.sparkle) details.push('a faint shimmer')

  const suffix = details.length > 0 ? ` with ${listify(details)}` : ''
  return `A ${parts.join(' ')}${suffix}.`
}

function listify(items: string[]): string {
  if (items.length <= 1) return items[0] ?? ''
  if (items.length === 2) return `${items[0]} and ${items[1]}`
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`
}
