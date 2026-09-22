import { memo, type ReactNode } from 'react'
import { GRID_SIZE, TILE_H, TILE_W, rotatedFootprint, type WallSide } from '@/lib/iso/projection'
import { MATERIALS, OUTLINE, WALL_WASHES, materialFor, parseArtKey, type Material } from './materials'

/**
 * Every piece of furniture in the game.
 *
 * Each shape is drawn in local coordinates where (0,0) is the top corner of the
 * item's origin tile, +x runs down-right and +y runs down-left, exactly like
 * the floor. `Box` does the isometric geometry once; a shape is then a stack of
 * boxes plus whatever detail it needs, and the material table does the shading.
 * That is how 53 catalog items exist without 53 sprites.
 */

const HX = TILE_W / 2 // 32 — half a tile across
const HY = TILE_H / 2 // 16 — half a tile down

interface Pt {
  x: number
  y: number
}

/** The four floor-level corners of a w x h footprint. */
function footprintCorners(w: number, h: number): { t: Pt; r: Pt; b: Pt; l: Pt } {
  return {
    t: { x: 0, y: 0 },
    r: { x: w * HX, y: w * HY },
    b: { x: (w - h) * HX, y: (w + h) * HY },
    l: { x: -h * HX, y: h * HY },
  }
}

const poly = (pts: Pt[]) => pts.map((p) => `${p.x},${p.y}`).join(' ')

/** Corner softening, in pixels. Big enough to read, small enough to keep the
 *  isometric angles honest. */
const CORNER = 3.5

/** A point `d` along the line from `from` toward `to`, never past the middle. */
function towards(from: Pt, to: Pt, d: number): Pt {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const len = Math.hypot(dx, dy) || 1
  const step = Math.min(d, len / 2)
  return { x: from.x + (dx / len) * step, y: from.y + (dy / len) * step }
}

/**
 * The same closed shape as `poly`, but with its corners rounded off — every
 * vertex becomes a short quadratic curve between the two edges that meet there.
 *
 * Squared-off corners on every face is what made the set read as blocks rather
 * than furniture; §8 asks for soft edges, and one helper gives all 50-odd
 * shapes the same softness without any of them knowing about it.
 */
function rounded(pts: Pt[], r: number = CORNER): string {
  if (pts.length < 3) return `M${poly(pts).replace(/ /g, 'L')}`
  const d: string[] = []
  pts.forEach((cur, i) => {
    const prev = pts[(i - 1 + pts.length) % pts.length]!
    const next = pts[(i + 1) % pts.length]!
    const from = towards(cur, prev, r)
    const to = towards(cur, next, r)
    d.push(`${i === 0 ? 'M' : 'L'}${from.x},${from.y}`, `Q${cur.x},${cur.y} ${to.x},${to.y}`)
  })
  return `${d.join(' ')} Z`
}

/**
 * An isometric box: one top face and two visible sides. `z` is its height in
 * pixels; `lift` raises the whole box off the floor (for things stacked on
 * other things).
 */
function Box({
  w = 1,
  h = 1,
  z,
  lift = 0,
  mat,
  inset = 0,
  insetW,
  insetH,
  opacity,
}: {
  w?: number
  h?: number
  z: number
  lift?: number
  mat: Material
  /** Shrinks the footprint, for a tabletop narrower than its tile. */
  inset?: number
  /**
   * Shrink one axis more than the other. A single `inset` can only ever make a
   * smaller square, so anything slab-shaped — a chair back, a headboard — comes
   * out as a post without these.
   */
  insetW?: number
  insetH?: number
  opacity?: number
}) {
  const scaleW = Math.max(0.05, w - (insetW ?? inset))
  const scaleH = Math.max(0.05, h - (insetH ?? inset))
  const c = footprintCorners(scaleW, scaleH)
  // Centre the inset shape on the original footprint.
  const dx = ((w - scaleW) * HX - (h - scaleH) * HX) / 2
  const dy = ((w - scaleW) * HY + (h - scaleH) * HY) / 2

  const shift = (p: Pt, up: number): Pt => ({ x: p.x + dx, y: p.y + dy - up })
  const top = z + lift
  const base = lift

  return (
    <g opacity={opacity}>
      {/* Left face — mid tone */}
      <path
        d={rounded([shift(c.l, top), shift(c.b, top), shift(c.b, base), shift(c.l, base)])}
        fill={mat.left}
      />
      {/* Right face — darkest */}
      <path
        d={rounded([shift(c.b, top), shift(c.r, top), shift(c.r, base), shift(c.b, base)])}
        fill={mat.right}
      />
      {/* Top face — lightest */}
      <path
        d={rounded([shift(c.t, top), shift(c.r, top), shift(c.b, top), shift(c.l, top)])}
        fill={mat.top}
      />
    </g>
  )
}

/** A flat shape lying on the floor: rugs and floor decals. */
function FlatDiamond({ w, h, fill, opacity }: { w: number; h: number; fill: string; opacity?: number }) {
  const c = footprintCorners(w, h)
  return <path d={rounded([c.t, c.r, c.b, c.l], 6)} fill={fill} opacity={opacity} />
}

/** The soft contact shadow every object gets, per the recipe. */
function ContactShadow({ w, h }: { w: number; h: number }) {
  const c = footprintCorners(w, h)
  const cx = (c.t.x + c.b.x) / 2
  const cy = (c.t.y + c.b.y) / 2
  return (
    <ellipse
      cx={cx + 4}
      cy={cy + 3}
      rx={Math.max(w, h) * 26}
      ry={Math.max(w, h) * 12}
      fill={OUTLINE}
      opacity="0.13"
      stroke="none"
    />
  )
}

/**
 * Lays its children flat onto a back wall. Wall shapes are drawn face-on, x
 * across and y up, with (0,0) where the wall meets the floor under the item;
 * the shear puts them in the wall's plane. The right-hand wall recedes half a
 * pixel down for every pixel across, the left one half a pixel up.
 */
function OnWall({ side, children }: { side: WallSide; children: ReactNode }) {
  return <g transform={`matrix(1 ${side === 'left' ? -0.5 : 0.5} 0 1 0 0)`}>{children}</g>
}

/** A rectangle hung on a wall — a poster, a frame — its top `lift` px up. */
function WallPanel({
  side,
  width,
  height,
  lift,
  fill,
  accent,
}: {
  side: WallSide
  width: number
  height: number
  lift: number
  fill: string
  accent?: string
}) {
  const quad = (x0: number, y0: number, x1: number, y1: number): Pt[] => [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ]
  const x0 = -width / 2
  const y0 = -lift
  return (
    <OnWall side={side}>
      <path d={rounded(quad(x0, y0, x0 + width, y0 + height))} fill={fill} />
      {accent && (
        <path
          d={rounded(quad(x0 + 5, y0 + 5, x0 + width - 5, y0 + height - 5))}
          fill={accent}
          strokeWidth="1.4"
        />
      )}
    </OnWall>
  )
}

/**
 * A box standing out from a wall — a shelf, a planter — `along` tiles long and
 * `depth` tiles deep, centred on the wall anchor, its underside `lift` px up.
 *
 * For the left wall it is rebuilt with its axes swapped rather than mirrored,
 * so the light still falls the same way it does on everything else.
 */
function WallBox({
  side,
  along,
  depth,
  z,
  lift,
  mat,
}: {
  side: WallSide
  along: number
  depth: number
  z: number
  lift: number
  mat: Material
}) {
  // The box's top corner sits on the wall, half its length back from the anchor.
  const backX = side === 'right' ? (-along / 2) * HX : (along / 2) * HX
  const backY = (-along / 2) * HY
  const [w, h] = side === 'right' ? [along, depth] : [depth, along]
  return (
    <g transform={`translate(${backX}, ${backY})`}>
      <Box w={w} h={h} z={z} lift={lift} mat={mat} />
    </g>
  )
}

/** The middle of a WallBox's top face, relative to the wall anchor. */
function wallBoxTop(side: WallSide, depth: number, top: number): Pt {
  // Half the depth out from the wall, toward the viewer: down-left off the
  // right-hand wall, down-right off the left one.
  return { x: (side === 'right' ? -1 : 1) * (depth / 2) * HX, y: (depth / 2) * HY - top }
}

/**
 * How far each wall shape reaches either side of its anchor, in screen pixels
 * across. Being in this table is what makes a shape wall-mounted. A wide piece
 * near either end of a wall is slid along it until it fits, rather than
 * hanging off the room's corner into thin air.
 */
const WALL_REACH: Record<string, number> = {
  poster: 20,
  frame: 21,
  starmap: 26,
  clock: 15,
  trophyshelf: 18,
  fairylights: 50,
  windowbox: 22,
}

/**
 * Two wall faces meeting at a corner, with skirting — the same construction
 * `Walls` uses in the room, at swatch size.
 */
function WallSwatch({ left, right, skirting }: { left: string; right: string; skirting: string }) {
  const H = 62
  const c = footprintCorners(2, 2)
  const up = (p: Pt, by: number): Pt => ({ x: p.x, y: p.y - by })

  return (
    <g>
      <path d={rounded([c.t, c.l, up(c.l, H), up(c.t, H)])} fill={left} />
      <path d={rounded([c.t, c.r, up(c.r, H), up(c.t, H)])} fill={right} />
      <path d={rounded([c.t, c.l, up(c.l, 8), up(c.t, 8)], 2)} fill={skirting} strokeWidth="1" />
      <path d={rounded([c.t, c.r, up(c.r, 8), up(c.t, 8)], 2)} fill={skirting} strokeWidth="1" />
    </g>
  )
}

/**
 * Maps a point on a box's front face into world coordinates: `u` runs across
 * the face from 0 to 1, `v` upward in pixels.
 *
 * "Front" is whichever of the two visible faces is wider, because that is the
 * one a piece is built to show: a 1x2 bookcase is deep and narrow, so its books
 * belong on the long right-hand face, not squeezed onto the short left one.
 *
 * Panelled fronts — shelves, wardrobe doors — are the whole difference between
 * a carcass and a crate, and they all have to sit in that one plane.
 */
function frontFace(w: number, h: number, insetW: number, insetH: number) {
  const scaleW = w - insetW
  const scaleH = h - insetH
  const dx = ((w - scaleW) * HX - (h - scaleH) * HX) / 2
  const dy = ((w - scaleW) * HY + (h - scaleH) * HY) / 2

  // Left face runs from the l corner along +x; right face from b toward r.
  const wide = scaleW >= scaleH
  const origin = wide
    ? { x: -scaleH * HX + dx, y: scaleH * HY + dy }
    : { x: (scaleW - scaleH) * HX + dx, y: (scaleW + scaleH) * HY + dy }
  const step = wide
    ? { x: scaleW * HX, y: scaleW * HY }
    : { x: scaleH * HX, y: -scaleH * HY }

  return (u: number, v: number): Pt => ({
    x: origin.x + u * step.x,
    y: origin.y + u * step.y - v,
  })
}

/** A rounded quad on a face, given two corners in (u, v) face coordinates. */
function facePanel(
  f: (u: number, v: number) => Pt,
  u0: number,
  v0: number,
  u1: number,
  v1: number,
  fill: string,
  r = 2,
  strokeWidth = 1.2,
) {
  return (
    <path d={rounded([f(u0, v0), f(u1, v0), f(u1, v1), f(u0, v1)], r)} fill={fill} strokeWidth={strokeWidth} />
  )
}

/**
 * Shapes that cast no contact shadow: the ones hung on a wall, which never
 * touch the floor, and the floor itself.
 *
 * A phantom ellipse under a poster was always wrong, but it only became loud
 * in the shop, where the frame is fitted to what was actually drawn — the
 * shadow was then the largest thing in the picture, and it pushed the item it
 * was supposedly grounding up into a corner of the tile.
 */
const NO_SHADOW_SHAPES = new Set([
  'poster',
  'frame',
  'starmap',
  'clock',
  'trophyshelf',
  'fairylights',
  'windowbox',
  'wall',
  'wallcolor',
  'floor',
])

/* ------------------------------------------------------------- the shapes */

/** The three greens every plant shares, so five species still look like one set. */
const LEAF = { light: '#c3d0b9', mid: '#a7b89b', dark: '#84957a' }

/** The pot under every plant — the part that *should* be the same each time. */
function Pot({ mat, z, inset }: { mat: Material; z: number; inset: number }) {
  return <Box z={z} mat={mat} inset={inset} />
}

interface ShapeProps {
  w: number
  h: number
  mat: Material
  material: string
  /** Which back wall a wall-mounted shape hangs on; floor shapes ignore it. */
  side: WallSide
}

const SHAPES: Record<string, (p: ShapeProps) => ReactNode> = {
  'box-low': ({ mat }) => <Box z={16} mat={mat} inset={0.15} />,

  table: ({ mat }) => (
    <>
      <Box z={22} mat={mat} inset={0.62} />
      <Box z={5} lift={22} mat={mat} inset={0.1} />
    </>
  ),

  chair: ({ mat }) => (
    <>
      <Box z={18} mat={mat} inset={0.35} />
      {/* The back is a slab set against one edge. A symmetric inset can only
          make a post in the middle of the seat, which is what this was. */}
      <g transform={`translate(${-HX * 0.24}, ${-HY * 0.24})`}>
        <Box z={26} lift={18} mat={mat} insetW={0.82} insetH={0.42} />
      </g>
    </>
  ),

  desk: ({ w, h, mat }) => (
    <>
      <Box w={w} h={h} z={26} mat={mat} inset={0.5} />
      <Box w={w} h={h} z={5} lift={26} mat={mat} inset={0.08} />
      {/* An open book, so a desk reads as a desk and not a table. */}
      <g transform={`translate(${w * HX * 0.5}, ${w * HY * 0.5 - 32})`}>
        <polygon points="-12,0 0,-6 12,0 0,6" fill={mat.accent} />
        <line x1="0" y1="-6" x2="0" y2="6" strokeWidth="1.2" />
      </g>
    </>
  ),

  armchair: ({ mat }) => (
    <>
      <Box z={14} mat={mat} inset={0.2} />
      <Box z={10} lift={14} mat={{ ...mat, top: mat.accent }} inset={0.45} />
      {/* Back slab at one edge... */}
      <g transform={`translate(${-HX * 0.3}, ${-HY * 0.3})`}>
        <Box z={30} lift={14} mat={mat} insetW={0.8} insetH={0.24} />
      </g>
      {/* ...and an arm down each side, which is the whole difference between
          this and `chair`. Both need an asymmetric inset to come out as slabs. */}
      {[-0.28, 0.28].map((d) => (
        <g key={d} transform={`translate(${-d * HX}, ${d * HY})`}>
          <Box z={13} lift={14} mat={mat} insetW={0.26} insetH={0.8} />
        </g>
      ))}
    </>
  ),

  sofa: ({ w, h, mat }) => {
    // A back along the long side and an arm at each end. Three stacked slabs of
    // decreasing size — which is what this was — reads as a staircase.
    const armW = 0.34
    const armAt = (w - armW) / 2
    const backAt = (h - 0.26) / 2
    return (
      <>
        <Box w={w} h={h} z={11} mat={mat} inset={0.22} />
        {/* Two seat cushions */}
        {[-1, 1].map((s) => (
          <g key={s} transform={`translate(${((s * (w - armW * 2)) / 4) * HX}, ${((s * (w - armW * 2)) / 4) * HY})`}>
            <Box
              w={w}
              h={h}
              z={9}
              lift={11}
              mat={{ ...mat, top: mat.accent }}
              insetW={w - (w - armW * 2) / 2 + 0.14}
              insetH={h - 0.46}
            />
          </g>
        ))}
        {/* Back, set against the far long edge */}
        <g transform={`translate(${backAt * HX}, ${-backAt * HY})`}>
          <Box w={w} h={h} z={28} lift={11} mat={mat} insetW={w - (w - 0.16)} insetH={h - 0.26} />
        </g>
        {/* An arm at each end */}
        {[-1, 1].map((s) => (
          <g key={s} transform={`translate(${s * armAt * HX}, ${s * armAt * HY})`}>
            <Box w={w} h={h} z={18} lift={11} mat={mat} insetW={w - armW} insetH={h - 0.82} />
          </g>
        ))}
      </>
    )
  },

  bed: ({ w, h, mat }) => {
    const linen = { top: '#fffaf2', left: '#f0e2cd', right: '#dccbb0', accent: mat.accent }
    /** Shift a part `alongX` down-right and `towardHead` up-right. */
    const at = (alongX: number, towardHead: number) =>
      `translate(${(alongX + towardHead) * HX}, ${(alongX - towardHead) * HY})`
    return (
      <>
        {/* Frame, then mattress, then a duvet that stops short of the pillows.
            Without the turn-down this was a slab with a white brick on it. */}
        <Box w={w} h={h} z={13} mat={mat} inset={0.18} />
        <Box w={w} h={h} z={8} lift={13} mat={linen} inset={0.3} />
        <g transform={at(0, -0.34)}>
          <Box
            w={w}
            h={h}
            z={7}
            lift={21}
            mat={{ ...mat, top: mat.accent, left: mat.accent }}
            insetW={0.38}
            insetH={h - (h - 0.3) * 0.6}
          />
        </g>
        {/* Two pillows at the head */}
        {[-1, 1].map((side) => (
          <g key={side} transform={at(side * 0.42, 0.56)}>
            <Box w={w} h={h} z={7} lift={21} mat={linen} insetW={w - 0.62} insetH={h - 0.42} />
          </g>
        ))}
        {/* Headboard */}
        <g transform={at(0, (h - 0.2) / 2)}>
          <Box w={w} h={h} z={34} mat={mat} insetW={0.18} insetH={h - 0.2} />
        </g>
      </>
    )
  },

  bookcase: ({ w, h, mat }) => {
    const Z = 66
    const f = frontFace(w, h, 0.25, 0.25)
    const shelves = [7, 24, 41, 58]
    // Deterministic so a bookcase looks the same every time it is drawn.
    const spines = [
      { u: 0.2, w: 0.08, h: 12, c: mat.accent },
      { u: 0.3, w: 0.06, h: 14, c: mat.top },
      { u: 0.38, w: 0.09, h: 11, c: mat.accent },
      { u: 0.56, w: 0.07, h: 13, c: mat.top },
      { u: 0.65, w: 0.08, h: 10, c: mat.accent },
    ]
    return (
      <>
        <Box w={w} h={h} z={Z} mat={mat} inset={0.25} />
        {/* An open front: a recess, real shelves, and books standing on them.
            Three lines ruled across the side read as scratches, not shelves. */}
        {facePanel(f, 0.1, 5, 0.9, Z - 5, mat.right, 2)}
        {shelves.map((v) => facePanel(f, 0.1, v, 0.9, v + 3.5, mat.left, 1, 1))}
        {spines.map((b, i) => (
          <g key={b.u}>
            {facePanel(f, b.u, shelves[i % 3]! + 3.5, b.u + b.w, shelves[i % 3]! + 3.5 + b.h, b.c, 1, 1)}
          </g>
        ))}
      </>
    )
  },

  wardrobe: ({ w, h, mat }) => {
    const Z = 78
    const f = frontFace(w, h, 0.2, 0.2)
    const knob = (u: number) => {
      const p = f(u, 40)
      return <circle key={u} cx={p.x} cy={p.y} r="2.8" fill={mat.accent} strokeWidth="1.2" />
    }
    return (
      <>
        <Box w={w} h={h} z={Z} mat={mat} inset={0.2} />
        {/* Two doors and a plinth. A bare box with one dot on it was a crate. */}
        {facePanel(f, 0.09, 12, 0.48, Z - 6, mat.left, 2)}
        {facePanel(f, 0.52, 12, 0.91, Z - 6, mat.left, 2)}
        {facePanel(f, 0.05, 0, 0.95, 8, mat.right, 1, 1)}
        {[0.43, 0.57].map(knob)}
      </>
    )
  },

  tallbox: ({ mat }) => <Box z={54} mat={mat} inset={0.45} />,

  grandfather: ({ mat }) => (
    <>
      <Box z={74} mat={mat} inset={0.52} />
      {/* Face and pendulum, on the left-facing side. Without them this is the
          plain `tallbox` it used to share with the scratching post. */}
      <g transform={`translate(${-HX * 0.24}, ${HY * 0.24 - 60})`}>
        <circle cx="0" cy="0" r="9" fill={mat.accent} strokeWidth="1.4" />
        <path d="M0 0 L0 -5 M0 0 L4 2" strokeWidth="1.4" fill="none" />
      </g>
      <g transform={`translate(${-HX * 0.24}, ${HY * 0.24 - 30})`}>
        <rect x="-5.5" y="-13" width="11" height="26" rx="2" fill={mat.accent} opacity="0.45" strokeWidth="1.2" />
        <circle cx="0" cy="7" r="4" fill={mat.accent} strokeWidth="1.2" />
      </g>
    </>
  ),

  piano: ({ w, h, mat }) => (
    <>
      <Box w={w} h={h} z={44} mat={mat} inset={0.35} />
      <Box w={w} h={h} z={5} lift={44} mat={mat} inset={0.2} />
      {/* Keys along the front-left face. */}
      <g transform={`translate(${-h * HX * 0.4}, ${h * HY * 0.4 - 26})`}>
        <polygon points="0,0 44,22 44,30 0,8" fill="#fdf6ea" strokeWidth="1.4" />
      </g>
    </>
  ),

  /*
   * Five plants used to share two silhouettes, so a 1,500-coin bonsai and a
   * 70-coin succulent were the same drawing in a different pot. Each has its
   * own now; the pot stays shared, because the pot is the part that should
   * match.
   */
  succulent: ({ mat }) => (
    <>
      <Pot mat={mat} z={14} inset={0.6} />
      <g transform={`translate(0, ${HY - 14})`} strokeWidth="1.4">
        {/* A rosette: fat pointed leaves fanning out from the middle. */}
        {[-70, -35, 0, 35, 70, 110, -110].map((deg, i) => (
          <ellipse
            key={deg}
            cx="0"
            cy="-9"
            rx="4"
            ry="9"
            fill={i % 2 === 0 ? LEAF.mid : LEAF.light}
            transform={`rotate(${deg} 0 0)`}
          />
        ))}
        <circle cx="0" cy="-2" r="3.4" fill={LEAF.dark} />
      </g>
    </>
  ),

  fern: ({ mat }) => (
    <>
      <Pot mat={mat} z={16} inset={0.62} />
      <g transform={`translate(0, ${HY - 16})`}>
        {/* Arching fronds, each with leaflets down its length. */}
        {[-1, -0.45, 0.2, 0.85].map((lean, i) => {
          const tipX = lean * 22
          const tipY = -30 - Math.abs(lean) * -6
          return (
            <g key={lean}>
              <path
                d={`M0 0 Q ${tipX * 0.4} ${tipY * 0.7} ${tipX} ${tipY}`}
                fill="none"
                stroke={LEAF.dark}
                strokeWidth="1.8"
              />
              {[0.35, 0.6, 0.85].map((t) => (
                <ellipse
                  key={t}
                  cx={tipX * t * 0.82}
                  cy={tipY * t * 0.92}
                  rx="5.5"
                  ry="3"
                  fill={i % 2 === 0 ? LEAF.mid : LEAF.light}
                  transform={`rotate(${lean * 38} ${tipX * t * 0.82} ${tipY * t * 0.92})`}
                />
              ))}
            </g>
          )
        })}
      </g>
    </>
  ),

  monstera: ({ mat }) => (
    <>
      <Pot mat={mat} z={18} inset={0.56} />
      <g transform={`translate(0, ${HY - 18})`}>
        {[
          { x: -13, y: -40, r: -26, fill: LEAF.mid },
          { x: 12, y: -34, r: 22, fill: LEAF.light },
          { x: 0, y: -54, r: -4, fill: LEAF.dark },
        ].map((leaf) => (
          <g key={`${leaf.x}-${leaf.y}`}>
            <path
              d={`M0 0 Q ${leaf.x * 0.3} ${leaf.y * 0.6} ${leaf.x} ${leaf.y}`}
              fill="none"
              stroke={LEAF.dark}
              strokeWidth="2.2"
            />
            {/* Big paddle leaves with the splits they are named for. */}
            <g transform={`translate(${leaf.x} ${leaf.y}) rotate(${leaf.r})`}>
              <path
                d="M0 8 C -12 6 -13 -6 0 -11 C 13 -6 12 6 0 8 Z"
                fill={leaf.fill}
                strokeWidth="1.6"
              />
              <path d="M-11 1 L -4 1 M 11 1 L 4 1 M -9 -5 L -3 -4 M 9 -5 L 3 -4" stroke={OUTLINE} strokeWidth="1.2" opacity="0.55" />
            </g>
          </g>
        ))}
      </g>
    </>
  ),

  olive: ({ mat }) => (
    <>
      <Pot mat={mat} z={18} inset={0.5} />
      <g transform={`translate(0, ${HY - 18})`}>
        <path d="M0 0 C -3 -14 2 -22 0 -34" fill="none" stroke={MATERIALS.walnut!.right} strokeWidth="3.4" />
        {/* A loose canopy of small leaves rather than three big ones. */}
        {[
          [0, -46, 17, 11],
          [-11, -38, 11, 7],
          [11, -39, 10, 7],
          [-5, -55, 9, 6],
          [7, -54, 8, 6],
        ].map(([cx, cy, rx, ry]) => (
          <ellipse key={`${cx}-${cy}`} cx={cx} cy={cy} rx={rx} ry={ry} fill={LEAF.light} />
        ))}
        {[
          [-8, -44],
          [6, -48],
          [0, -38],
        ].map(([cx, cy]) => (
          <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="2.2" fill={LEAF.dark} strokeWidth="1" />
        ))}
      </g>
    </>
  ),

  bonsai: ({ mat }) => (
    <>
      <Pot mat={mat} z={11} inset={0.34} />
      <g transform={`translate(0, ${HY - 11})`}>
        {/* A short trunk with a real bend in it, and flat cloud pads. */}
        <path
          d="M2 0 C -6 -8 8 -13 2 -22 C -2 -27 -8 -27 -11 -29"
          fill="none"
          stroke={MATERIALS.walnut!.right}
          strokeWidth="4"
        />
        <path d="M2 -18 C 8 -21 13 -24 16 -25" fill="none" stroke={MATERIALS.walnut!.right} strokeWidth="2.6" />
        <ellipse cx="-13" cy="-32" rx="13" ry="7" fill={LEAF.mid} />
        <ellipse cx="17" cy="-28" rx="10" ry="6" fill={LEAF.light} />
        <ellipse cx="0" cy="-40" rx="11" ry="6.5" fill={LEAF.dark} />
      </g>
    </>
  ),

  /*
   * The old shared plant shapes, kept as aliases.
   *
   * The site deploys from a push and the database migrates separately, so for
   * a while the bundle can be newer than the rows it is drawing. Without these
   * an un-migrated `plant-small/sage` would hit the unknown-shape fallback and
   * the plants would get *worse* on deploy than they were before.
   */
  'plant-small': (p) => SHAPES.succulent!(p),
  'plant-tall': (p) => SHAPES.monstera!(p),

  'toy-ball': ({ mat }) => (
    <g transform={`translate(0, ${HY - 9})`}>
      <circle cx="0" cy="0" r="9" fill={mat.left} />
      <path d="M-9 0 C -4 -5 4 -5 9 0" fill="none" strokeWidth="1.4" />
      <path d="M-6 6 C -2 1 2 -3 8 -4" fill="none" strokeWidth="1.4" />
    </g>
  ),

  'toy-wand': ({ mat }) => (
    <g transform={`translate(0, ${HY})`}>
      <line x1="-10" y1="0" x2="8" y2="-28" strokeWidth="3" stroke={MATERIALS.oak!.right} />
      <ellipse cx="10" cy="-32" rx="7" ry="4" fill={mat.left} transform="rotate(-30 10 -32)" />
    </g>
  ),

  catbed: ({ mat }) => (
    <>
      <Box z={8} mat={mat} inset={0.18} />
      <ellipse cx="0" cy={HY + HY - 8} rx="22" ry="11" fill={mat.accent} />
    </>
  ),

  cattree: ({ mat }) => (
    <>
      <Box z={8} mat={mat} inset={0.1} />
      <Box z={40} lift={8} mat={mat} inset={0.7} />
      <Box z={8} lift={48} mat={{ ...mat, top: mat.accent }} inset={0.25} />
    </>
  ),

  castle: ({ w, h, mat }) => {
    const inset = 0.3
    const wall = 40
    const lo = inset / 2
    const merlon = 0.34
    // Tile-space spot on the footprint → screen offset from its top corner.
    const at = (i: number, j: number) => `translate(${(i - j) * HX}, ${(i + j) * HY})`
    // Battlements on the four corners and the middle of the two front edges,
    // back to front so nearer ones overlap farther ones.
    const hiW = w - lo - merlon
    const hiH = h - lo - merlon
    const midW = (w - merlon) / 2
    const midH = (h - merlon) / 2
    const merlons: [number, number][] = [
      [lo, lo],
      [hiW, lo],
      [lo, hiH],
      [hiW, midH],
      [midW, hiH],
      [hiW, hiH],
    ]
    return (
      <>
        <Box w={w} h={h} z={wall} mat={mat} inset={inset} />
        {/* Arched doorway, sitting on the floor in the middle of the left face. */}
        <g transform={at(w / 2, h - lo)}>
          <path
            d="M-7 -3.5 L-7 -20 A 8 8 0 0 1 7 -13 L7 3.5 Z"
            fill={OUTLINE}
            opacity="0.45"
            stroke="none"
          />
        </g>
        {merlons.map(([i, j]) => (
          <g key={`${i}-${j}`} transform={at(i, j)}>
            <Box w={merlon} h={merlon} z={9} lift={wall} mat={mat} />
          </g>
        ))}
      </>
    )
  },

  candle: ({ mat }) => (
    <>
      {/* The dish, centred on the tile like everything else. */}
      <Box z={4} mat={mat} inset={0.5} />
      {/* Everything below stands on the middle of the dish's top face. */}
      <g transform={`translate(0, ${HY - 4})`}>
        <circle cx="0" cy="-36" r="14" fill="#f5cf7a" stroke="none" opacity="0.18" />
        {/* A round pillar: straight sides, a curved front edge and an oval top. */}
        <path d="M-7 -1 L-7 -24 A7 3.5 0 0 1 7 -24 L7 -1 A7 3.5 0 0 1 -7 -1 Z" fill={mat.left} />
        <ellipse cx="0" cy="-24" rx="7" ry="3.5" fill={mat.top} />
        <path d="M2 -21.3 L2 -17 A1.5 1.5 0 0 0 5 -17 L5 -21.8" fill={mat.top} strokeWidth="1.2" />
        <line x1="0" y1="-25" x2="0" y2="-29" strokeWidth="1.5" />
        {/* A teardrop flame with a pale core. */}
        <path d="M0 -42 C 3 -38 5 -34 0 -29.5 C -5 -34 -3 -38 0 -42 Z" fill="#f5cf7a" stroke="#d9a04a" strokeWidth="1.2" />
        <ellipse cx="0" cy="-33" rx="1.6" ry="2.6" fill="#fff4d0" stroke="none" />
      </g>
    </>
  ),

  'lamp-table': ({ mat }) => (
    <>
      <Box z={18} mat={mat} inset={0.62} />
      <g transform={`translate(0, ${HY - 18})`}>
        <polygon points="-13,-8 13,-8 9,-24 -9,-24" fill={mat.accent} />
        <ellipse cx="0" cy="4" rx="16" ry="8" fill="#f5cf7a" stroke="none" opacity="0.22" />
      </g>
    </>
  ),

  'lamp-floor': ({ mat }) => (
    <>
      <Box z={5} mat={mat} inset={0.6} />
      <g transform={`translate(0, ${HY - 5})`}>
        <line x1="0" y1="0" x2="0" y2="-52" strokeWidth="3" stroke={MATERIALS.walnut!.right} />
        <polygon points="-16,-52 16,-52 11,-72 -11,-72" fill={mat.accent} />
        <ellipse cx="0" cy="-42" rx="22" ry="11" fill="#f5cf7a" stroke="none" opacity="0.2" />
      </g>
    </>
  ),

  lantern: ({ mat }) => (
    <g transform={`translate(0, ${HY - 34})`}>
      <line x1="0" y1="-30" x2="0" y2="-18" strokeWidth="1.6" />
      <ellipse cx="0" cy="0" rx="17" ry="19" fill={mat.top} />
      <ellipse cx="0" cy="0" rx="25" ry="26" fill="#f5cf7a" stroke="none" opacity="0.18" />
      <path d="M-17 0 L 17 0" strokeWidth="1.2" opacity="0.5" />
    </g>
  ),

  fairylights: ({ mat, side }) => (
    <OnWall side={side}>
      <g transform="translate(0, -70)">
        <path d="M-46 -18 Q 0 6 46 -18" fill="none" strokeWidth="1.6" />
        {[-38, -22, -6, 10, 26, 40].map((x, i) => (
          <circle key={x} cx={x} cy={-13 + (i % 2 === 0 ? 5 : 8)} r="3.4" fill="#f5cf7a" stroke={mat.right} strokeWidth="1" />
        ))}
      </g>
    </OnWall>
  ),

  bookstack: ({ mat }) => (
    <g transform={`translate(0, ${HY})`}>
      <Box z={6} mat={mat} inset={0.62} />
      <Box z={5} lift={6} mat={{ ...mat, top: mat.accent, left: mat.accent }} inset={0.68} />
      <Box z={5} lift={11} mat={mat} inset={0.72} />
    </g>
  ),

  teaset: ({ mat }) => (
    <g transform={`translate(0, ${HY - 4})`}>
      <ellipse cx="0" cy="0" rx="14" ry="7" fill={mat.top} />
      <path d="M-7 -2 A 7 7 0 0 1 7 -2 L7 -10 L-7 -10 Z" fill={mat.top} />
      <path d="M7 -7 q 7 2 0 6" fill="none" strokeWidth="1.6" />
      <circle cx="-13" cy="4" r="4" fill={mat.accent} />
    </g>
  ),

  /*
   * Wall shapes are drawn about the middle of their tile's wall edge (the
   * `Furniture` wrapper moves them there) and stay under the wall's 96px top.
   */
  poster: ({ mat, side }) => (
    <WallPanel side={side} width={38} height={48} lift={80} fill={mat.left} accent={mat.accent} />
  ),
  frame: ({ mat, side }) => (
    <WallPanel side={side} width={40} height={32} lift={72} fill={mat.right} accent={mat.accent} />
  ),
  starmap: ({ mat, side }) => (
    <g>
      <WallPanel side={side} width={50} height={38} lift={78} fill={mat.right} accent="#34466e" />
      {/* A night sky inside the frame: one constellation, a scatter of stars and a moon. */}
      <OnWall side={side}>
        <path
          d="M-14 -50 L-7 -60 L2 -56 L9 -66 L15 -61"
          fill="none"
          stroke="#c9d6ec"
          strokeWidth="0.8"
          opacity="0.7"
        />
        {[
          [-14, -50, 1.5],
          [-7, -60, 1.8],
          [2, -56, 1.4],
          [9, -66, 1.9],
          [15, -61, 1.4],
        ].map(([x, y, r]) => (
          <circle key={`${x},${y}`} cx={x} cy={y} r={r} fill="#fff4d0" stroke="none" />
        ))}
        {[
          [-18, -56],
          [-3, -68],
          [6, -48],
          [16, -50],
          [-9, -47],
          [12, -54],
        ].map(([x, y]) => (
          <circle key={`${x},${y}`} cx={x} cy={y} r="0.7" fill="#e3ebf7" stroke="none" opacity="0.85" />
        ))}
        <path d="M-15 -66 A3.2 3.2 0 1 0 -11.5 -61.2 A2.6 2.6 0 1 1 -15 -66 Z" fill="#f5e3a8" stroke="none" />
      </OnWall>
    </g>
  ),

  clock: ({ mat, side }) => (
    <OnWall side={side}>
      <g transform="translate(0, -68)">
        <circle cx="0" cy="0" r="14" fill={mat.top} />
        <circle cx="0" cy="0" r="9.5" fill={mat.accent} strokeWidth="1.2" />
        <path d="M0 0 L0 -6 M0 0 L4.5 2" strokeWidth="1.6" fill="none" />
      </g>
    </OnWall>
  ),

  windowbox: ({ mat, side }) => {
    // A window with the planter on its sill, so the box has something to hang from.
    const flowers = wallBoxTop(side, 0.42, 42)
    return (
      <g>
        <OnWall side={side}>
          <path
            d={rounded([{ x: -20, y: -86 }, { x: 20, y: -86 }, { x: 20, y: -40 }, { x: -20, y: -40 }])}
            fill={MATERIALS.oak!.top}
          />
          <path
            d={rounded([{ x: -15, y: -81 }, { x: 15, y: -81 }, { x: 15, y: -44 }, { x: -15, y: -44 }], 2)}
            fill="#cfe0e6"
            strokeWidth="1.4"
          />
          <path d="M0 -81 L0 -44 M-15 -62 L15 -62" strokeWidth="1.4" fill="none" />
        </OnWall>
        <WallBox side={side} along={1.3} depth={0.42} z={12} lift={30} mat={mat} />
        <ellipse cx={flowers.x - 8} cy={flowers.y - 2} rx="7" ry="5" fill="#d9a5a0" />
        <ellipse cx={flowers.x + 7} cy={flowers.y - 3} rx="6" ry="4.5" fill="#ecc7c3" />
        <ellipse cx={flowers.x} cy={flowers.y} rx="5" ry="3.5" fill={LEAF.mid} />
      </g>
    )
  },

  trophyshelf: ({ mat, side }) => {
    const cup = wallBoxTop(side, 0.45, 58)
    return (
      <g>
        {/* Brackets first, so the board sits on them. */}
        <OnWall side={side}>
          <path d="M-9 -52 L-9 -40 L-3 -52 Z M9 -52 L9 -40 L3 -52 Z" fill={mat.right} strokeWidth="1.2" />
        </OnWall>
        <WallBox side={side} along={1} depth={0.45} z={6} lift={52} mat={mat} />
        {/* A small cup on it, so it reads as a shelf and not a plank. */}
        <g transform={`translate(${cup.x}, ${cup.y})`}>
          <path d="M-4 0 L4 0 L2.5 -3 L-2.5 -3 Z" fill="#c9a24d" strokeWidth="1.2" />
          <path d="M-1 -3 L1 -3 L1 -6 L-1 -6 Z" fill="#c9a24d" strokeWidth="1" />
          <path d="M-6 -13 L6 -13 Q 6 -6 0 -6 Q -6 -6 -6 -13 Z" fill="#e4bf62" strokeWidth="1.2" />
        </g>
      </g>
    )
  },

  /*
   * Floors and walls are not objects. The room paints them across its whole
   * surface, so these art keys never reach this renderer there — but they do
   * reach the shop, which was falling through to the unknown-shape box and
   * showing a dozen identical brown cubes.
   *
   * Each one is a swatch of the real thing: the same checker the floor draws,
   * the same two faces and skirting the walls draw. What you see is what the
   * room will look like.
   */
  floor: ({ mat }) => (
    <g>
      {[
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 1],
      ].map(([i, j]) => (
        <g key={`${i}-${j}`} transform={`translate(${(i! - j!) * HX}, ${(i! + j!) * HY})`}>
          <FlatDiamond w={1} h={1} fill={(i! + j!) % 2 === 0 ? mat.top : mat.left} />
        </g>
      ))}
    </g>
  ),

  wall: ({ mat }) => <WallSwatch left={mat.left} right={mat.right} skirting={mat.accent} />,

  wallcolor: ({ material }) => {
    const wash = WALL_WASHES[material] ?? WALL_WASHES.cream!
    // The wash only repaints the walls; the skirting stays whatever the wall
    // material is, so show it in the default plaster.
    return <WallSwatch left={wash.left} right={wash.right} skirting={MATERIALS.plaster!.accent} />
  },

  'rug-round': ({ w, h, mat }) => {
    const cx = ((w - h) * HX) / 2
    const cy = ((w + h) * HY) / 2
    return (
      <g stroke="none">
        <ellipse cx={cx} cy={cy} rx={w * HX * 0.92} ry={h * HY * 0.92} fill={mat.left} />
        <ellipse cx={cx} cy={cy} rx={w * HX * 0.6} ry={h * HY * 0.6} fill={mat.top} />
      </g>
    )
  },

  'rug-diamond': ({ w, h, mat }) => (
    <g stroke="none">
      <FlatDiamond w={w} h={h} fill={mat.left} />
      <g transform={`translate(${((w - h) * HX) / 2}, ${((w + h) * HY) / 2})`}>
        <g transform={`translate(${-((w - h) * HX) / 2}, ${-((w + h) * HY) / 2}) scale(0.62)`}>
          <FlatDiamond w={w} h={h} fill={mat.top} />
        </g>
      </g>
    </g>
  ),
}

/**
 * One catalog item, drawn at the origin of its own tile. The caller positions
 * it; this only knows how to draw.
 */
export const Furniture = memo(function Furniture({
  artKey,
  footprintW = 1,
  footprintH = 1,
  rotation = 0,
  shadow = true,
  ghost,
  wallSide = 'right',
  wallIndex,
}: {
  artKey: string
  footprintW?: number
  footprintH?: number
  rotation?: number
  shadow?: boolean
  /** Wall-mounted shapes only: which back wall the tile is against. */
  wallSide?: WallSide
  /**
   * Wall-mounted shapes only: the tile's place along that wall, so a wide piece
   * at either end can be slid in off the corner. Left out for a lone preview,
   * where there is no corner to run into.
   */
  wallIndex?: number
  /** 'valid' shows a translucent preview, 'invalid' tints it. */
  ghost?: 'valid' | 'invalid'
}) {
  const { shape, material } = parseArtKey(artKey)
  const mat = materialFor(material)
  const size = rotatedFootprint(footprintW, footprintH, rotation)
  const draw = SHAPES[shape]

  let body = draw ? (
    draw({ w: size.w, h: size.h, mat, material, side: wallSide })
  ) : (
    // An unknown art_key should look obviously provisional, not crash.
    <Box w={size.w} h={size.h} z={20} mat={mat} inset={0.3} />
  )

  const reach = WALL_REACH[shape]
  if (reach !== undefined) {
    // Hang it from the middle of the tile's wall edge, slid along the wall just
    // far enough to stay clear of either end.
    let along = HX / 2
    if (wallIndex !== undefined) {
      const fromCorner = (wallIndex + 0.5) * HX
      along += Math.min(Math.max(fromCorner, reach), GRID_SIZE * HX - reach) - fromCorner
    }
    body = <g transform={`translate(${wallSide === 'left' ? -along : along}, ${along / 2})`}>{body}</g>
  }

  return (
    <g
      stroke={OUTLINE}
      strokeWidth="2"
      strokeLinejoin="round"
      strokeLinecap="round"
      opacity={ghost ? 0.6 : 1}
      style={ghost === 'invalid' ? { filter: 'hue-rotate(-40deg) saturate(2.2)' } : undefined}
    >
      {shadow && !ghost && !NO_SHADOW_SHAPES.has(shape) && <ContactShadow w={size.w} h={size.h} />}
      {body}
    </g>
  )
})

export { SHAPES, NO_SHADOW_SHAPES }
