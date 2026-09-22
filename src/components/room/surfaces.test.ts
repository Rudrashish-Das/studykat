import { describe, expect, it } from 'vitest'
import { activeSurface } from './surfaces'
import type { PlacedItem } from './Room'

function placed(id: string, category: string, price: number): PlacedItem {
  return {
    id,
    item_id: `item-${id}`,
    grid_x: 0,
    grid_y: 0,
    rotation: 0,
    item: { id: `item-${id}`, category, price, art_key: `${category}/x` },
  } as unknown as PlacedItem
}

describe('activeSurface', () => {
  it('shows a bought floor over the free starter, whichever comes first', () => {
    expect(activeSurface([placed('pine', 'floor', 0), placed('oak', 'floor', 220)], 'floor')?.id).toBe('oak')
    expect(activeSurface([placed('oak', 'floor', 220), placed('pine', 'floor', 0)], 'floor')?.id).toBe('oak')
  })

  it('falls back to the starter, and to nothing', () => {
    expect(activeSurface([placed('plaster', 'wall', 0)], 'wall')?.id).toBe('plaster')
    expect(activeSurface([placed('plaster', 'wall', 0)], 'wallcolor')).toBeNull()
  })
})
