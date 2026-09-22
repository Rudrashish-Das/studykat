import { useMemo, useState } from 'react'
import { Hud } from '@/components/hud/Hud'
import { CoinMark } from '@/components/hud/Hud'
import { FurniturePreview } from '@/components/room/FurniturePreview'
import { Button } from '@/components/ui/Button'
import { Notice } from '@/components/ui/Notice'
import { FullScreenSpinner } from '@/components/ui/Spinner'
import { useProfile } from '@/lib/queries/profile'
import { useToday } from '@/lib/queries/sessions'
import {
  describeUnlock,
  isUnlocked,
  useCatalog,
  useInventory,
  usePurchase,
  type UnlockContext,
} from '@/lib/queries/room'
import type { CatalogItem, ItemCategory } from '@/lib/supabase/types'
import { cn } from '@/lib/cn'

const CATEGORY_LABELS: Record<ItemCategory, string> = {
  furniture: 'Furniture',
  rug: 'Rugs',
  plant: 'Plants',
  light: 'Lighting',
  toy: 'Toys',
  decor: 'Decor',
  floor: 'Flooring',
  wall: 'Walls',
  wallcolor: 'Wall colour',
}

const ORDER: ItemCategory[] = [
  'furniture',
  'rug',
  'plant',
  'light',
  'toy',
  'decor',
  'floor',
  'wall',
  'wallcolor',
]

export function Shop() {
  const catalog = useCatalog()
  const inventory = useInventory()
  const today = useToday()
  const { data: profile } = useProfile()
  const purchase = usePurchase()

  const [category, setCategory] = useState<ItemCategory>('furniture')
  const [error, setError] = useState<string | null>(null)

  const owned = useMemo(
    () => new Set((inventory.data ?? []).map((row) => row.item_id)),
    [inventory.data],
  )

  const context: UnlockContext = {
    currentStreak: today.data?.current_streak ?? 0,
    longestStreak: today.data?.longest_streak ?? 0,
    lifetimeSeconds: today.data?.lifetime_seconds ?? 0,
    lifetimeCoins: today.data?.lifetime_coins ?? 0,
  }

  const coins = today.data?.coins ?? 0
  const items = (catalog.data ?? []).filter((item) => item.category === category)

  if (catalog.isPending || inventory.isPending) {
    return <FullScreenSpinner label="Opening the shop" />
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-10 pt-4 sm:px-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl">Shop</h1>
          <p className="text-sm text-ink-soft">Everything here stays bought.</p>
        </div>
        <Hud
          coins={coins}
          streak={today.data?.current_streak ?? 0}
          minutesToday={today.data?.minutes_today ?? 0}
          goalMinutes={today.data?.daily_goal_minutes ?? profile?.daily_goal_minutes ?? 60}
          className="order-first w-full justify-between sm:order-none sm:w-auto"
        />
      </div>

      {/* Categories. Horizontally scrollable on a phone rather than wrapping
          into four rows of chips. */}
      <div className="sc-no-scrollbar -mx-4 mt-5 overflow-x-auto px-4 [mask-image:linear-gradient(to_right,#000_calc(100%-1rem),transparent)] sm:mx-0 sm:px-0 sm:[mask-image:none]">
        <div role="tablist" aria-label="Categories" className="flex w-max gap-2 pb-1">
          {ORDER.map((key) => (
            <button
              key={key}
              role="tab"
              aria-selected={category === key}
              onClick={() => setCategory(key)}
              className={cn(
                'whitespace-nowrap rounded-pill px-4 py-2 text-sm font-bold transition-colors duration-cozy ease-cozy',
                category === key
                  ? 'bg-wood-deep text-paper'
                  : 'bg-paper text-ink-soft hover:bg-cream-300',
              )}
            >
              {CATEGORY_LABELS[key]}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <Notice tone="error" className="mt-5">
          {error}
        </Notice>
      )}

      {items.length === 0 ? (
        <p className="mt-10 text-center text-ink-faint">Nothing in this category yet.</p>
      ) : (
        <ul className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <ShopCard
              key={item.id}
              item={item}
              owned={owned.has(item.id)}
              unlocked={isUnlocked(item, context)}
              affordable={coins >= item.price}
              busy={purchase.isPending && purchase.variables === item.id}
              onBuy={() => {
                setError(null)
                purchase.mutate(item.id, {
                  onError: (err: Error) => setError(friendlyPurchaseError(err.message)),
                })
              }}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

function ShopCard({
  item,
  owned,
  unlocked,
  affordable,
  busy,
  onBuy,
}: {
  item: CatalogItem
  owned: boolean
  unlocked: boolean
  affordable: boolean
  busy: boolean
  onBuy: () => void
}) {
  const lockNote = describeUnlock(item)

  return (
    <li className="flex flex-col rounded-cozy border border-ink-line/70 bg-paper p-4 shadow-cozy">
      {/* A real preview, drawn with the same renderer the room uses. */}
      <div className="grid h-28 place-items-center rounded-xl bg-cream-100">
        <FurniturePreview
          artKey={item.art_key}
          footprintW={item.footprint_w}
          footprintH={item.footprint_h}
          className="h-full w-full"
          opacity={unlocked ? 1 : 0.45}
        />
      </div>

      <h2 className="mt-3 text-base">{item.name}</h2>
      {item.description && <p className="mt-1 text-sm text-ink-soft">{item.description}</p>}

      <div className="mt-auto flex items-center justify-between gap-3 pt-4">
        <span className="flex items-center gap-1.5 text-sm font-extrabold tabular-nums">
          {item.price === 0 ? (
            <span className="text-sage-deep">Free</span>
          ) : (
            <>
              <CoinMark size={16} />
              {item.price.toLocaleString()}
            </>
          )}
        </span>

        {owned ? (
          <span className="rounded-pill bg-sage-light px-3 py-1.5 text-xs font-bold">Owned</span>
        ) : !unlocked ? (
          <span className="text-right text-xs font-bold text-ink-faint">{lockNote}</span>
        ) : (
          <Button onClick={onBuy} disabled={!affordable || busy}>
            {busy ? 'Buying…' : affordable ? 'Buy' : 'Not yet'}
          </Button>
        )}
      </div>
    </li>
  )
}

function friendlyPurchaseError(raw: string): string {
  const message = raw.toLowerCase()
  if (message.includes('not enough coins')) return 'Not quite enough coins for that one yet.'
  if (message.includes('already owned')) return 'You already own that.'
  if (message.includes('locked')) return 'That one is still locked.'
  return raw
}
