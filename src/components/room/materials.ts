/**
 * The art recipe from §8, as data.
 *
 * Light is fixed at the upper-left for the whole world, so every object shades
 * the same way: top face lightest, left face mid, right face darkest. Keeping
 * that in one table is what makes 53 hand-authored shapes look like one set
 * instead of 53 drawings.
 */

export interface Material {
  /** Upward-facing surfaces. */
  top: string
  /** Faces pointing toward the lower-left. */
  left: string
  /** Faces pointing toward the lower-right — always the darkest. */
  right: string
  /** Cushions, pages, glass: whatever the object needs a second colour for. */
  accent: string
}

export const OUTLINE = '#4a3b34'

/**
 * `satisfies` rather than `: Record<string, Material>`, so a known key like
 * `MATERIALS.oak` types as `Material` rather than `Material | undefined` — the
 * project builds with `noUncheckedIndexedAccess`, which otherwise demands a
 * non-null assertion at every one of the dozens of call sites that reach for a
 * specific, always-present material.
 */
export const MATERIALS = {
  pine: { top: '#e9d4b4', left: '#d3ab7f', right: '#b08a60', accent: '#f3e8d8' },
  oak: { top: '#dcb68d', left: '#c99a6b', right: '#a67a4f', accent: '#f0e2cd' },
  walnut: { top: '#a87d5c', left: '#8a6446', right: '#6b4c34', accent: '#e0c9ad' },
  char: { top: '#6e6672', left: '#574f5c', right: '#423b48', accent: '#c7bfc4' },
  cream: { top: '#fdf6ea', left: '#f0e2cd', right: '#d9c7ab', accent: '#c99a6b' },
  sage: { top: '#c3d0b9', left: '#a7b89b', right: '#84957a', accent: '#f0e2cd' },
  rose: { top: '#ecc7c3', left: '#d9a5a0', right: '#b87e78', accent: '#f6ead8' },
  teal: { top: '#a8c6c3', left: '#7fa8a4', right: '#5d8682', accent: '#f0e2cd' },
  // Surface materials, used by the floor and walls rather than by objects.
  checker: { top: '#efe3d0', left: '#c9b79d', right: '#a8998a', accent: '#8d9c96' },
  herringbone: { top: '#d9b184', left: '#c0975f', right: '#9d7748', accent: '#b78a56' },
  tatami: { top: '#d8cfa8', left: '#bfb58c', right: '#9e9570', accent: '#8c8560' },
  plaster: { top: '#f6ead8', left: '#eedcc2', right: '#e3c9a4', accent: '#d8c8b4' },
  wainscot: { top: '#f0e2cd', left: '#e0cdb2', right: '#c9b294', accent: '#a67a4f' },
  brick: { top: '#e7d3c4', left: '#d8bda9', right: '#bd9f8a', accent: '#c99a6b' },
  panel: { top: '#c9a274', left: '#b28a5e', right: '#8f6c46', accent: '#dcb68d' },
} satisfies Record<string, Material>

/** Materials the wall-colour items paint the walls with. */
export const WALL_WASHES = {
  cream: { left: '#f6ead8', right: '#eedcc2' },
  sage: { left: '#bccbb2', right: '#a7b89b' },
  rose: { left: '#e6c1bd', right: '#d9a5a0' },
  teal: { left: '#9dc0bd', right: '#7fa8a4' },
} satisfies Record<string, { left: string; right: string }>

/** Untyped views of the tables above, for the handful of call sites that look
 *  a material up by a key that is only known at runtime. */
const materialsByKey: Record<string, Material> = MATERIALS
const washesByKey: Record<string, { left: string; right: string }> = WALL_WASHES

export function materialFor(key: string): Material {
  return materialsByKey[key] ?? MATERIALS.oak
}

export function washFor(key: string): { left: string; right: string } | undefined {
  return washesByKey[key]
}

/** Splits an `art_key` of the form "shape/material". */
export function parseArtKey(artKey: string): { shape: string; material: string } {
  const slash = artKey.indexOf('/')
  if (slash === -1) return { shape: artKey, material: 'oak' }
  return { shape: artKey.slice(0, slash), material: artKey.slice(slash + 1) }
}
