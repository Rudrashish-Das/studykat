import type { CatPose } from '@/components/cat/Cat'
import { parseArtKey } from '@/components/room/materials'
import { cellKey, findPath } from '@/lib/iso/path'
import {
  GRID_SIZE,
  WALL_LAYER,
  footprintCells,
  isInsideGrid,
  wallSpotOf,
  type GridPoint,
} from '@/lib/iso/projection'

/**
 * What the cat does with each thing in the room.
 *
 * Everything the user can buy has an entry, keyed by the shape half of its
 * `art_key` so a re-coloured item behaves like the original. Toys are what the
 * cat is most drawn to; furniture is somewhere to sit or sleep; the rest gets
 * a sniff or a long stare.
 */

export type CatAction = 'play' | 'scratch' | 'nap' | 'perch' | 'sniff' | 'watch' | 'roll'

/** How the item itself answers back while the cat is at it. */
export type ItemMotion = 'roll' | 'sway' | 'shake' | 'rustle' | null

export interface Interaction {
  action: CatAction
  pose: CatPose
  /** Room pixels to lift the cat by when it climbs onto the item; null stays on the floor. */
  lift: number | null
  motion: ItemMotion
  /** How strongly the cat is drawn to it when choosing what to do next. */
  weight: number
  /** How long it keeps at it, in ms, as [min, max]. */
  duration: [number, number]
  /** Completes "Miso …" — `thing` is the item's name in lower case. */
  describe: (thing: string) => string
}

const PLAY: [number, number] = [6000, 10000]
const NAP: [number, number] = [14000, 24000]
const SIT: [number, number] = [6000, 11000]
const LOOK: [number, number] = [3500, 6000]

const perch = (lift: number, describe?: Interaction['describe']): Interaction => ({
  action: 'perch',
  pose: 'idle',
  lift,
  motion: null,
  weight: 1,
  duration: SIT,
  describe: describe ?? ((t) => `is sitting on the ${t}.`),
})

const nap = (lift: number, describe: Interaction['describe'], weight = 2): Interaction => ({
  action: 'nap',
  pose: 'sleeping',
  lift,
  motion: null,
  weight,
  duration: NAP,
  describe,
})

const sniff = (describe?: Interaction['describe'], motion: ItemMotion = null): Interaction => ({
  action: 'sniff',
  pose: 'curious',
  lift: null,
  motion,
  weight: 1,
  duration: LOOK,
  describe: describe ?? ((t) => `is sniffing the ${t}.`),
})

const watch = (describe?: Interaction['describe']): Interaction => ({
  action: 'watch',
  pose: 'curious',
  lift: null,
  motion: null,
  weight: 1,
  duration: LOOK,
  describe: describe ?? ((t) => `is staring up at the ${t}.`),
})

/** Keyed by art shape. Heights match the seat or top of each drawing in Furniture. */
const BY_SHAPE: Record<string, Interaction> = {
  // Toys: the good stuff.
  'toy-ball': {
    action: 'play',
    pose: 'playing',
    lift: null,
    motion: 'roll',
    weight: 5,
    duration: PLAY,
    describe: (t) => `is batting the ${t} around.`,
  },
  'toy-wand': {
    action: 'play',
    pose: 'playing',
    lift: null,
    motion: 'sway',
    weight: 5,
    duration: PLAY,
    describe: (t) => `is pouncing on the ${t}.`,
  },
  tallbox: {
    action: 'scratch',
    pose: 'scratching',
    lift: null,
    motion: 'shake',
    weight: 4,
    duration: PLAY,
    describe: (t) => `is sharpening their claws on the ${t}.`,
  },
  catbed: nap(4, (t) => `is curled up in the ${t}.`, 4),
  cattree: { ...perch(56, (t) => `is surveying the room from the top of the ${t}.`), weight: 4 },
  castle: {
    action: 'play',
    pose: 'playing',
    lift: 40,
    motion: 'shake',
    weight: 4,
    duration: PLAY,
    describe: (t) => `is defending the ${t} from the battlements.`,
  },

  // Furniture: somewhere to be.
  bed: nap(25, (t) => `is napping on the ${t}, in your spot.`),
  sofa: nap(19, (t) => `is napping on the ${t}.`),
  armchair: nap(18, (t) => `is curled up in the ${t}.`),
  'box-low': perch(16),
  crate: perch(28, (t) => `is sitting in the ${t}. It is a fort now.`),
  table: perch(27, (t) => `is sitting on the ${t}, next to nothing in particular.`),
  chair: perch(18, (t) => `has taken the ${t}.`),
  desk: perch(49, (t) => `is sitting on the ${t}, right on the open book.`),
  bookcase: perch(66, (t) => `is looking down from the top of the ${t}.`),
  wardrobe: perch(78, (t) => `has somehow got on top of the ${t}.`),
  piano: sniff((t) => `is pawing at the ${t}. Plink.`, 'shake'),
  grandfather: watch((t) => `is watching the ${t} tick.`),

  // Plants: sniffed, and sometimes regretted.
  succulent: sniff(undefined, 'rustle'),
  fern: sniff((t) => `is nibbling the ${t}.`, 'rustle'),
  monstera: sniff((t) => `is batting at the ${t} leaves.`, 'rustle'),
  olive: sniff(undefined, 'rustle'),
  bonsai: sniff((t) => `is inspecting the ${t} very closely.`, 'rustle'),
  cactus: sniff((t) => `is keeping a respectful distance from the ${t}.`),

  // Lights: warmth.
  candle: watch((t) => `is eyeing the ${t} flame, tail well tucked.`),
  'lamp-table': sniff((t) => `is basking under the ${t}.`),
  'lamp-floor': sniff((t) => `is basking under the ${t}.`),
  lantern: watch((t) => `is gazing at the ${t}.`),

  // Floor decor.
  bookstack: perch(22, (t) => `is sitting on the ${t}. Nobody is reading those now.`),
  teaset: sniff((t) => `is investigating the ${t}. Careful.`, 'shake'),
}

const BY_CATEGORY: Record<string, Interaction> = {
  toy: BY_SHAPE['toy-ball']!,
  rug: {
    action: 'roll',
    pose: 'happy',
    lift: null,
    motion: null,
    weight: 2,
    duration: SIT,
    describe: (t) => `is rolling around on the ${t}.`,
  },
  plant: sniff(undefined, 'rustle'),
  light: sniff((t) => `is basking by the ${t}.`),
}

export interface InteractableItem {
  id: string
  grid_x: number
  grid_y: number
  rotation: number
  item: {
    name: string
    art_key: string
    category: string
    layer: number
    footprint_w: number
    footprint_h: number
  }
}

/** Floors, walls and wall colour are the room itself, not things in it. */
export function isInteractable(p: InteractableItem): boolean {
  return !['floor', 'wall', 'wallcolor'].includes(p.item.category)
}

export function interactionFor(item: InteractableItem['item']): Interaction {
  const { shape } = parseArtKey(item.art_key)
  const known = BY_SHAPE[shape]
  if (known) return known
  if (item.layer === WALL_LAYER) return watch()
  return BY_CATEGORY[item.category] ?? sniff()
}

/** "Ball of yarn" → "ball of yarn", for use mid-sentence. */
export function inlineName(name: string): string {
  return name.charAt(0).toLowerCase() + name.slice(1)
}

/**
 * Where the cat should stand to use an item, and the walk there, from `from`.
 *
 * Solid things are approached from a free tile beside them; rugs are walked
 * onto; wall pieces are looked up at from the tile beneath. The closest
 * reachable spot wins. Null when the item is boxed in.
 */
export function approach(
  target: InteractableItem,
  from: GridPoint,
  blocked: Set<string>,
): { stand: GridPoint; path: GridPoint[] } | null {
  const { item } = target
  let candidates: GridPoint[]

  if (item.layer === WALL_LAYER) {
    const spot = wallSpotOf(target.grid_x, target.grid_y)
    candidates = [spot, ...neighbours(spot)]
  } else {
    const cells = footprintCells(
      target.grid_x,
      target.grid_y,
      item.footprint_w,
      item.footprint_h,
      target.rotation,
    )
    if (item.layer === 2) {
      const own = new Set(cells.map((c) => cellKey(c.gx, c.gy)))
      candidates = cells.flatMap(neighbours).filter((c) => !own.has(cellKey(c.gx, c.gy)))
    } else {
      candidates = cells
    }
  }

  let best: { stand: GridPoint; path: GridPoint[] } | null = null
  const seen = new Set<string>()
  for (const c of candidates) {
    const key = cellKey(c.gx, c.gy)
    if (seen.has(key) || !isInsideGrid(c.gx, c.gy, GRID_SIZE) || blocked.has(key)) continue
    seen.add(key)
    const here = c.gx === from.gx && c.gy === from.gy
    const path = here ? [] : findPath(from, c, blocked)
    if (!here && path.length === 0) continue
    if (!best || path.length < best.path.length) best = { stand: c, path }
  }
  return best
}

function neighbours(cell: GridPoint): GridPoint[] {
  return [
    { gx: cell.gx + 1, gy: cell.gy },
    { gx: cell.gx - 1, gy: cell.gy },
    { gx: cell.gx, gy: cell.gy + 1 },
    { gx: cell.gx, gy: cell.gy - 1 },
  ]
}

/** Picks an item, favouring toys. `random` is injectable for tests. */
export function chooseItem<T extends InteractableItem>(
  items: readonly T[],
  random: () => number,
  exclude?: string | null,
): T | null {
  const pool = items.filter((p) => isInteractable(p) && p.id !== exclude)
  if (pool.length === 0) return null
  const total = pool.reduce((sum, p) => sum + interactionFor(p.item).weight, 0)
  let roll = random() * total
  for (const p of pool) {
    roll -= interactionFor(p.item).weight
    if (roll < 0) return p
  }
  return pool[pool.length - 1] ?? null
}

/** Somewhere soft for the night, best first. */
const BEDTIME_ORDER = ['catbed', 'bed', 'sofa', 'armchair']

export function bedtimeSpot<T extends InteractableItem>(items: readonly T[]): T | null {
  for (const shape of BEDTIME_ORDER) {
    const found = items.find((p) => parseArtKey(p.item.art_key).shape === shape)
    if (found) return found
  }
  return null
}

const PET_LINES = [
  'leans into your hand and purrs.',
  'headbutts your palm.',
  'slow-blinks at you.',
  'rolls over for a belly rub. It is a trap.',
  'purrs like a small engine.',
  'kneads the air, very pleased.',
]

export function petLine(random: () => number): string {
  return PET_LINES[Math.floor(random() * PET_LINES.length)] ?? PET_LINES[0]!
}
