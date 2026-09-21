import { memo, type ReactNode } from 'react'
import { TILE_H, TILE_W, rotatedFootprint } from '@/lib/iso/projection'
import { MATERIALS, OUTLINE, materialFor, parseArtKey, type Material } from './materials'

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
  opacity,
}: {
  w?: number
  h?: number
  z: number
  lift?: number
  mat: Material
  /** Shrinks the footprint, for a tabletop narrower than its tile. */
  inset?: number
  opacity?: number
}) {
  const scaleW = Math.max(0.05, w - inset)
  const scaleH = Math.max(0.05, h - inset)
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
      <polygon
        points={poly([shift(c.l, top), shift(c.b, top), shift(c.b, base), shift(c.l, base)])}
        fill={mat.left}
      />
      {/* Right face — darkest */}
      <polygon
        points={poly([shift(c.b, top), shift(c.r, top), shift(c.r, base), shift(c.b, base)])}
        fill={mat.right}
      />
      {/* Top face — lightest */}
      <polygon
        points={poly([shift(c.t, top), shift(c.r, top), shift(c.b, top), shift(c.l, top)])}
        fill={mat.top}
      />
    </g>
  )
}

/** A flat shape lying on the floor: rugs and floor decals. */
function FlatDiamond({ w, h, fill, opacity }: { w: number; h: number; fill: string; opacity?: number }) {
  const c = footprintCorners(w, h)
  return <polygon points={poly([c.t, c.r, c.b, c.l])} fill={fill} opacity={opacity} />
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

/** A billboard hung on the back wall, skewed to sit flat against it. */
function WallPanel({
  width,
  height,
  lift,
  fill,
  accent,
}: {
  width: number
  height: number
  lift: number
  fill: string
  accent?: string
}) {
  // The right-hand wall recedes at the isometric angle, so a rectangle on it
  // shears by half a pixel down for every pixel across.
  const x0 = -width / 2
  const pts: Pt[] = [
    { x: x0, y: -lift + x0 / 2 },
    { x: x0 + width, y: -lift + (x0 + width) / 2 },
    { x: x0 + width, y: -lift + height + (x0 + width) / 2 },
    { x: x0, y: -lift + height + x0 / 2 },
  ]
  return (
    <g>
      <polygon points={poly(pts)} fill={fill} />
      {accent && (
        <polygon
          points={poly([
            { x: pts[0]!.x + 5, y: pts[0]!.y + 5 },
            { x: pts[1]!.x - 5, y: pts[1]!.y + 5 },
            { x: pts[2]!.x - 5, y: pts[2]!.y - 5 },
            { x: pts[3]!.x + 5, y: pts[3]!.y - 5 },
          ])}
          fill={accent}
          strokeWidth="1.4"
        />
      )}
    </g>
  )
}

/* ------------------------------------------------------------- the shapes */

interface ShapeProps { w: number; h: number; mat: Material; material: string }

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
      <Box z={22} lift={18} mat={mat} inset={0.8} />
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
      <Box z={16} mat={mat} inset={0.2} />
      <Box z={18} lift={16} mat={{ ...mat, top: mat.accent }} inset={0.45} />
      <Box h={0.3} z={30} lift={10} mat={mat} inset={0.1} />
    </>
  ),

  sofa: ({ w, h, mat }) => (
    <>
      <Box w={w} h={h} z={14} mat={mat} inset={0.2} />
      <Box w={w} h={h} z={12} lift={14} mat={{ ...mat, top: mat.accent }} inset={0.5} />
      <Box w={w} h={h * 0.32} z={30} lift={10} mat={mat} inset={0.08} />
    </>
  ),

  bed: ({ w, h, mat }) => (
    <>
      <Box w={w} h={h} z={16} mat={mat} inset={0.25} />
      <Box w={w} h={h} z={8} lift={16} mat={{ ...mat, top: mat.accent }} inset={0.35} />
      <Box w={w * 0.4} h={h * 0.6} z={9} lift={24} mat={{ ...mat, top: '#fffaf2', left: '#f0e2cd', right: '#dccbb0' }} />
    </>
  ),

  bookcase: ({ w, h, mat }) => (
    <>
      <Box w={w} h={h} z={64} mat={mat} inset={0.25} />
      {/* Shelves and a few book spines, drawn on the left face. */}
      <g transform={`translate(${-h * HX * 0.42}, ${h * HY * 0.42})`}>
        {[18, 36, 54].map((y) => (
          <line key={y} x1="2" y1={-y + 10} x2={h * HX * 0.72} y2={-y + 10 + h * HY * 0.72} strokeWidth="1.6" />
        ))}
      </g>
    </>
  ),

  wardrobe: ({ w, h, mat }) => (
    <>
      <Box w={w} h={h} z={76} mat={mat} inset={0.2} />
      <circle cx={-h * HX * 0.35} cy={h * HY * 0.35 - 40} r="2.6" fill={mat.accent} />
    </>
  ),

  tallbox: ({ mat }) => <Box z={54} mat={mat} inset={0.45} />,

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

  'plant-small': ({ mat }) => (
    <>
      <Box z={14} mat={mat} inset={0.62} />
      <g transform={`translate(0, ${HY - 16})`}>
        <ellipse cx="-6" cy="-8" rx="9" ry="6" fill="#a7b89b" transform="rotate(-24 -6 -8)" />
        <ellipse cx="7" cy="-11" rx="8" ry="5.5" fill="#c3d0b9" transform="rotate(20 7 -11)" />
        <ellipse cx="0" cy="-18" rx="7" ry="5" fill="#84957a" />
      </g>
    </>
  ),

  'plant-tall': ({ mat }) => (
    <>
      <Box z={18} mat={mat} inset={0.58} />
      <g transform={`translate(0, ${HY - 20})`} fill="none" stroke="#7f9472" strokeWidth="3">
        <path d="M0 0 C -8 -14 -10 -26 -3 -34" />
        <path d="M0 0 C 8 -12 13 -24 8 -32" />
      </g>
      <g transform={`translate(0, ${HY - 20})`}>
        <ellipse cx="-5" cy="-38" rx="11" ry="7" fill="#a7b89b" transform="rotate(-28 -5 -38)" />
        <ellipse cx="10" cy="-34" rx="10" ry="6.5" fill="#c3d0b9" transform="rotate(24 10 -34)" />
        <ellipse cx="1" cy="-48" rx="8" ry="6" fill="#84957a" />
      </g>
    </>
  ),

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

  castle: ({ w, h, mat }) => (
    <>
      <Box w={w} h={h} z={40} mat={mat} inset={0.3} />
      {/* Doorway on the left face. */}
      <g transform={`translate(${-h * HX * 0.38}, ${h * HY * 0.38 - 8})`}>
        <path d="M0 0 L0 -16 A 7 7 0 0 1 14 -9 L14 7 Z" fill={OUTLINE} opacity="0.45" stroke="none" />
      </g>
    </>
  ),

  candle: ({ mat }) => (
    <g transform={`translate(0, ${HY})`}>
      <Box z={5} mat={mat} inset={0.7} />
      <rect x="-4" y="-22" width="8" height="18" rx="2" fill={mat.top} />
      <circle cx="0" cy="-26" r="4" fill="#f5cf7a" stroke="none" opacity="0.9" />
      <circle cx="0" cy="-26" r="9" fill="#f5cf7a" stroke="none" opacity="0.2" />
    </g>
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

  fairylights: ({ mat }) => (
    <g transform={`translate(0, -66)`}>
      <path d="M-46 -18 Q 0 6 46 -18" fill="none" strokeWidth="1.6" />
      {[-38, -22, -6, 10, 26, 40].map((x, i) => (
        <circle key={x} cx={x} cy={-13 + (i % 2 === 0 ? 5 : 8)} r="3.4" fill="#f5cf7a" stroke={mat.right} strokeWidth="1" />
      ))}
    </g>
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

  poster: ({ mat }) => <WallPanel width={38} height={48} lift={78} fill={mat.left} accent={mat.accent} />,
  frame: ({ mat }) => <WallPanel width={40} height={32} lift={74} fill={mat.right} accent={mat.accent} />,
  starmap: ({ mat }) => <WallPanel width={50} height={38} lift={80} fill={mat.right} accent="#7fa8c4" />,

  clock: ({ mat }) => (
    <g transform={`translate(0, -84)`}>
      <circle cx="0" cy="0" r="16" fill={mat.top} />
      <circle cx="0" cy="0" r="11" fill={mat.accent} strokeWidth="1.2" />
      <path d="M0 0 L0 -7 M0 0 L5 2" strokeWidth="1.6" fill="none" />
    </g>
  ),

  windowbox: ({ mat }) => (
    <g transform={`translate(0, -56)`}>
      <Box z={12} mat={mat} inset={0.35} />
      <ellipse cx="-8" cy="-14" rx="7" ry="5" fill="#d9a5a0" />
      <ellipse cx="6" cy="-16" rx="6" ry="4.5" fill="#ecc7c3" />
    </g>
  ),

  trophyshelf: ({ mat }) => (
    <g transform={`translate(0, -70)`}>
      <WallPanel width={54} height={8} lift={0} fill={mat.left} />
    </g>
  ),

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
}: {
  artKey: string
  footprintW?: number
  footprintH?: number
  rotation?: number
  shadow?: boolean
  /** 'valid' shows a translucent preview, 'invalid' tints it. */
  ghost?: 'valid' | 'invalid'
}) {
  const { shape, material } = parseArtKey(artKey)
  const mat = materialFor(material)
  const size = rotatedFootprint(footprintW, footprintH, rotation)
  const draw = SHAPES[shape]

  const body = draw ? (
    draw({ w: size.w, h: size.h, mat, material })
  ) : (
    // An unknown art_key should look obviously provisional, not crash.
    <Box w={size.w} h={size.h} z={20} mat={mat} inset={0.3} />
  )

  return (
    <g
      stroke={OUTLINE}
      strokeWidth="2"
      strokeLinejoin="round"
      strokeLinecap="round"
      opacity={ghost ? 0.6 : 1}
      style={ghost === 'invalid' ? { filter: 'hue-rotate(-40deg) saturate(2.2)' } : undefined}
    >
      {shadow && !ghost && <ContactShadow w={size.w} h={size.h} />}
      {body}
    </g>
  )
})

export { SHAPES }
