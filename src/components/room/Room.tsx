import { useCallback, useMemo, useState, type PointerEvent as ReactPointerEvent } from 'react'
import {
  GRID_SIZE,
  ROOM_H,
  ROOM_W,
  TILE_H,
  WALL_LAYER,
  depthOf,
  depthSort,
  diamondPoints,
  rotatedFootprint,
  toGrid,
  toScreen,
  wallSpotOf,
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
  /** Which way the cat is looking; it walks tail-first otherwise. */
  catFacing?: 'left' | 'right'
  /** Up on a piece of furniture rather than on the floor. */
  catPerch?: { itemId: string; lift: number } | null
  /** Hearts after a pat, or z's while asleep. */
  catEffect?: 'hearts' | 'zzz' | null
  /** Changes on every pat so the hearts replay. */
  catPats?: number
  /** The item the cat is playing with, and how it moves. */
  activeItem?: { id: string; motion: 'roll' | 'sway' | 'shake' | 'rustle' | null } | null
  /** Makes the cat a button. Home only: the editor needs clicks to reach the items. */
  onCatClick?: () => void
  catName?: string
  /** Outside the editor, tapping an object sends the cat to it. */
  onItemVisit?: (id: string) => void
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
  catFacing = 'left',
  catPerch = null,
  catEffect = null,
  catPats = 0,
  activeItem = null,
  onCatClick,
  catName = 'the cat',
  onItemVisit,
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
        // Wall items hang from the wall tile nearest where they were put, so
        // one saved out in the room is drawn on a wall, not in mid-air.
        gx: p.item.layer === WALL_LAYER ? wallSpotOf(p.grid_x, p.grid_y).gx : p.grid_x,
        gy: p.item.layer === WALL_LAYER ? wallSpotOf(p.grid_x, p.grid_y).gy : p.grid_y,
        layer: p.item.layer,
        zIndex: depthOf(p.grid_x, p.grid_y, p.item.footprint_w, p.item.footprint_h, p.rotation),
        placed: p,
      }),
    )
    // A perched cat sorts just after what it is sitting on.
    const seat = catPerch ? items.find((d) => d.id === catPerch.itemId) : undefined
    items.push({
      id: '__cat__',
      kind: 'cat',
      gx: seat ? seat.gx : catTile.gx,
      gy: seat ? seat.gy : catTile.gy,
      layer: 2,
      zIndex: seat ? seat.zIndex + 0.5 : 50,
    })
    return depthSort(items)
  }, [objects, catTile.gx, catTile.gy, catPerch])

  // Paint order becomes z-index, so the DOM order can stay put: reordering the
  // nodes on every step would cancel the cat's walking transition.
  const stacking = useMemo(
    () => new Map(drawables.map((d, index) => [d.id, index + 1])),
    [drawables],
  )
  const drawnAt = useMemo(() => new Map(drawables.map((d) => [d.id, d])), [drawables])

  /** Where the cat's feet go: its tile, or the middle of whatever it is on. */
  const catSpot = useMemo(() => {
    const seat = catPerch ? objects.find((p) => p.id === catPerch.itemId) : undefined
    if (!seat || !catPerch) return { ...toScreen(catTile.gx, catTile.gy), lift: 0 }
    const size = rotatedFootprint(seat.item.footprint_w, seat.item.footprint_h, seat.rotation)
    return {
      ...toScreen(seat.grid_x + size.w / 2 - 0.5, seat.grid_y + size.h / 2 - 0.5),
      lift: catPerch.lift,
    }
  }, [catPerch, catTile.gx, catTile.gy, objects])

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
      // Clip sideways: the object layer is laid out at ROOM_W and scaled down,
      // and Chrome can keep its unscaled width as page overflow (it does not
      // recompute it when the scale changes), which let phones scroll sideways.
      // The margin keeps furniture at the room's corners from being cut off.
      style={{ maxWidth: ROOM_W, perspective: '1200px', overflowX: 'clip', overflowClipMargin: 16 }}
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
              {objects.map((p) => {
                const drawn = drawnAt.get(p.id)!
                const screen = toScreen(drawn.gx, drawn.gy)
                const selected = selectedId === p.id
                const wall = wallSpotOf(p.grid_x, p.grid_y)
                // Outside the editor, a tap sends the cat over instead.
                const visitable = !interactive && Boolean(onItemVisit)
                const motion = activeItem?.id === p.id ? activeItem.motion : null
                const visit = () => onItemVisit?.(p.id)
                return (
                  <div
                    key={p.id}
                    className={cn(
                      'absolute',
                      interactive || visitable ? 'cursor-pointer' : 'pointer-events-none',
                      visitable && 'sc-room-thing',
                    )}
                    style={{ left: screen.x, top: screen.y, width: 0, height: 0, zIndex: stacking.get(p.id) }}
                    onPointerDown={(event) => {
                      if (!interactive) return
                      event.stopPropagation()
                      onItemClick?.(p.id)
                    }}
                    {...(visitable && {
                      role: 'button',
                      tabIndex: 0,
                      'aria-label': `Send ${catName} to the ${p.item.name.toLowerCase()}`,
                      onClick: visit,
                      onKeyDown: (event: React.KeyboardEvent) => {
                        if (event.key !== 'Enter' && event.key !== ' ') return
                        event.preventDefault()
                        visit()
                      },
                    })}
                  >
                    <svg
                      width="1"
                      height="1"
                      style={{ overflow: 'visible' }}
                      role={interactive ? 'button' : visitable ? undefined : 'img'}
                      aria-label={visitable ? undefined : p.item.name}
                      aria-hidden={visitable || undefined}
                      tabIndex={interactive ? 0 : -1}
                      className={selected ? 'sc-selected' : undefined}
                    >
                      <Furniture
                        artKey={p.item.art_key}
                        footprintW={p.item.footprint_w}
                        footprintH={p.item.footprint_h}
                        rotation={p.rotation}
                        wallSide={wall.side}
                        wallIndex={wall.index}
                        motionClass={motion ? `sc-item-${motion}` : undefined}
                      />
                    </svg>
                  </div>
                )
              })}

              <div
                className={cn(
                  'absolute',
                  !onCatClick && 'pointer-events-none',
                  // One tile per step, gliding rather than hopping.
                  'transition-[left,top] duration-[900ms] ease-linear',
                )}
                style={{
                  left: catSpot.x,
                  top: catSpot.y,
                  width: 0,
                  height: 0,
                  zIndex: stacking.get('__cat__'),
                }}
              >
                <div
                  className="absolute transition-transform duration-300 ease-out"
                  style={{
                    left: -CAT_WIDTH / 2,
                    top: CAT_TOP,
                    width: CAT_WIDTH,
                    transform: `translateY(${-catSpot.lift}px)`,
                  }}
                >
                  {onCatClick ? (
                    <button
                      type="button"
                      className="sc-cat-button block w-full text-ink"
                      onClick={onCatClick}
                      aria-label={`Pet ${catName}`}
                    >
                      <CatFigure appearance={cat} pose={catPose} facing={catFacing} animate={!reducedMotion} />
                    </button>
                  ) : (
                    <CatFigure appearance={cat} pose={catPose} facing={catFacing} animate={!reducedMotion} />
                  )}
                  <CatEffect effect={catEffect} pats={catPats} />
                </div>
              </div>

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
                      wallSide={wallSpotOf(ghost.gx, ghost.gy).side}
                      wallIndex={wallSpotOf(ghost.gx, ghost.gy).index}
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

function CatFigure({
  appearance,
  pose,
  facing,
  animate,
}: {
  appearance: CatAppearance
  pose: CatPose
  facing: 'left' | 'right'
  animate: boolean
}) {
  // The drawing has its tail on the right, so as drawn it is heading left; a
  // cat heading right is mirrored so the tail trails behind it.
  return (
    <div style={{ transform: facing === 'right' ? 'scaleX(-1)' : undefined }}>
      <Cat appearance={appearance} pose={pose} animate={animate} />
    </div>
  )
}

const HEARTS = [
  { x: 6, y: 20, delay: 0 },
  { x: 20, y: 12, delay: 0.25 },
  { x: 34, y: 20, delay: 0.5 },
]

/** Hearts rising from a petted cat, or slow z's from a sleeping one. */
function CatEffect({ effect, pats }: { effect: 'hearts' | 'zzz' | null; pats: number }) {
  if (effect === 'zzz') {
    return (
      <svg
        aria-hidden
        className="pointer-events-none absolute overflow-visible"
        style={{ left: '64%', top: 0 }}
        width="30"
        height="30"
        viewBox="0 0 30 30"
      >
        {[0, 1].map((i) => (
          <text
            key={i}
            x={4 + i * 10}
            y={24 - i * 8}
            className="sc-cat-zzz"
            style={{
              animationDelay: `${i * 1.6}s`,
              font: '700 12px ui-rounded, system-ui, sans-serif',
              transformBox: 'fill-box',
              transformOrigin: 'center',
            }}
            fill={OUTLINE}
            fillOpacity="0.7"
          >
            z
          </text>
        ))}
      </svg>
    )
  }
  if (effect !== 'hearts') return null
  return (
    // Keyed by the pat count, so each pat plays the hearts from the start.
    <svg
      key={pats}
      aria-hidden
      className="pointer-events-none absolute overflow-visible"
      style={{ left: '20%', top: -8 }}
      width="40"
      height="30"
      viewBox="0 0 40 30"
    >
      {HEARTS.map((h) => (
        <path
          key={h.x}
          className="sc-cat-heart"
          style={{
            animationDelay: `${h.delay}s`,
            opacity: 0,
            transformBox: 'fill-box',
            transformOrigin: 'center',
          }}
          d={`M${h.x} ${h.y} c -4 -3 -7 -6 -4 -9 c 2 -2 4 -1 4 1 c 0 -2 2 -3 4 -1 c 3 3 0 6 -4 9 z`}
          fill="#d9a5a0"
          stroke={OUTLINE}
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
      ))}
    </svg>
  )
}

/** The cat's drawn width in room pixels; its SVG is 120 x 124. */
const CAT_WIDTH = 68
/**
 * Stand the cat in the middle of its tile: its contact shadow (y = 112 in the
 * SVG) goes half a tile below the tile's top corner. Anchoring it at the corner
 * put its feet on the wall line, so along either wall the cat stood on the
 * skirting.
 */
const CAT_TOP = TILE_H / 2 - (112 * CAT_WIDTH) / 120

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

