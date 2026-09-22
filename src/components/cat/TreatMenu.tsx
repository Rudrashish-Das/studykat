import { useId, useState } from 'react'
import { CoinMark } from '@/components/hud/Hud'
import { Notice } from '@/components/ui/Notice'
import { FoodIcon } from './Food'
import { useCatFoods, useFeedCat } from '@/lib/queries/food'
import type { Meal } from '@/lib/cat/useCatLife'
import { cn } from '@/lib/cn'

const OPEN_KEY = 'studycat:treats-open'

function readOpen(): boolean {
  try {
    // Folded away until someone opens it.
    return localStorage.getItem(OPEN_KEY) === 'true'
  } catch {
    return false
  }
}

/**
 * A row of treats under the room. Each one is bought and handed to the cat in
 * one tap; the coins come off on the server, and the meal plays once they have.
 * It folds away to just its heading, and remembers which way it was left.
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
  const [open, setOpen] = useState(readOpen)
  const panelId = useId()

  function toggle() {
    const next = !open
    setOpen(next)
    try {
      localStorage.setItem(OPEN_KEY, String(next))
    } catch {
      /* private mode; it simply will not be remembered */
    }
  }

  // Only a settled, genuinely empty catalog hides the section — while it is
  // still loading, `data` is undefined and the section stays mounted, so it
  // does not pop in (and shove the rest of the page down) after the first paint.
  if (foods.data && foods.data.length === 0) return null

  return (
    <section
      aria-labelledby="treats-heading"
      className={cn('rounded-cozy border border-ink-line/70 bg-paper p-4 shadow-cozy sm:p-5', className)}
    >
      <h2 id="treats-heading" className="text-base">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={toggle}
          className="-m-1 flex w-[calc(100%+0.5rem)] items-center gap-2 rounded-lg p-1 text-left [@media(hover:hover)]:hover:bg-cream-100"
        >
          <span className="flex-1">Treats for {catName}</span>
          {open && (
            <span className="hidden text-xs font-normal text-ink-faint sm:inline">
              Bought and eaten on the spot.
            </span>
          )}
          <svg
            viewBox="0 0 20 20"
            width="18"
            height="18"
            aria-hidden
            className={cn(
              'shrink-0 text-ink-soft transition-transform duration-cozy ease-cozy',
              open && 'rotate-180',
            )}
          >
            <path
              d="M5 8 L 10 13 L 15 8"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </h2>

      <div id={panelId} hidden={!open}>
        {error && (
          <Notice tone="error" className="mt-3">
            {error}
          </Notice>
        )}

        <ul className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6 lg:grid-cols-3">
          {(foods.data ?? []).map((food) => {
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
                    '[@media(hover:hover)]:hover:-translate-y-0.5 [@media(hover:hover)]:hover:bg-cream-200 active:translate-y-px',
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
      </div>
    </section>
  )
}

function friendlyFeedError(raw: string): string {
  const message = raw.toLowerCase()
  if (message.includes('not enough coins')) return 'Not quite enough coins for that one.'
  return raw
}
