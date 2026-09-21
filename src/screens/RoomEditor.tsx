import { useEffect, useMemo, useState } from 'react'
import { Room } from '@/components/room/Room'
import { Furniture } from '@/components/room/Furniture'
import { Button } from '@/components/ui/Button'
import { Notice } from '@/components/ui/Notice'
import { FullScreenSpinner } from '@/components/ui/Spinner'
import { useProfile } from '@/lib/queries/profile'
import {
  useCatalog,
  useInventory,
  useMoveItem,
  usePlaceItem,
  usePlacedItems,
  useStoreItem,
} from '@/lib/queries/room'
import { generateAppearance } from '@/lib/cat/appearance'
import { useCatWander } from '@/lib/cat/useCatWander'
import { GRID_SIZE, canPlace, type Placement } from '@/lib/iso/projection'
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

  const appearance = useMemo(
    () => (profile ? generateAppearance(profile.cat_seed, profile.cat_variant) : null),
    [profile?.cat_seed, profile?.cat_variant],
  )
  const catTile = useCatWander({ placed, mode: 'still' })

  const selected = placed.find((p) => p.id === selectedId) ?? null

  /** Everything owned but not currently in the room. */
  const stored = useMemo(() => {
    const placedIds = new Set(placed.map((p) => p.item_id))
    const byId = new Map((catalog.data ?? []).map((item) => [item.id, item]))
    return (inventory.data ?? [])
      .map((row) => byId.get(row.item_id))
      .filter((item): item is CatalogItem => Boolean(item) && !placedIds.has(item!.id))
  }, [placed, inventory.data, catalog.data])

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

  function tryMove(gx: number, gy: number, rotation?: number) {
    if (!selected) return
    const candidate: Placement = {
      id: selected.id,
      gx,
      gy,
      w: selected.item.footprint_w,
      h: selected.item.footprint_h,
      rotation: rotation ?? selected.rotation,
    }
    // Room-wide surfaces have no position to speak of; skip the check.
    const isSurface = ['floor', 'wall', 'wallcolor'].includes(selected.item.category)
    if (!isSurface && !canPlace(candidate, placements, { ignoreId: selected.id })) {
      setError('Something is already there.')
      return
    }
    setError(null)
    moveItem.mutate({ id: selected.id, gx, gy, rotation: candidate.rotation })
  }

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
  }, [selected, placements])

  if (isPending || !profile || !appearance) {
    return <FullScreenSpinner label="Moving the furniture" />
  }

  const ghost =
    selected && hoverTile
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
    <div className="mx-auto w-full max-w-5xl px-4 pb-10 pt-4 sm:px-5">
      <h1 className="text-2xl sm:text-3xl">Arrange the room</h1>
      <p className="mt-1 text-sm text-ink-soft">
        Pick something, then click where it goes. Arrow keys move it, <kbd>R</kbd> rotates,{' '}
        <kbd>Backspace</kbd> puts it away.
      </p>

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
                    const spot = firstFreeTile(placements, item)
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
