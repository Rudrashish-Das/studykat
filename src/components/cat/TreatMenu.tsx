import { useState } from 'react'
import { CoinMark } from '@/components/hud/Hud'
import { Notice } from '@/components/ui/Notice'
import { FoodIcon } from './Food'
import { useCatFoods, useFeedCat } from '@/lib/queries/food'
import type { Meal } from '@/lib/cat/useCatLife'
import { cn } from '@/lib/cn'

/**
 * A row of treats under the room. Each one is bought and handed to the cat in
 * one tap; the coins come off on the server, and the meal plays once they have.
 */
export function TreatMenu({
  catName,
  coins,
  eating,
  onFed,
  className,
}: {
  catName: string
  coins: number
  /** The cat is mid-meal, so the menu waits for it. */
  eating: boolean
  onFed: (meal: Meal) => void
  className?: string
}) {
  const foods = useCatFoods()
  const feed = useFeedCat()
  const [error, setError] = useState<string | null>(null)

  if (!foods.data || foods.data.length === 0) return null

  return (
    <section
      aria-labelledby="treats-heading"
      className={cn('rounded-cozy border border-ink-line/70 bg-paper p-4 shadow-cozy sm:p-5', className)}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id="treats-heading" className="text-base">
          Treats for {catName}
        </h2>
        <p className="text-xs text-ink-faint">Bought and eaten on the spot.</p>
      </div>

      {error && (
        <Notice tone="error" className="mt-3">
          {error}
        </Notice>
      )}

      <ul className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
        {foods.data.map((food) => {
          const affordable = coins >= food.price
          const busy = feed.isPending && feed.variables?.id === food.id
          return (
            <li key={food.id}>
              <button
                type="button"
                disabled={!affordable || eating || feed.isPending}
                title={food.description ?? undefined}
                aria-label={`Feed ${catName} ${food.name.toLowerCase()} for ${food.price} coins`}
                onClick={() => {
                  setError(null)
                  feed.mutate(food, {
                    onSuccess: () => onFed({ name: food.name, artKey: food.art_key }),
                    onError: (err: Error) => setError(friendlyFeedError(err.message)),
                  })
                }}
                className={cn(
                  'flex w-full flex-col items-center gap-1 rounded-xl bg-cream-100 px-2 pb-2 pt-3 text-center',
                  'transition-[transform,background-color] duration-cozy ease-cozy',
                  'hover:-translate-y-0.5 hover:bg-cream-200 active:translate-y-px',
                  'disabled:pointer-events-none disabled:opacity-55',
                  busy && 'animate-pulse',
                )}
              >
                <FoodIcon artKey={food.art_key} className="h-9 w-12" />
                <span className="text-xs font-bold leading-tight">{food.name}</span>
                <span className="flex items-center gap-1 text-xs font-extrabold tabular-nums text-ink-soft">
                  <CoinMark size={12} />
                  {food.price}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function friendlyFeedError(raw: string): string {
  const message = raw.toLowerCase()
  if (message.includes('not enough coins')) return 'Not quite enough coins for that one.'
  return raw
}
