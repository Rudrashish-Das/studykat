/**
 * 2:1 isometric projection and depth sorting.
 *
 * Screen position of a tile, per §8:
 *   sx = (gx - gy) * TILE_W / 2
 *   sy = (gx + gy) * TILE_H / 2
 *
 * The origin is tile (0,0)'s top corner, so x runs negative for the left half
 * of the room; the renderer translates by ORIGIN_X to put it on screen.
 */

export const TILE_W = 64
export const TILE_H = 32
export const GRID_SIZE = 10

/** Half the diamond's width, so the leftmost tile lands at x = 0. */
export const ORIGIN_X = (GRID_SIZE * TILE_W) / 2
/** Room for the walls above the floor. */
export const ORIGIN_Y = 96

/** Overall size of the drawn room, walls included. */
export const ROOM_W = GRID_SIZE * TILE_W
export const ROOM_H = GRID_SIZE * TILE_H + ORIGIN_Y + 64

export interface Point {
  x: number
  y: number
}

export interface GridPoint {
  gx: number
  gy: number
}

/** Grid cell to the screen position of that cell's top corner. */
export function toScreen(gx: number, gy: number): Point {
  return {
    x: ORIGIN_X + (gx - gy) * (TILE_W / 2),
    y: ORIGIN_Y + (gx + gy) * (TILE_H / 2),
  }
}

/** Screen position to the fractional grid coordinate under it. */
export function toGridFractional(x: number, y: number): { gx: number; gy: number } {
  const dx = x - ORIGIN_X
  const dy = y - ORIGIN_Y
  return {
    gx: dy / TILE_H + dx / TILE_W,
    gy: dy / TILE_H - dx / TILE_W,
  }
}

/** Screen position to the grid cell under it. */
export function toGrid(x: number, y: number): GridPoint {
  const { gx, gy } = toGridFractional(x, y)
  return { gx: Math.floor(gx), gy: Math.floor(gy) }
}

export function isInsideGrid(gx: number, gy: number, size = GRID_SIZE): boolean {
  return gx >= 0 && gy >= 0 && gx < size && gy < size
}

export function clampToGrid(gx: number, gy: number, size = GRID_SIZE): GridPoint {
  return {
    gx: Math.min(Math.max(Math.round(gx), 0), size - 1),
    gy: Math.min(Math.max(Math.round(gy), 0), size - 1),
  }
}

/** The four screen-space corners of one tile, for drawing its diamond. */
export function tileDiamond(gx: number, gy: number): Point[] {
  const { x, y } = toScreen(gx, gy)
  return [
    { x, y },
    { x: x + TILE_W / 2, y: y + TILE_H / 2 },
    { x, y: y + TILE_H },
    { x: x - TILE_W / 2, y: y + TILE_H / 2 },
  ]
}

export function diamondPoints(gx: number, gy: number): string {
  return tileDiamond(gx, gy)
    .map((p) => `${p.x},${p.y}`)
    .join(' ')
}

/* ------------------------------------------------------------- footprints */

/**
 * Rotation cycles the footprint: 0 and 2 keep it, 1 and 3 swap width and
 * height. A 2x1 desk turned a quarter becomes 1x2.
 */
export function rotatedFootprint(
  w: number,
  h: number,
  rotation: number,
): { w: number; h: number } {
  return rotation % 2 === 0 ? { w, h } : { w: h, h: w }
}

/** Every cell an item occupies at a position. */
export function footprintCells(
  gx: number,
  gy: number,
  w: number,
  h: number,
  rotation = 0,
): GridPoint[] {
  const size = rotatedFootprint(w, h, rotation)
  const cells: GridPoint[] = []
  for (let dx = 0; dx < size.w; dx += 1) {
    for (let dy = 0; dy < size.h; dy += 1) {
      cells.push({ gx: gx + dx, gy: gy + dy })
    }
  }
  return cells
}

export function footprintFits(
  gx: number,
  gy: number,
  w: number,
  h: number,
  rotation = 0,
  size = GRID_SIZE,
): boolean {
  return footprintCells(gx, gy, w, h, rotation).every((c) => isInsideGrid(c.gx, c.gy, size))
}

export interface Placement {
  id: string
  gx: number
  gy: number
  w: number
  h: number
  rotation: number
}

/** Do two placements share any cell? */
export function placementsOverlap(a: Placement, b: Placement): boolean {
  const aSize = rotatedFootprint(a.w, a.h, a.rotation)
  const bSize = rotatedFootprint(b.w, b.h, b.rotation)
  return (
    a.gx < b.gx + bSize.w &&
    b.gx < a.gx + aSize.w &&
    a.gy < b.gy + bSize.h &&
    b.gy < a.gy + aSize.h
  )
}

/**
 * Can this placement go here? `ignoreId` lets a dragged item pass over its own
 * current cells.
 */
export function canPlace(
  candidate: Placement,
  existing: Placement[],
  options?: { ignoreId?: string; size?: number },
): boolean {
  if (!footprintFits(candidate.gx, candidate.gy, candidate.w, candidate.h, candidate.rotation, options?.size)) {
    return false
  }
  return !existing.some(
    (other) => other.id !== options?.ignoreId && placementsOverlap(candidate, other),
  )
}

/* ----------------------------------------------------------- depth sorting */

export interface Drawable {
  id: string
  gx: number
  gy: number
  /** Category layer: floor 0, rug 1, objects 2, wall-mounted 3. */
  layer: number
  zIndex: number
}

/**
 * Painter's order: farther tiles first, then layer, then z-index. Sorting by
 * (gx + gy) is what makes the cat walk behind a bookcase and in front of a rug
 * without any special-casing — the cat is just another drawable.
 *
 * Ties break on id so the order is stable across renders; an unstable sort
 * would make furniture flicker past each other while the cat moves.
 */
export function depthSort<T extends Drawable>(drawables: readonly T[]): T[] {
  return [...drawables].sort((a, b) => {
    const depthA = a.gx + a.gy
    const depthB = b.gx + b.gy
    if (depthA !== depthB) return depthA - depthB
    if (a.layer !== b.layer) return a.layer - b.layer
    if (a.zIndex !== b.zIndex) return a.zIndex - b.zIndex
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })
}

/**
 * The depth a multi-tile item should sort at: its far corner, so a 2x2 bed
 * occludes everything its whole footprint is in front of.
 */
export function depthOf(gx: number, gy: number, w = 1, h = 1, rotation = 0): number {
  const size = rotatedFootprint(w, h, rotation)
  return gx + size.w - 1 + (gy + size.h - 1)
}
