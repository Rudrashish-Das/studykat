import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CatPose } from '@/components/cat/Cat'
import type { PlacedItem } from '@/components/room/Room'
import { blockedCells, cellKey, findPath, pickWanderTarget } from '@/lib/iso/path'
import type { GridPoint } from '@/lib/iso/projection'
import { usePrefersReducedMotion } from '@/lib/useReducedMotion'
import {
  approach,
  bedtimeSpot,
  chooseItem,
  inlineName,
  interactionFor,
  isInteractable,
  petLine,
  type Interaction,
} from './interactions'

export const STEP_MS = 900
const REST_MIN_MS = 3000
const REST_RANGE_MS = 5000
const PET_MS = 2600
/** Petting a sleeping cat wakes it for this long. */
const WOKEN_MS = 2 * 60 * 1000
/** How often an idle cat goes to an item rather than just across the room. */
const ITEM_CHANCE = 0.7

type Activity =
  | { kind: 'idle' }
  | { kind: 'walking'; itemId: string | null }
  | { kind: 'interacting'; itemId: string; interaction: Interaction }
  | { kind: 'petted'; line: string; returnTo: Activity }
  | { kind: 'sleeping' }

export interface CatLife {
  tile: GridPoint
  facing: 'left' | 'right'
  activity: Activity
  /** Bumped on every pat, so the hearts replay even on a second pat. */
  pats: number
}

export interface CatLifeView {
  tile: GridPoint
  facing: 'left' | 'right'
  pose: CatPose
  /** The item the cat is sitting on, and how high up that is. */
  perch: { itemId: string; lift: number } | null
  /** The item being played with, so it can move too. */
  activeItem: { id: string; motion: Interaction['motion'] } | null
  effect: 'hearts' | 'zzz' | null
  pats: number
  /** "Miso is batting the ball of yarn around." */
  description: string
  pet: () => void
  visit: (itemId: string) => void
}

/**
 * The cat's day between sessions: rest, wander, go and do something with one
 * of the things you bought, rest again. At night it takes itself to the
 * softest thing in the room and sleeps there.
 *
 * You can pet it, which interrupts whatever it was doing (and wakes it, for a
 * bit, if it was asleep), and tap any object to send it over. With reduced
 * motion it does not wander on its own, and goes straight to where it is sent.
 */
export function useCatLife(input: {
  placed: PlacedItem[]
  asleep: boolean
  catName: string
}): CatLifeView {
  const reducedMotion = usePrefersReducedMotion()
  const blocked = useMemo(() => blockedCells(input.placed), [input.placed])

  const [life, setLife] = useState<CatLife>(() => ({
    tile: startTile(blocked),
    facing: 'left',
    activity: { kind: 'idle' },
    pats: 0,
  }))

  // The routine runs on timers, so it reads the latest inputs through refs
  // rather than whatever it closed over when the timer was set.
  const lifeRef = useRef(life)
  const env = useRef({ placed: input.placed, blocked, asleep: input.asleep, reducedMotion })
  env.current = { placed: input.placed, blocked, asleep: input.asleep, reducedMotion }
  const timer = useRef<number | undefined>(undefined)
  const wokenUntil = useRef(0)

  const set = useCallback((patch: Partial<CatLife>) => {
    lifeRef.current = { ...lifeRef.current, ...patch }
    setLife(lifeRef.current)
  }, [])

  const schedule = useCallback((fn: () => void, ms: number) => {
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(fn, ms)
  }, [])

  // Declared as refs so the routine's steps can call each other in any order.
  const brain = useRef<{
    rest: (ms?: number) => void
    decide: () => void
    walk: (path: GridPoint[], itemId: string | null, then: () => void) => void
    goTo: (itemId: string, forever?: boolean) => boolean
    sleep: () => void
  }>({ rest: noop, decide: noop, walk: noop, goTo: () => false, sleep: noop })

  brain.current.rest = (ms = REST_MIN_MS + Math.random() * REST_RANGE_MS) => {
    set({ activity: { kind: 'idle' } })
    schedule(() => brain.current.decide(), ms)
  }

  brain.current.decide = () => {
    const { placed, blocked, asleep, reducedMotion } = env.current
    if (asleep && Date.now() > wokenUntil.current) {
      brain.current.sleep()
      return
    }
    // Reduced motion: no pottering about unprompted.
    if (reducedMotion) {
      set({ activity: { kind: 'idle' } })
      return
    }

    const current = lifeRef.current
    const lastItem = current.activity.kind === 'interacting' ? current.activity.itemId : null
    if (Math.random() < ITEM_CHANCE) {
      const item = chooseItem(placed, Math.random, lastItem)
      if (item && brain.current.goTo(item.id)) return
    }

    const target = pickWanderTarget(current.tile, blocked, Math.random)
    const path = target ? findPath(current.tile, target, blocked) : []
    if (path.length === 0) {
      brain.current.rest()
      return
    }
    brain.current.walk(path, null, () => brain.current.rest())
  }

  brain.current.walk = (path, itemId, then) => {
    const steps = [...path]
    if (env.current.reducedMotion) {
      const last = steps[steps.length - 1]
      if (last) set({ tile: last, facing: facingFor(lifeRef.current.tile, last, lifeRef.current.facing) })
      then()
      return
    }
    const step = () => {
      const next = steps.shift()
      if (!next) {
        then()
        return
      }
      const from = lifeRef.current.tile
      set({
        tile: next,
        facing: facingFor(from, next, lifeRef.current.facing),
        activity: { kind: 'walking', itemId },
      })
      schedule(step, STEP_MS)
    }
    step()
  }

  brain.current.goTo = (itemId, forever = false) => {
    const { placed, blocked } = env.current
    const target = placed.find((p) => p.id === itemId)
    if (!target || !isInteractable(target)) return false
    const route = approach(target, lifeRef.current.tile, blocked)
    if (!route) return false

    const interaction = forever
      ? { ...interactionFor(target.item), pose: 'sleeping' as const, action: 'nap' as const }
      : interactionFor(target.item)

    brain.current.walk(route.path, itemId, () => {
      const cat = lifeRef.current.tile
      set({
        facing: facingToward(cat, target, lifeRef.current.facing),
        activity: { kind: 'interacting', itemId, interaction },
      })
      if (forever) {
        window.clearTimeout(timer.current)
        return
      }
      const [min, max] = interaction.duration
      schedule(() => brain.current.rest(), min + Math.random() * (max - min))
    })
    return true
  }

  brain.current.sleep = () => {
    const spot = bedtimeSpot(env.current.placed)
    if (spot && brain.current.goTo(spot.id, true)) return
    window.clearTimeout(timer.current)
    set({ activity: { kind: 'sleeping' } })
  }

  // Start the day, and stop it on the way out.
  useEffect(() => {
    brain.current.rest(env.current.asleep ? 600 : REST_MIN_MS)
    return () => window.clearTimeout(timer.current)
  }, [])

  // Bedtime and morning.
  useEffect(() => {
    const { activity } = lifeRef.current
    if (input.asleep) {
      if (Date.now() > wokenUntil.current && activity.kind !== 'petted') brain.current.sleep()
    } else if (activity.kind === 'sleeping' || isNapping(activity)) {
      brain.current.rest(1500)
    }
  }, [input.asleep])

  // Furniture moved or sold from under it: step off anything that went, and
  // out of any tile that is now solid.
  useEffect(() => {
    const current = lifeRef.current
    const itemId = activityItem(current.activity)
    const gone = itemId !== null && !input.placed.some((p) => p.id === itemId)
    const stuck = blocked.has(cellKey(current.tile.gx, current.tile.gy))
    if (stuck) set({ tile: pickWanderTarget(current.tile, blocked, Math.random) ?? current.tile })
    if (gone || stuck) brain.current.rest(1500)
  }, [input.placed, blocked, set])

  const pet = useCallback(() => {
    const current = lifeRef.current
    const wasAsleep = current.activity.kind === 'sleeping' || isNapping(current.activity)
    if (wasAsleep && env.current.asleep) wokenUntil.current = Date.now() + WOKEN_MS
    // A cat petted mid-nap is awake now; one petted mid-play goes back to it.
    const returnTo: Activity =
      wasAsleep || current.activity.kind === 'petted' || current.activity.kind === 'walking'
        ? { kind: 'idle' }
        : current.activity
    set({
      activity: { kind: 'petted', line: petLine(Math.random), returnTo },
      pats: current.pats + 1,
    })
    schedule(() => {
      if (returnTo.kind === 'interacting') {
        set({ activity: returnTo })
        schedule(() => brain.current.rest(), 3000)
      } else {
        brain.current.rest()
      }
    }, PET_MS)
  }, [schedule, set])

  const visit = useCallback((itemId: string) => {
    if (env.current.asleep) wokenUntil.current = Date.now() + WOKEN_MS
    if (!brain.current.goTo(itemId)) brain.current.rest()
  }, [])

  return useMemo(
    () => describe(life, input.placed, input.catName, pet, visit),
    [life, input.placed, input.catName, pet, visit],
  )
}

/* ---------------------------------------------------------------- helpers */

const noop = () => undefined

function startTile(blocked: Set<string>): GridPoint {
  const start = { gx: 5, gy: 5 }
  return blocked.has(cellKey(start.gx, start.gy))
    ? (pickWanderTarget(start, blocked, Math.random) ?? start)
    : start
}

function isNapping(activity: Activity): boolean {
  return activity.kind === 'interacting' && activity.interaction.pose === 'sleeping'
}

function activityItem(activity: Activity): string | null {
  if (activity.kind === 'walking' || activity.kind === 'interacting') return activity.itemId
  if (activity.kind === 'petted') return activityItem(activity.returnTo)
  return null
}

/**
 * Which way the cat faces after a step. On screen, +gx goes down-right and +gy
 * goes down-left, so the sideways part of a move is gx - gy.
 */
function facingFor(from: GridPoint, to: GridPoint, current: 'left' | 'right'): 'left' | 'right' {
  const dx = to.gx - to.gy - (from.gx - from.gy)
  return dx > 0 ? 'right' : dx < 0 ? 'left' : current
}

function facingToward(
  cat: GridPoint,
  target: PlacedItem,
  current: 'left' | 'right',
): 'left' | 'right' {
  const centre = {
    gx: target.grid_x + (target.item.footprint_w - 1) / 2,
    gy: target.grid_y + (target.item.footprint_h - 1) / 2,
  }
  return facingFor(cat, centre, current)
}

function describe(
  life: CatLife,
  placed: PlacedItem[],
  name: string,
  pet: () => void,
  visit: (itemId: string) => void,
): CatLifeView {
  const base = { tile: life.tile, facing: life.facing, pats: life.pats, pet, visit }
  const thing = (id: string | null) => {
    const found = id ? placed.find((p) => p.id === id) : undefined
    return found ? inlineName(found.item.name) : null
  }

  // While being petted the cat stays wherever it was, perched or not.
  const underlying = life.activity.kind === 'petted' ? life.activity.returnTo : life.activity
  const perchOf = (a: Activity) =>
    a.kind === 'interacting' && a.interaction.lift !== null
      ? { itemId: a.itemId, lift: a.interaction.lift }
      : null

  switch (life.activity.kind) {
    case 'petted':
      return {
        ...base,
        pose: 'happy',
        perch: perchOf(underlying),
        activeItem: null,
        effect: 'hearts',
        description: `${name} ${life.activity.line}`,
      }
    case 'interacting': {
      const { interaction, itemId } = life.activity
      const t = thing(itemId) ?? 'thing'
      return {
        ...base,
        pose: interaction.pose,
        perch: perchOf(life.activity),
        activeItem: interaction.motion ? { id: itemId, motion: interaction.motion } : null,
        effect: interaction.pose === 'sleeping' ? 'zzz' : null,
        description: `${name} ${interaction.describe(t)}`,
      }
    }
    case 'walking': {
      const t = thing(life.activity.itemId)
      return {
        ...base,
        pose: 'idle',
        perch: null,
        activeItem: null,
        effect: null,
        description: t ? `${name} is heading for the ${t}.` : `${name} is pottering about.`,
      }
    }
    case 'sleeping':
      return {
        ...base,
        pose: 'sleeping',
        perch: null,
        activeItem: null,
        effect: 'zzz',
        description: `${name} is asleep. Tap to give them a gentle pat.`,
      }
    case 'idle':
    default:
      return {
        ...base,
        pose: 'idle',
        perch: null,
        activeItem: null,
        effect: null,
        description: `${name} is pottering about. Tap ${name} to pet them, or tap something in the room.`,
      }
  }
}
