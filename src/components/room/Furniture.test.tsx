import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render } from '@testing-library/react'
import { Furniture, SHAPES, NO_SHADOW_SHAPES } from './Furniture'
import { MATERIALS, OUTLINE, parseArtKey } from './materials'

/**
 * The shop draws every catalog item with this renderer, and an `art_key` whose
 * shape is missing does not fail — it quietly falls through to a generic box.
 * Twelve items shipped that way: every floor, wall and wall colour was the same
 * brown cube, because surfaces are painted by the room and nobody had drawn
 * them as objects. The seed is the only place that knows the full list, so the
 * test reads it.
 */
const seed = readFileSync(
  // Vitest runs from the project root.
  join(process.cwd(), 'supabase', 'migrations', '0005_catalog_seed.sql'),
  'utf8',
)

const catalog = [...seed.matchAll(/\(\s*'([a-z0-9-]+)',[^\n]*?'([a-z-]+\/[a-z]+)',\s*\d+\)/g)].map(
  (m) => ({ slug: m[1]!, artKey: m[2]! }),
)

describe('the catalog art', () => {
  it('found the seed rows', () => {
    // A broken regex here would make every assertion below vacuously pass.
    expect(catalog.length).toBeGreaterThan(50)
  })

  it('has a real shape for every item — no silent fallback boxes', () => {
    const missing = catalog
      .filter(({ artKey }) => !SHAPES[parseArtKey(artKey).shape])
      .map(({ slug, artKey }) => `${slug} (${artKey})`)
    expect(missing).toEqual([])
  })

  it('uses a material the table knows', () => {
    const known = new Set(Object.keys(MATERIALS))
    const unknown = catalog
      .map(({ slug, artKey }) => ({ slug, ...parseArtKey(artKey) }))
      .filter((x) => !known.has(x.material))
      .map((x) => `${x.slug} (${x.material})`)
    expect(unknown).toEqual([])
  })

  it('draws the grandfather clock as something other than a plain tall box', () => {
    // It shared `tallbox` with the scratching post: a 2,400 coin item, unlocked
    // at a 30-day streak, that looked like a crate on its end.
    const clock = catalog.find((c) => c.slug === 'grandfather-clock')
    expect(clock?.artKey).toBe('grandfather/walnut')
    expect(parseArtKey(clock!.artKey).shape).not.toBe('tallbox')
  })
})

/** How many contact-shadow ellipses did this piece draw? */
function shadowCount(artKey: string, w = 1, h = 1): number {
  const { container } = render(
    <svg>
      <Furniture artKey={artKey} footprintW={w} footprintH={h} />
    </svg>,
  )
  return container.querySelectorAll(`ellipse[fill="${OUTLINE}"]`).length
}

describe('contact shadows', () => {
  it('grounds things that stand on the floor', () => {
    expect(shadowCount('chair/oak')).toBe(1)
    expect(shadowCount('wardrobe/walnut', 1, 2)).toBe(1)
  })

  it('does not put a floor shadow under anything hung on a wall', () => {
    // A poster does not touch the floor, and in a fitted shop tile that phantom
    // ellipse was larger than the poster.
    for (const artKey of ['poster/teal', 'frame/oak', 'starmap/char', 'clock/walnut']) {
      expect(shadowCount(artKey), artKey).toBe(0)
    }
  })

  it('keeps the two lists honest about each other', () => {
    // Every no-shadow name must be a shape that exists, or the set is silently
    // guarding nothing.
    for (const shape of NO_SHADOW_SHAPES) {
      expect(SHAPES[shape], shape).toBeDefined()
    }
  })
})

/** Every coordinate this piece draws, from its path data. */
function extent(artKey: string, w = 1, h = 1) {
  const { container } = render(
    <svg>
      <Furniture artKey={artKey} footprintW={w} footprintH={h} shadow={false} />
    </svg>,
  )
  const xs: number[] = []
  const ys: number[] = []
  for (const el of container.querySelectorAll('path')) {
    const d = el.getAttribute('d') ?? ''
    for (const m of d.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)) {
      xs.push(Number(m[1]))
      ys.push(Number(m[2]))
    }
  }
  return {
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
    /** Highest point drawn; y grows downward, so smaller is taller. */
    top: Math.min(...ys),
    paths: container.querySelectorAll('path').length,
  }
}

describe('slab-shaped parts', () => {
  /**
   * `inset` shrinks both axes together, so it can only ever make a smaller
   * square. Everything slab-shaped — a chair back, an armrest — needs the axes
   * to move independently; without that the chair's back rendered as a post in
   * the middle of the seat and the sofa came out as a staircase.
   */
  it('gives the chair a back that rises well above its seat', () => {
    // A back, not a post: the chair must reach far higher than a plain seat of
    // the same footprint does.
    expect(extent('chair/oak').top).toBeLessThan(extent('box-low/oak').top - 20)
  })

  it('gives the armchair arms — two more parts than a plain chair, and wider', () => {
    const chair = extent('chair/oak')
    const armchair = extent('armchair/sage')
    // Two arms are two more boxes, and a box is three faces.
    expect(armchair.paths).toBeGreaterThanOrEqual(chair.paths + 6)
    expect(armchair.width).toBeGreaterThan(chair.width)
  })

  it('builds the sofa from more than a stack of slabs', () => {
    // Base + two cushions + back + two arms: six boxes, three faces each.
    expect(extent('sofa/rose', 2, 1).paths).toBeGreaterThanOrEqual(18)
  })
})

describe('soft corners', () => {
  /**
   * §8 asks for soft edges. Faces used to be <polygon>, which cannot round its
   * corners at all — the whole set read as blocks.
   */
  it('draws every face as a curved path, not a hard-cornered polygon', () => {
    const { container } = render(
      <svg>
        <Furniture artKey="box-low/oak" />
      </svg>,
    )
    expect(container.querySelectorAll('polygon')).toHaveLength(0)

    for (const el of container.querySelectorAll('path')) {
      const d = el.getAttribute('d') ?? ''
      const points = new Set([...d.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)].map((m) => m[0]))
      // Each corner of a four-sided face contributes three distinct points:
      // where the curve leaves the previous edge, the vertex it bends around,
      // and where it rejoins the next one. A zero radius collapses all three
      // into the vertex, which is how a "rounded" path can still be square.
      expect(points.size, d).toBe(12)
    }
  })

  it('never rounds a corner past the middle of its own edge', () => {
    // A tiny part with a large radius would fold inside out.
    const tiny = extent('candle/cream')
    expect(tiny.width).toBeGreaterThan(0)
    expect(tiny.height).toBeGreaterThan(0)
  })
})
