import { GRID_SIZE, footprintCells, type GridPoint } from './projection'

export const cellKey = (gx: number, gy: number) => `${gx},${gy}`

/** The inverse of `cellKey`. `slice`, not a destructured `split`, so a
 *  well-formed key never needs an indexed-access assertion to read back. */
function parseCellKey(key: string): GridPoint {
  const comma = key.indexOf(',')
  return { gx: Number(key.slice(0, comma)), gy: Number(key.slice(comma + 1)) }
}

/** Cells the cat cannot walk through. Rugs and wall decor do not block. */
export function blockedCells(
  items: {
    grid_x: number
    grid_y: number
    rotation: number
    item: { footprint_w: number; footprint_h: number; layer: number; category: string }
  }[],
): Set<string> {
  const blocked = new Set<string>()
  for (const placed of items) {
    // Layer 0 is the floor and walls, 1 is rugs, 3 is hung on a wall — a cat
    // walks over or under all of those.
    if (placed.item.layer !== 2) continue
    for (const cell of footprintCells(
      placed.grid_x,
      placed.grid_y,
      placed.item.footprint_w,
      placed.item.footprint_h,
      placed.rotation,
    )) {
      blocked.add(cellKey(cell.gx, cell.gy))
    }
  }
  return blocked
}

/**
 * Shortest walk from `from` to `to` on the 4-connected grid, avoiding
 * `blocked`. Breadth-first is plenty at ten by ten, and unlike a greedy step it
 * will actually go around a bookcase rather than getting stuck against it.
 *
 * Returns the cells after `from`, or an empty array when there is no route.
 */
export function findPath(
  from: GridPoint,
  to: GridPoint,
  blocked: Set<string>,
  size = GRID_SIZE,
): GridPoint[] {
  if (from.gx === to.gx && from.gy === to.gy) return []
  if (blocked.has(cellKey(to.gx, to.gy))) return []

  const queue: GridPoint[] = [from]
  const cameFrom = new Map<string, string | null>([[cellKey(from.gx, from.gy), null]])

  const neighbours = (cell: GridPoint): GridPoint[] => [
    { gx: cell.gx + 1, gy: cell.gy },
    { gx: cell.gx - 1, gy: cell.gy },
    { gx: cell.gx, gy: cell.gy + 1 },
    { gx: cell.gx, gy: cell.gy - 1 },
  ]

  while (queue.length > 0) {
    const cell = queue.shift()
    if (!cell) break
    if (cell.gx === to.gx && cell.gy === to.gy) break

    for (const next of neighbours(cell)) {
      if (next.gx < 0 || next.gy < 0 || next.gx >= size || next.gy >= size) continue
      const key = cellKey(next.gx, next.gy)
      if (cameFrom.has(key) || blocked.has(key)) continue
      cameFrom.set(key, cellKey(cell.gx, cell.gy))
      queue.push(next)
    }
  }

  const goal = cellKey(to.gx, to.gy)
  if (!cameFrom.has(goal)) return []

  const path: GridPoint[] = []
  let cursor: string | null = goal
  while (cursor && cursor !== cellKey(from.gx, from.gy)) {
    path.push(parseCellKey(cursor))
    cursor = cameFrom.get(cursor) ?? null
  }
  return path.reverse()
}

/** A free cell to wander to, preferring somewhere that is not right here. */
export function pickWanderTarget(
  from: GridPoint,
  blocked: Set<string>,
  random: () => number,
  size = GRID_SIZE,
): GridPoint | null {
  const open: GridPoint[] = []
  for (let gx = 0; gx < size; gx += 1) {
    for (let gy = 0; gy < size; gy += 1) {
      if (blocked.has(cellKey(gx, gy))) continue
      if (gx === from.gx && gy === from.gy) continue
      // Stay a couple of tiles away, so the cat actually crosses the room.
      if (Math.abs(gx - from.gx) + Math.abs(gy - from.gy) < 2) continue
      open.push({ gx, gy })
    }
  }
  if (open.length === 0) return null
  return open[Math.floor(random() * open.length)] ?? null
}
