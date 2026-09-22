import { describe, expect, it } from 'vitest'
import { blockedCells } from '@/lib/iso/path'
import {
  approach,
  bedtimeSpot,
  chooseItem,
  inlineName,
  interactionFor,
  type InteractableItem,
} from './interactions'

function placed(
  id: string,
  art_key: string,
  at: [number, number],
  opts: Partial<InteractableItem['item']> = {},
): InteractableItem {
  return {
    id,
    grid_x: at[0],
    grid_y: at[1],
    rotation: 0,
    item: {
      name: id,
      art_key,
      category: 'furniture',
      layer: 2,
      footprint_w: 1,
      footprint_h: 1,
      ...opts,
    },
  }
}

describe('interactionFor', () => {
  it('plays with toys and scratches the post', () => {
    expect(interactionFor(placed('y', 'toy-ball/rose', [0, 0]).item).action).toBe('play')
    expect(interactionFor(placed('w', 'toy-wand/teal', [0, 0]).item).pose).toBe('playing')
    expect(interactionFor(placed('s', 'tallbox/pine', [0, 0]).item).action).toBe('scratch')
  })

  it('naps on soft furniture, up off the floor', () => {
    const bed = interactionFor(placed('b', 'bed/cream', [0, 0]).item)
    expect(bed.pose).toBe('sleeping')
    expect(bed.lift).toBeGreaterThan(0)
  })

  it('has something to do with every catalogue item, even unknown shapes', () => {
    const odd = interactionFor(placed('x', 'mystery/oak', [0, 0], { category: 'decor' }).item)
    expect(odd.describe('thing')).toMatch(/thing/)
    const hung = interactionFor(placed('p', 'mystery/oak', [0, 0], { layer: 3 }).item)
    expect(hung.action).toBe('watch')
  })

  it('rolls on rugs', () => {
    const rug = placed('r', 'rug-round/rose', [0, 0], { category: 'rug', layer: 1 })
    expect(interactionFor(rug.item).action).toBe('roll')
  })
})

describe('approach', () => {
  it('stands beside solid furniture, never inside it', () => {
    const desk = placed('d', 'desk/oak', [4, 4], { footprint_w: 2 })
    const route = approach(desk, { gx: 0, gy: 0 }, blockedCells([desk]))!
    expect(route).not.toBeNull()
    expect([
      [4, 4],
      [5, 4],
    ]).not.toContainEqual([route.stand.gx, route.stand.gy])
    const last = route.path[route.path.length - 1]!
    expect(last).toEqual(route.stand)
  })

  it('walks onto rugs', () => {
    const rug = placed('r', 'rug-round/rose', [2, 2], { category: 'rug', layer: 1, footprint_w: 2, footprint_h: 2 })
    const route = approach(rug, { gx: 0, gy: 0 }, blockedCells([rug]))!
    expect(route.stand).toEqual({ gx: 2, gy: 2 })
  })

  it('gives up on something boxed in', () => {
    const ball = placed('ball', 'toy-ball/rose', [0, 0])
    const walls = [placed('a', 'crate/oak', [1, 0]), placed('b', 'crate/oak', [0, 1])]
    expect(approach(ball, { gx: 5, gy: 5 }, blockedCells([ball, ...walls]))).toBeNull()
  })
})

describe('chooseItem', () => {
  it('ignores the room surfaces and the thing it just did', () => {
    const floor = placed('f', 'floor/pine', [0, 0], { category: 'floor', layer: 0 })
    const ball = placed('ball', 'toy-ball/rose', [1, 1])
    const stool = placed('stool', 'box-low/pine', [2, 2])
    expect(chooseItem([floor, ball, stool], () => 0, 'ball')?.id).toBe('stool')
    expect(chooseItem([floor], () => 0)).toBeNull()
  })

  it('favours toys', () => {
    const ball = placed('ball', 'toy-ball/rose', [1, 1])
    const stool = placed('stool', 'box-low/pine', [2, 2])
    let toys = 0
    for (let i = 0; i < 100; i += 1) {
      if (chooseItem([stool, ball], () => i / 100)?.id === 'ball') toys += 1
    }
    expect(toys).toBeGreaterThan(70)
  })
})

describe('bedtimeSpot', () => {
  it('prefers the cat bed to the people bed', () => {
    const bed = placed('bed', 'bed/cream', [0, 0])
    const catbed = placed('catbed', 'catbed/rose', [3, 3], { category: 'toy' })
    expect(bedtimeSpot([bed, catbed])?.id).toBe('catbed')
    expect(bedtimeSpot([placed('c', 'chair/oak', [0, 0])])).toBeNull()
  })
})

it('lower-cases a name for use mid-sentence', () => {
  expect(inlineName('Ball of yarn')).toBe('ball of yarn')
})
