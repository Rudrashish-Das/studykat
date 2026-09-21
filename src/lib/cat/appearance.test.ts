import {
  candidateAppearances,
  describeAppearance,
  generateAppearance,
  COAT_COLORS,
  EAR_SHAPES,
  FACE_MARKINGS,
  PATTERNS,
  TAILS,
} from './appearance'
import { hashSeed, mulberry32, rngForSeed } from './prng'

/**
 * The promise the product makes is "a cat that is visually unique to your
 * account, forever". These tests are what keeps that true: determinism first,
 * then spread, then the guarantee that the palette stays inside the art
 * direction.
 */
describe('determinism', () => {
  const seeds = ['abcdefghijkmnopq', 'zzzzzzzzzzzzzzzz', 'k3j4h5g6f7d8s9a2', '2222222222222222']

  it.each(seeds)('the same seed always produces the same cat (%s)', (seed) => {
    const first = generateAppearance(seed)
    for (let i = 0; i < 50; i += 1) {
      expect(generateAppearance(seed)).toEqual(first)
    }
  })

  it('is stable across variants', () => {
    expect(generateAppearance('abcdefghijkmnopq', 2)).toEqual(
      generateAppearance('abcdefghijkmnopq', 2),
    )
  })

  it('produces different cats for different seeds', () => {
    const a = generateAppearance('aaaaaaaaaaaaaaaa')
    const b = generateAppearance('bbbbbbbbbbbbbbbb')
    expect(a).not.toEqual(b)
  })

  it('produces three distinguishable candidates from one seed', () => {
    const [one, two, three] = candidateAppearances('k3j4h5g6f7d8s9a2')
    const signature = (c: typeof one) =>
      [c.coat.name, c.pattern, c.eye, c.ear, c.tail, c.face, c.socks].join('|')
    const signatures = new Set([signature(one), signature(two), signature(three)])
    expect(signatures.size).toBe(3)
  })

  it('records which variant it came from, so the choice is reproducible', () => {
    expect(generateAppearance('abcdefghijkmnopq', 1).variant).toBe(1)
    expect(generateAppearance('abcdefghijkmnopq', 1).seed).toBe('abcdefghijkmnopq')
  })

  it('pins the PRNG output, so a future refactor cannot silently rewrite every cat', () => {
    // If these numbers change, everyone's cat changes. That is a migration,
    // not a refactor.
    // A deliberately neutral literal: a project rename must not be able to
    // change this test's input, because that would quietly unpin the hash.
    expect(hashSeed('prng-pin-do-not-change')).toBe(118794456)
    const rng = mulberry32(12345)
    const drawn = [rng.next(), rng.next(), rng.next()].map((n) => Number(n.toFixed(10)))
    expect(drawn).toEqual([0.9797282678, 0.3067522645, 0.4842054215])
  })
})

describe('trait validity', () => {
  const seeds = Array.from({ length: 400 }, (_, i) => `seed${String(i).padStart(12, '0')}`)
  const cats = seeds.map((s) => generateAppearance(s))

  it('only ever uses colours from the curated palette', () => {
    const coatNames = new Set(COAT_COLORS.map((c) => c.name))
    for (const cat of cats) {
      expect(coatNames.has(cat.coat.name as (typeof COAT_COLORS)[number]['name'])).toBe(true)
    }
  })

  it('never produces pure black or pure white', () => {
    for (const cat of cats) {
      for (const hex of [cat.coat.body, cat.coat.shade, cat.accent, cat.eye, cat.nose]) {
        expect(hex.toLowerCase()).not.toBe('#000000')
        expect(hex.toLowerCase()).not.toBe('#ffffff')
      }
    }
  })

  it('stays inside the declared trait sets', () => {
    for (const cat of cats) {
      expect(PATTERNS).toContain(cat.pattern)
      expect(EAR_SHAPES).toContain(cat.ear)
      expect(TAILS).toContain(cat.tail)
      expect(FACE_MARKINGS).toContain(cat.face)
      expect(cat.socks).toBeGreaterThanOrEqual(0)
      expect(cat.socks).toBeLessThanOrEqual(4)
    }
  })

  it('makes heterochromia rare but reachable', () => {
    const odd = cats.filter((c) => c.eyeRight !== null).length
    // Target is 3%; over 400 cats allow a wide band rather than a flaky test.
    expect(odd).toBeGreaterThan(0)
    expect(odd / cats.length).toBeLessThan(0.1)
  })

  it('makes sparkle rarer still', () => {
    const sparkly = cats.filter((c) => c.sparkle).length
    expect(sparkly / cats.length).toBeLessThan(0.05)
  })

  it('spreads across the whole coat palette rather than favouring a few', () => {
    const used = new Set(cats.map((c) => c.coat.name))
    expect(used.size).toBe(COAT_COLORS.length)
  })

  it('uses every pattern', () => {
    const used = new Set(cats.map((c) => c.pattern))
    expect(used.size).toBe(PATTERNS.length)
  })
})

describe('describeAppearance', () => {
  it('reads as a sentence', () => {
    const description = describeAppearance(generateAppearance('abcdefghijkmnopq'))
    expect(description).toMatch(/^A .+\.$/)
    expect(description).toContain('cat')
  })

  it('is stable for a given seed', () => {
    expect(describeAppearance(generateAppearance('zzzzzzzzzzzzzzzz'))).toBe(
      describeAppearance(generateAppearance('zzzzzzzzzzzzzzzz')),
    )
  })
})

describe('rngForSeed', () => {
  it('decorrelates variants', () => {
    const a = rngForSeed('abcdefghijkmnopq', 0)
    const b = rngForSeed('abcdefghijkmnopq', 1)
    const drawA = [a.next(), a.next(), a.next()]
    const drawB = [b.next(), b.next(), b.next()]
    expect(drawA).not.toEqual(drawB)
  })

  it('pick() never returns undefined', () => {
    const rng = rngForSeed('abcdefghijkmnopq')
    for (let i = 0; i < 500; i += 1) {
      expect(rng.pick(['a', 'b', 'c'])).toBeDefined()
    }
  })

  it('int() stays in range', () => {
    const rng = rngForSeed('abcdefghijkmnopq')
    for (let i = 0; i < 500; i += 1) {
      const n = rng.int(7)
      expect(n).toBeGreaterThanOrEqual(0)
      expect(n).toBeLessThan(7)
    }
  })
})
