import type { CatalogItem } from '@/lib/supabase/types'
import type { PlacedItem } from './Room'

/** Categories that paint the whole room rather than standing in it. */
export const SURFACE_CATEGORIES = ['floor', 'wall', 'wallcolor'] as const
export type SurfaceCategory = (typeof SURFACE_CATEGORIES)[number]

export function isSurface(item: CatalogItem): boolean {
  return (SURFACE_CATEGORIES as readonly string[]).includes(item.category)
}

/**
 * The floor, wall or wash the room shows. The editor keeps one of each, but a
 * room laid out before it did may still hold the free starter beside one the
 * user bought — the bought one wins, since the starter was never chosen.
 */
export function activeSurface(placed: PlacedItem[], category: SurfaceCategory): PlacedItem | null {
  const matches = placed.filter((p) => p.item.category === category)
  return matches.find((p) => p.item.price > 0) ?? matches[0] ?? null
}
