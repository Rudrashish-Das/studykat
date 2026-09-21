import { useCallback, useMemo, useState, type PointerEvent as ReactPointerEvent } from 'react'
import {
  GRID_SIZE,
  ROOM_H,
  ROOM_W,
  depthOf,
  depthSort,
  diamondPoints,
  toGrid,
  toScreen,
  type Drawable,
} from '@/lib/iso/projection'
import { Cat, type CatPose } from '@/components/cat/Cat'
import type { CatAppearance } from '@/lib/cat/appearance'
import { Furniture } from './Furniture'
import { MATERIALS, OUTLINE, WALL_WASHES, materialFor, parseArtKey } from './materials'
import type { CatalogItem, RoomLayoutRow } from '@/lib/supabase/types'
import { cn } from '@/lib/cn'
import { useElementWidth, usePrefersReducedMotion } from '@/lib/useReducedMotion'

export interface PlacedItem extends RoomLayoutRow {
  item: CatalogItem
}

export interface RoomProps {
  placed: PlacedItem[]
  cat: CatAppearance
  catPose: CatPose
  catTile: { gx: number; gy: number }
  /** 0 (noon) to 1 (deep night); drives the tint overlay. */
  nightness?: number
  className?: string
  /* Editor affordances — all optional, so the Home screen stays read-only. */
  interactive?: boolean
  selectedId?: string | null
  ghost?: { artKey: string; gx: number; gy: number; w: number; h: number; rotation: number; valid: boolean } | null
  onTileClick?: (gx: number, gy: number) => void
  onItemClick?: (id: string) => void
  onHoverTile?: (tile: { gx: number; gy: number } | null) => void
}

/**
 * The isometric room.
 *
 * Rendering is absolutely-positioned DOM nodes, each holding an inline SVG,
 * inside one transformed container — not a canvas. At ten by ten tiles that
 * stays debuggable, crisp at any zoom, recolourable per user, and reachable by
 * assistive tech, and the depth ordering is just DOM order.
 */
export function Room({
  placed,
  cat,
  catPose,
  catTile,
  nightness = 0,
  className,
  interactive = false,
  selectedId = null,
  ghost = null,
  onTileClick,
  onItemClick,
  onHoverTile,
}: RoomProps) {
  const reducedMotion = usePrefersReducedMotion()
  // The room is laid out in fixed room pixels and scaled to the width it got,
  // so none of the isometric geometry has to know about the viewport.
  const [stageRef, stageWidth] = useElementWidth<HTMLDivElement>()
  const scale = stageWidth > 0 ? stageWidth / ROOM_W : 1
  const [hover, setHover] = useState<{ gx: number; gy: number } | null>(null)
  const [tilt, setTilt] = useState({ x: 0, y: 0 })

  // Room-wide surfaces are placements too, but they are not objects: the
  // renderer reads whichever the user owns and ignores its grid cell.
  const surfaces = useMemo(() => {
    const find = (category: string) =>
      placed.find((p) => p.item.category === category)?.item ?? null
    return {
      floor: find('floor'),
      wall: find('wall'),
      wash: find('wallcolor'),
    }
  }, [placed])

  const objects = useMemo(
    () => placed.filter((p) => !['floor', 'wall', 'wallcolor'].includes(p.item.category)),
    [placed],
  )

  /** The cat is a drawable like any other, which is what makes it sort right. */
  const drawables = useMemo(() => {
    const items: (Drawable & { kind: 'item' | 'cat'; placed?: PlacedItem })[] = objects.map(
      (p) => ({
        id: p.id,
        kind: 'item' as const,
        gx: p.grid_x,
        gy: p.grid_y,
        layer: p.item.layer,
        zIndex: depthOf(p.grid_x, p.grid_y, p.item.footprint_w, p.item.footprint_h, p.rotation),
        placed: p,
      }),
    )
    items.push({
      id: '__cat__',
      kind: 'cat',
      gx: catTile.gx,
      gy: catTile.gy,
      layer: 2,
      zIndex: 50,
    })
    return depthSort(items)
  }, [objects, catTile.gx, catTile.gy])

  const pointerToTile = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
    const stage = stageRef.current
    if (!stage) return null
    const rect = stage.getBoundingClientRect()
    const ratio = rect.width / ROOM_W
    const x = (event.clientX - rect.left) / ratio
    const y = (event.clientY - rect.top) / ratio
    const tile = toGrid(x, y)
      return tile.gx >= 0 && tile.gy >= 0 && tile.gx < GRID_SIZE && tile.gy < GRID_SIZE
        ? tile
        : null
    },
    [stageRef],
  )

  const handleMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (interactive) {
        const tile = pointerToTile(event)
        setHover(tile)
        onHoverTile?.(tile)
      }
      if (!reducedMotion) {
        // §8: the room leans about two degrees toward the cursor.
        const rect = event.currentTarget.getBoundingClientRect()
        const px = (event.clientX - rect.left) / rect.width - 0.5
        const py = (event.clientY - rect.top) / rect.height - 0.5
        setTilt({ x: -py * 2, y: px * 2 })
      }
    },
    [interactive, onHoverTile, pointerToTile, reducedMotion],
  )

  const handleLeave = useCallback(() => {
    setHover(null)
    onHoverTile?.(null)
    setTilt({ x: 0, y: 0 })
  }, [onHoverTile])

  const floorMat = materialFor(surfaces.floor ? parseArtKey(surfaces.floor.art_key).material : 'pine')
  const wallMat = materialFor(surfaces.wall ? parseArtKey(surfaces.wall.art_key).material : 'plaster')
  const wash = surfaces.wash ? WALL_WASHES[parseArtKey(surfaces.wash.art_key).material] : undefined

  return (
    <div
      className={cn('relative mx-auto w-full', className)}
      style={{ maxWidth: ROOM_W, perspective: '1200px' }}
      onPointerMove={handleMove}
      onPointerLeave={handleLeave}
    >
      <div
        ref={stageRef}
        className="relative w-full transition-transform duration-500 ease-cozy"
        style={{
          aspectRatio: `${ROOM_W} / ${ROOM_H}`,
          transform: `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`,
          transformStyle: 'preserve-3d',
        }}
        onPointerDown={(event) => {
          if (!interactive) return
          const tile = pointerToTile(event)
          if (tile) onTileClick?.(tile.gx, tile.gy)
        }}
      >
        {/* Floor and walls: one SVG, since they never reorder. */}
        <svg
          viewBox={`0 0 ${ROOM_W} ${ROOM_H}`}
          className="absolute inset-0 h-full w-full"
          aria-hidden
        >
          <Walls mat={wallMat} wash={wash} />
          <Floor mat={floorMat} />
          {interactive && hover && (
            <polygon
              points={diamondPoints(hover.gx, hover.gy)}
              fill={MATERIALS.cream!.top}
              fillOpacity="0.35"
              stroke={OUTLINE}
              strokeWidth="2"
              strokeOpacity="0.5"
            />
          )}
        </svg>

        {/* Every object, in painter's order. */}
        <div className="absolute inset-0 overflow-visible">
          <div
            className="absolute left-0 top-0 origin-top-left"
            style={{ width: ROOM_W, height: ROOM_H, transform: `scale(${scale})` }}
          >
              {drawables.map((drawable) => {
                const screen = toScreen(drawable.gx, drawable.gy)
                if (drawable.kind === 'cat') {
                  return (
                    <div
                      key="cat"
                      className="pointer-events-none absolute"
                      style={{ left: screen.x, top: screen.y, width: 0, height: 0 }}
                    >
                      <div
                        className="absolute"
                        style={{ left: -34, top: -74, width: 68 }}
                      >
                        <Cat appearance={cat} pose={catPose} animate={!reducedMotion} />
                      </div>
                    </div>
                  )
                }

                const p = drawable.placed!
                const selected = selectedId === p.id
                return (
                  <div
                    key={p.id}
                    className={cn('absolute', interactive ? 'cursor-pointer' : 'pointer-events-none')}
                    style={{ left: screen.x, top: screen.y, width: 0, height: 0 }}
                    onPointerDown={(event) => {
                      if (!interactive) return
                      event.stopPropagation()
                      onItemClick?.(p.id)
                    }}
                  >
                    <svg
                      width="1"
                      height="1"
                      style={{ overflow: 'visible' }}
                      role={interactive ? 'button' : 'img'}
                      aria-label={p.item.name}
                      tabIndex={interactive ? 0 : -1}
                      className={selected ? 'sc-selected' : undefined}
                    >
                      <Furniture
                        artKey={p.item.art_key}
                        footprintW={p.item.footprint_w}
                        footprintH={p.item.footprint_h}
                        rotation={p.rotation}
                      />
                    </svg>
                  </div>
                )
              })}

              {/* The drag preview sits above everything: it is UI, not scenery. */}
              {ghost && (
                <div
                  className="pointer-events-none absolute"
                  style={{ ...positionOf(ghost.gx, ghost.gy), width: 0, height: 0, zIndex: 999 }}
                >
                  <svg width="1" height="1" style={{ overflow: 'visible' }} aria-hidden>
                    <Furniture
                      artKey={ghost.artKey}
                      footprintW={ghost.w}
                      footprintH={ghost.h}
                      rotation={ghost.rotation}
                      ghost={ghost.valid ? 'valid' : 'invalid'}
                      shadow={false}
                    />
                  </svg>
                </div>
              )}
          </div>
        </div>

        {/* Day/night tint. Cool and low-contrast, never a black overlay. */}
        {nightness > 0 && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 transition-opacity duration-1000 ease-cozy"
            style={{
              background: 'linear-gradient(180deg, #2b2430 0%, #3b3446 100%)',
              opacity: Math.min(nightness, 1) * 0.34,
              mixBlendMode: 'multiply',
            }}
          />
        )}
      </div>
    </div>
  )
}

function positionOf(gx: number, gy: number) {
  const { x, y } = toScreen(gx, gy)
  return { left: x, top: y }
}

function Floor({ mat }: { mat: ReturnType<typeof materialFor> }) {
  const tiles: React.ReactNode[] = []
  for (let gx = 0; gx < GRID_SIZE; gx += 1) {
    for (let gy = 0; gy < GRID_SIZE; gy += 1) {
      // A faint checker so the grid reads without drawing gridlines.
      const alt = (gx + gy) % 2 === 0
      tiles.push(
        <polygon
          key={`${gx}-${gy}`}
          points={diamondPoints(gx, gy)}
          fill={alt ? mat.top : mat.left}
          stroke={mat.right}
          strokeWidth="0.5"
          strokeOpacity="0.35"
        />,
      )
    }
  }

  const far = toScreen(0, 0)
  const right = toScreen(GRID_SIZE, 0)
  const near = toScreen(GRID_SIZE, GRID_SIZE)
  const left = toScreen(0, GRID_SIZE)

  return (
    <g>
      {tiles}
      {/* One outline around the whole floor rather than per tile. */}
      <polygon
        points={`${far.x},${far.y} ${right.x},${right.y} ${near.x},${near.y} ${left.x},${left.y}`}
        fill="none"
        stroke={OUTLINE}
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </g>
  )
}

const WALL_HEIGHT = 96

function Walls({
  mat,
  wash,
}: {
  mat: ReturnType<typeof materialFor>
  wash: { left: string; right: string } | undefined
}) {
  const far = toScreen(0, 0)
  const right = toScreen(GRID_SIZE, 0)
  const left = toScreen(0, GRID_SIZE)

  const leftWall = [
    { x: far.x, y: far.y },
    { x: left.x, y: left.y },
    { x: left.x, y: left.y - WALL_HEIGHT },
    { x: far.x, y: far.y - WALL_HEIGHT },
  ]
  const rightWall = [
    { x: far.x, y: far.y },
    { x: right.x, y: right.y },
    { x: right.x, y: right.y - WALL_HEIGHT },
    { x: far.x, y: far.y - WALL_HEIGHT },
  ]
  const pts = (p: { x: number; y: number }[]) => p.map((q) => `${q.x},${q.y}`).join(' ')

  return (
    <g stroke={OUTLINE} strokeWidth="2" strokeLinejoin="round">
      <polygon points={pts(leftWall)} fill={wash?.left ?? mat.left} />
      <polygon points={pts(rightWall)} fill={wash?.right ?? mat.right} />
      {/* Skirting, so the wall meets the floor rather than just stopping. */}
      <polygon
        points={pts([
          { x: far.x, y: far.y },
          { x: left.x, y: left.y },
          { x: left.x, y: left.y - 8 },
          { x: far.x, y: far.y - 8 },
        ])}
        fill={mat.accent}
        strokeWidth="1"
      />
      <polygon
        points={pts([
          { x: far.x, y: far.y },
          { x: right.x, y: right.y },
          { x: right.x, y: right.y - 8 },
          { x: far.x, y: far.y - 8 },
        ])}
        fill={mat.accent}
        strokeWidth="1"
      />
    </g>
  )
}

