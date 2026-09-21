import { useEffect, useMemo, useRef, useState } from 'react'
import { blockedCells, cellKey, findPath, pickWanderTarget } from '@/lib/iso/path'
import type { GridPoint } from '@/lib/iso/projection'
import type { PlacedItem } from '@/components/room/Room'
import { usePrefersReducedMotion } from '@/lib/useReducedMotion'

const STEP_MS = 1100
const REST_MIN_MS = 4000
const REST_RANGE_MS = 7000

/**
 * Where the cat is standing.
 *
 * Between sessions it wanders slowly, pathing around furniture rather than
 * through it. During a session it sits at the desk; asleep it stays put. With
 * reduced motion requested it does not wander at all (§9) — it simply sits
 * somewhere sensible.
 */
export function useCatWander(input: {
  placed: PlacedItem[]
  /** 'wander' | 'desk' | 'still' */
  mode: 'wander' | 'desk' | 'still'
}): GridPoint {
  const reducedMotion = usePrefersReducedMotion()
  const [tile, setTile] = useState<GridPoint>({ gx: 5, gy: 5 })
  const pathRef = useRef<GridPoint[]>([])

  const blocked = useMemo(() => blockedCells(input.placed), [input.placed])

  // Where the desk is, if the user owns one — that is where a studying cat sits.
  const deskSeat = useMemo(() => {
    const desk = input.placed.find((p) => p.item.art_key.startsWith('desk/'))
    if (!desk) return null
    // The free tile in front of the desk, or beside it if that is taken.
    const candidates: GridPoint[] = [
      { gx: desk.grid_x, gy: desk.grid_y + 1 },
      { gx: desk.grid_x + 1, gy: desk.grid_y },
      { gx: desk.grid_x - 1, gy: desk.grid_y },
      { gx: desk.grid_x, gy: desk.grid_y - 1 },
    ]
    return (
      candidates.find(
        (c) =>
          c.gx >= 0 && c.gy >= 0 && c.gx < 10 && c.gy < 10 && !blocked.has(cellKey(c.gx, c.gy)),
      ) ?? null
    )
  }, [input.placed, blocked])

  // Start somewhere legal.
  useEffect(() => {
    setTile((current) =>
      blocked.has(cellKey(current.gx, current.gy))
        ? (pickWanderTarget(current, blocked, Math.random) ?? current)
        : current,
    )
  }, [blocked])

  // Sitting at the desk is a destination, not a wander.
  useEffect(() => {
    if (input.mode !== 'desk' || !deskSeat) return
    pathRef.current = []
    setTile(deskSeat)
  }, [input.mode, deskSeat])

  useEffect(() => {
    if (input.mode !== 'wander' || reducedMotion) {
      pathRef.current = []
      return
    }

    let timer: number

    const step = () => {
      setTile((current) => {
        const next = pathRef.current.shift()
        if (next) {
          timer = window.setTimeout(step, STEP_MS)
          return next
        }
        // Path finished: rest a while, then choose somewhere new.
        timer = window.setTimeout(() => {
          const target = pickWanderTarget(current, blocked, Math.random)
          pathRef.current = target ? findPath(current, target, blocked) : []
          step()
        }, REST_MIN_MS + Math.random() * REST_RANGE_MS)
        return current
      })
    }

    timer = window.setTimeout(step, REST_MIN_MS)
    return () => window.clearTimeout(timer)
  }, [input.mode, blocked, reducedMotion])

  return tile
}
