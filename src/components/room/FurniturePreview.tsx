import { useLayoutEffect, useRef, useState } from 'react'
import { Furniture } from './Furniture'

/**
 * One catalog item, framed on its own.
 *
 * The room draws furniture on a grid, so everything shares one scale and sits
 * where it belongs. A shop tile has no grid — just a box — and the pieces vary
 * enormously: a chair is 52x71 units, a wardrobe 96x128, and a wall clock is
 * drawn 84 units *above* the floor it never touches. One fixed viewBox for all
 * of them leaves the small things stranded in the middle and cuts the bottom
 * off the large ones.
 *
 * So each tile measures what was actually drawn and centres it. `getBBox` is
 * the honest way to do that: the shapes are a table of React nodes, and any
 * table of heights kept alongside them would drift the first time someone adds
 * a shape.
 */

/** The drawing area, in the same units the furniture is drawn in. */
const VIEW = 132
const PAD = 8

/**
 * Small pieces are allowed to grow a little, but not without limit — a chair
 * scaled to fill its tile would read as the same size as the wardrobe, and the
 * whole point of a decorating game is that furniture has heft.
 */
const MAX_UPSCALE = 1.35

export function FurniturePreview({
  artKey,
  footprintW,
  footprintH,
  className,
  opacity,
}: {
  artKey: string
  footprintW: number
  footprintH: number
  className?: string
  /** Dims the piece without changing what is measured — locked shop items. */
  opacity?: number
}) {
  const drawn = useRef<SVGGElement>(null)
  const [fit, setFit] = useState<string | null>(null)

  useLayoutEffect(() => {
    const g = drawn.current
    // jsdom has no layout engine and so no getBBox; the untransformed fallback
    // is correct enough for tests, which assert on what is drawn, not where.
    if (!g || typeof g.getBBox !== 'function') return

    const box = g.getBBox()
    if (box.width === 0 || box.height === 0) return

    const scale = Math.min(
      MAX_UPSCALE,
      (VIEW - PAD * 2) / box.width,
      (VIEW - PAD * 2) / box.height,
    )
    const cx = box.x + box.width / 2
    const cy = box.y + box.height / 2
    setFit(`scale(${scale}) translate(${-cx} ${-cy})`)
  }, [artKey, footprintW, footprintH])

  return (
    <svg
      viewBox={`${-VIEW / 2} ${-VIEW / 2} ${VIEW} ${VIEW}`}
      className={className}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden
    >
      <g ref={drawn} transform={fit ?? undefined} opacity={opacity}>
        <Furniture artKey={artKey} footprintW={footprintW} footprintH={footprintH} />
      </g>
    </svg>
  )
}
