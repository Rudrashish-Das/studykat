import { useCallback, useEffect, useMemo, useState } from 'react'
import { Room } from '@/components/room/Room'
import {
  SURFACE_CATEGORIES,
  activeSurface,
  isSurface,
  type SurfaceCategory,
} from '@/components/room/surfaces'
import { Furniture } from '@/components/room/Furniture'
import { Button } from '@/components/ui/Button'
import { Notice } from '@/components/ui/Notice'
import { FullScreenSpinner } from '@/components/ui/Spinner'
import { useProfile } from '@/lib/queries/profile'
import { ClockTimeZone } from '@/lib/daynight'
import {
  useCatalog,
  useInventory,
  useMoveItem,
  usePlaceItem,
  usePlacedItems,
  useStoreItem,
} from '@/lib/queries/room'
import { useCatAppearance } from '@/lib/cat/useCatAppearance'
import { useCatWander } from '@/lib/cat/useCatWander'
import { GRID_SIZE, WALL_LAYER, canPlace, wallSpotOf, type Placement } from '@/lib/iso/projection'
import { cn } from '@/lib/cn'
import type { CatalogItem } from '@/lib/supabase/types'

/**
 * Arranging the room. Click a tile to move the selected item there; arrow keys
 * do the same for anyone not using a mouse (§9). Placement is optimistic —
 * moving a chair is cheap to undo and not worth a spinner.
 */
export function RoomEditor() {
  const { data: profile } = useProfile()
  const { placed, isPending } = usePlacedItems()
  const catalog = useCatalog()
  const inventory = useInventory()
  const moveItem = useMoveItem()
  const placeItem = usePlaceItem()
  const storeItem = useStoreItem()

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [hoverTile, setHoverTile] = useState<{ gx: number; gy: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const appearance = useCatAppearance(profile)
  const catTile = useCatWander({ placed, mode: 'still' })

  const selected = placed.find((p) => p.id === selectedId) ?? null

  const owned = useMemo(() => {
    const byId = new Map((catalog.data ?? []).map((item) => [item.id, item]))
    return (inventory.data ?? [])
      .map((row) => byId.get(row.item_id))
      .filter((item): item is CatalogItem => item !== undefined)
  }, [inventory.data, catalog.data])

  /** Everything owned but not currently in the room. Surfaces have their own picker. */
  const stored = useMemo(() => {
    const placedIds = new Set(placed.map((p) => p.item_id))
    return owned.filter((item) => !isSurface(item) && !placedIds.has(item.id))
  }, [placed, owned])

  /** Owned floors, walls and washes, by category, with the one on show. */
  const surfaceGroups = useMemo(
    () =>
      SURFACE_CATEGORIES.map((category) => ({
        category,
        items: owned.filter((item) => item.category === category),
        activeId: activeSurface(placed, category)?.item_id ?? null,
      })).filter((group) => group.items.length > 0),
    [owned, placed],
  )

  /**
   * Swaps the room's floor, wall or wash. The room shows one of each, so the
   * old one goes back to storage rather than lingering underneath. The new one
   * goes in first so the room never flashes bare.
   */
  const applySurface = useCallback(
    (item: CatalogItem) => {
      const category = item.category as SurfaceCategory
      const others = placed.filter((p) => p.item.category === category && p.item_id !== item.id)
      const clearOthers = () => others.forEach((p) => storeItem.mutate(p.id))
      setError(null)
      if (placed.some((p) => p.item_id === item.id)) {
        clearOthers()
      } else {
        placeItem.mutate(
          { itemId: item.id, gx: 0, gy: 0 },
          {
            onSuccess: clearOthers,
            onError: () => setError('That did not stick. Try again in a moment.'),
          },
        )
      }
    },
    [placed, placeItem, storeItem],
  )

  /** Existing footprints, for the collision check. */
  const placements: Placement[] = useMemo(
    () =>
      placed
        .filter((p) => p.item.layer === 2)
        .map((p) => ({
          id: p.id,
          gx: p.grid_x,
          gy: p.grid_y,
          w: p.item.footprint_w,
          h: p.item.footprint_h,
          rotation: p.rotation,
        })),
    [placed],
  )

  /** Where wall items already hang, one per wall tile. */
  const hung = useMemo(
    () =>
      placed
        .filter((p) => p.item.layer === WALL_LAYER)
        .map((p) => ({ id: p.id, ...wallSpotOf(p.grid_x, p.grid_y) })),
    [placed],
  )

  const tryMove = useCallback(
    (gx: number, gy: number, rotation?: number) => {
      if (!selected) return
      if (selected.item.layer === WALL_LAYER) {
        // Wall items go on the wall nearest the click, never out on the floor.
        const spot = wallSpotOf(gx, gy)
        if (!wallSpotFree(hung, spot, selected.id)) {
          setError('Something already hangs there.')
          return
        }
        setError(null)
        moveItem.mutate({ id: selected.id, gx: spot.gx, gy: spot.gy, rotation: rotation ?? selected.rotation })
        return
      }
      const candidate: Placement = {
        id: selected.id,
        gx,
        gy,
        w: selected.item.footprint_w,
        h: selected.item.footprint_h,
        rotation: rotation ?? selected.rotation,
      }
      // Room-wide surfaces have no position to speak of; skip the check.
      if (!isSurface(selected.item) && !canPlace(candidate, placements, { ignoreId: selected.id })) {
        setError('Something is already there.')
        return
      }
      setError(null)
      moveItem.mutate({ id: selected.id, gx, gy, rotation: candidate.rotation })
    },
    [selected, placements, hung, moveItem],
  )

  // Keyboard placement.
  useEffect(() => {
    if (!selected) return
    const onKey = (event: KeyboardEvent) => {
      const deltas: Record<string, [number, number]> = {
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
      }
      const delta = deltas[event.key]
      if (delta) {
        event.preventDefault()
        tryMove(
          Math.min(Math.max(selected.grid_x + delta[0], 0), GRID_SIZE - 1),
          Math.min(Math.max(selected.grid_y + delta[1], 0), GRID_SIZE - 1),
        )
      } else if (event.key === 'r' || event.key === 'R') {
        event.preventDefault()
        tryMove(selected.grid_x, selected.grid_y, (selected.rotation + 1) % 4)
      } else if (event.key === 'Escape') {
        setSelectedId(null)
      } else if (event.key === 'Backspace' || event.key === 'Delete') {
        event.preventDefault()
        storeItem.mutate(selected.id)
        setSelectedId(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected, tryMove, storeItem])

  if (isPending || !profile || !appearance) {
    return <FullScreenSpinner label="Moving the furniture" />
  }

  const hoverWall = selected?.item.layer === WALL_LAYER && hoverTile ? wallSpotOf(hoverTile.gx, hoverTile.gy) : null
  const ghost =
    selected && hoverWall
      ? {
          artKey: selected.item.art_key,
          gx: hoverWall.gx,
          gy: hoverWall.gy,
          w: selected.item.footprint_w,
          h: selected.item.footprint_h,
          rotation: selected.rotation,
          valid: wallSpotFree(hung, hoverWall, selected.id),
        }
      : selected && hoverTile
      ? {
          artKey: selected.item.art_key,
          gx: hoverTile.gx,
          gy: hoverTile.gy,
          w: selected.item.footprint_w,
          h: selected.item.footprint_h,
          rotation: selected.rotation,
          valid: canPlace(
            {
              id: selected.id,
              gx: hoverTile.gx,
              gy: hoverTile.gy,
              w: selected.item.footprint_w,
              h: selected.item.footprint_h,
              rotation: selected.rotation,
            },
            placements,
            { ignoreId: selected.id },
          ),
        }
      : null

  return (
    <div className="mx-auto w-full max-w-5xl lg:max-w-7xl 2xl:max-w-[96rem] px-4 pb-10 pt-4 sm:px-5">
      <h1 className="text-2xl sm:text-3xl">Arrange the room</h1>
      <p className="mt-1 text-sm text-ink-soft">
        Pick something, then click where it goes. Arrow keys move it, <kbd>R</kbd> rotates,{' '}
        <kbd>Backspace</kbd> puts it away.
      </p>

      <ClockTimeZone.Provider value={profile.timezone}>
        <Room
          placed={placed}
          cat={appearance}
          catPose="idle"
          catTile={catTile}
          className="mt-5"
          interactive
          selectedId={selectedId}
          ghost={ghost}
          onHoverTile={setHoverTile}
          onItemClick={(id) => {
            setSelectedId(id)
            setError(null)
          }}
          onTileClick={(gx, gy) => {
            if (selected) tryMove(gx, gy)
          }}
        />
      </ClockTimeZone.Provider>

      {error && (
        <Notice tone="error" className="mt-4">
          {error}
        </Notice>
      )}

      {selected && (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-cozy border border-ink-line/70 bg-paper p-4 shadow-cozy">
          <span className="font-bold">{selected.item.name}</span>
          <Button
            variant="secondary"
            onClick={() => tryMove(selected.grid_x, selected.grid_y, (selected.rotation + 1) % 4)}
          >
            Rotate
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              storeItem.mutate(selected.id)
              setSelectedId(null)
            }}
          >
            Put away
          </Button>
          <Button variant="ghost" onClick={() => setSelectedId(null)}>
            Done
          </Button>
        </div>
      )}

      {surfaceGroups.length > 0 && (
        <section className="mt-8">
          <h2 className="text-lg">Floors &amp; walls</h2>
          {surfaceGroups.map((group) => (
            <div key={group.category} className="mt-3">
              <h3 className="text-sm font-bold text-ink-soft">{SURFACE_LABELS[group.category]}</h3>
              <ul className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
                {group.items.map((item) => {
                  const active = item.id === group.activeId
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        aria-pressed={active}
                        className={cn(
                          'w-full rounded-xl border bg-paper p-2 text-left',
                          'transition-colors duration-cozy ease-cozy hover:border-wood',
                          active ? 'border-wood ring-2 ring-wood/40' : 'border-ink-line/70',
                        )}
                        onClick={() => {
                          if (active && group.category === 'wallcolor') {
                            // A wash is optional: tapping the one on show takes it off.
                            const row = placed.find((p) => p.item_id === item.id)
                            if (row) storeItem.mutate(row.id)
                          } else if (!active) {
                            applySurface(item)
                          }
                        }}
                      >
                        <svg viewBox="-60 -80 120 110" className="h-16 w-full" aria-hidden>
                          <Furniture
                            artKey={item.art_key}
                            footprintW={item.footprint_w}
                            footprintH={item.footprint_h}
                          />
                        </svg>
                        <span className="mt-1 block truncate text-xs font-bold">{item.name}</span>
                        <span className="block text-[11px] text-ink-faint">
                          {active ? (group.category === 'wallcolor' ? 'On — tap to remove' : 'In use') : 'Use this'}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </section>
      )}

      <section className="mt-8">
        <h2 className="text-lg">Storage</h2>
        {stored.length === 0 ? (
          <p className="mt-2 text-sm text-ink-faint">
            Everything you own is out. The shop has more.
          </p>
        ) : (
          <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {stored.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className={cn(
                    'w-full rounded-xl border border-ink-line/70 bg-paper p-2 text-left',
                    'transition-colors duration-cozy ease-cozy hover:border-wood',
                  )}
                  onClick={() => {
                    // Drop it on the first free tile, then let the user move it.
                    const spot =
                      item.layer === WALL_LAYER ? firstFreeWallTile(hung) : firstFreeTile(placements, item)
                    if (!spot) {
                      setError('No room for that until you move something.')
                      return
                    }
                    placeItem.mutate(
                      { itemId: item.id, gx: spot.gx, gy: spot.gy },
                      { onSuccess: (row) => setSelectedId(row.id) },
                    )
                  }}
                >
                  <svg viewBox="-60 -80 120 110" className="h-16 w-full" aria-hidden>
                    <Furniture
                      artKey={item.art_key}
                      footprintW={item.footprint_w}
                      footprintH={item.footprint_h}
                    />
                  </svg>
                  <span className="mt-1 block truncate text-xs font-bold">{item.name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

const SURFACE_LABELS: Record<SurfaceCategory, string> = {
  floor: 'Floor',
  wall: 'Walls',
  wallcolor: 'Wall colour',
}

interface Hung {
  id: string
  gx: number
  gy: number
}

function wallSpotFree(hung: Hung[], spot: { gx: number; gy: number }, ignoreId?: string): boolean {
  return !hung.some((h) => h.id !== ignoreId && h.gx === spot.gx && h.gy === spot.gy)
}

/** The first empty wall tile, working out from the back corner along each wall in turn. */
function firstFreeWallTile(hung: Hung[]): { gx: number; gy: number } | null {
  for (let i = 1; i < GRID_SIZE; i += 1) {
    for (const spot of [wallSpotOf(i, 0), wallSpotOf(0, i)]) {
      if (wallSpotFree(hung, spot)) return { gx: spot.gx, gy: spot.gy }
    }
  }
  return wallSpotFree(hung, { gx: 0, gy: 0 }) ? { gx: 0, gy: 0 } : null
}

function firstFreeTile(
  placements: Placement[],
  item: CatalogItem,
): { gx: number; gy: number } | null {
  for (let gy = 0; gy < GRID_SIZE; gy += 1) {
    for (let gx = 0; gx < GRID_SIZE; gx += 1) {
      const candidate: Placement = {
        id: '__new__',
        gx,
        gy,
        w: item.footprint_w,
        h: item.footprint_h,
        rotation: 0,
      }
      if (canPlace(candidate, placements)) return { gx, gy }
    }
  }
  return null
}
