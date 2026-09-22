import type { ReactNode } from 'react'
import { flameTier } from '@/lib/economy/streak'
import { formatMinutes } from '@/lib/timer'
import { cn } from '@/lib/cn'

/**
 * The HUD. Three numbers, quietly: coins, streak, today against your goal.
 * Everything here also has a non-numeric reading — the flame grows, the ring
 * fills — because §8 asks for progress that is legible without reading.
 */
export function Hud({
  coins,
  streak,
  minutesToday,
  goalMinutes,
  className,
}: {
  coins: number
  streak: number
  minutesToday: number
  goalMinutes: number
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-pill border border-ink-line/70 bg-paper/90 px-3 py-2 shadow-cozy backdrop-blur sm:gap-4 sm:px-5',
        className,
      )}
    >
      <Coins amount={coins} />
      <span aria-hidden className="h-6 w-px bg-ink-line" />
      <StreakFlame days={streak} />
      <span aria-hidden className="h-6 w-px bg-ink-line" />
      <GoalRing minutes={minutesToday} goal={goalMinutes} />
    </div>
  )
}

/**
 * One HUD stat: an icon and a number that read as a single thing.
 *
 * The icons are different shapes at different intrinsic sizes, so each sits in
 * a square box of the same height — centring the *boxes* is what keeps the
 * glyphs on the same optical line as the text, however the glyph inside grows.
 *
 * `label` is both the hover tooltip and the screen-reader name. The number
 * beside it is then decorative: `role="img"` makes this a leaf, so the label is
 * announced once instead of the icon and the digits being read separately.
 */
function Stat({
  label,
  icon,
  box,
  children,
}: {
  label: string
  icon: ReactNode
  box: number
  children: ReactNode
}) {
  return (
    <span className="flex items-center gap-1.5" role="img" aria-label={label} title={label}>
      <span
        className="flex shrink-0 items-center justify-center"
        style={{ width: box, height: box }}
      >
        {icon}
      </span>
      <span aria-hidden className="text-sm font-extrabold tabular-nums">
        {children}
      </span>
    </span>
  )
}

export function Coins({ amount, className }: { amount: number; className?: string }) {
  return (
    <span className={cn('flex items-center', className)}>
      <Stat
        label={`${amount.toLocaleString()} coins — spend them in the shop`}
        icon={<CoinMark />}
        box={22}
      >
        {amount.toLocaleString()}
      </Stat>
    </span>
  )
}

export function CoinMark({ size = 18 }: { size?: number }) {
  return (
    <svg viewBox="0 0 20 20" width={size} height={size} aria-hidden className="shrink-0">
      <circle cx="10" cy="10" r="8" fill="#e3b755" stroke="#4a3b34" strokeWidth="1.6" />
      <circle cx="10" cy="10" r="4.6" fill="#f0cd7e" stroke="#4a3b34" strokeWidth="1.1" />
    </svg>
  )
}

/**
 * The flame grows at 3 / 7 / 14 / 30 / 100 days — the same tiers as
 * `flameTier`. A zero streak shows an unlit ember rather than nothing, so the
 * HUD does not change shape the moment a streak starts.
 */
export function StreakFlame({ days, size = 22 }: { days: number; size?: number }) {
  const tier = flameTier(days)
  const lit = days > 0

  // Each tier adds height and a brighter core. It scales about its centre, not
  // its base: anchored at the bottom, a small flame sits low in its own box and
  // reads as misaligned against the coin and the ring beside it.
  const scale = [0.74, 0.86, 1, 1.12, 1.24, 1.38][tier] ?? 1
  const outer = lit ? '#e08a4a' : '#c4b6a6'
  const mid = lit ? '#f0b05e' : '#d6cabc'
  const core = lit ? '#f7dc95' : '#e6ddd2'

  return (
    <Stat
      label={lit ? `${days} day streak — study every day to keep it` : 'No streak yet — study today to start one'}
      icon={
        <svg
          viewBox="0 0 24 28"
          width={size}
          height={size * 1.16}
          aria-hidden
          className="shrink-0 overflow-visible"
          style={{ transform: `scale(${scale})`, transformOrigin: 'center' }}
        >
          <path
            d="M12 2 C 16 8 20 10 20 16 C 20 21.5 16.4 25 12 25 C 7.6 25 4 21.5 4 16 C 4 11 7 9 9 5 C 10 8 11 9 12 2 Z"
            fill={outer}
            stroke="#4a3b34"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          <path
            d="M12 9 C 14.4 12.4 16 14 16 17 C 16 20 14.2 22 12 22 C 9.8 22 8 20 8 17 C 8 14.4 10 12.6 12 9 Z"
            fill={mid}
          />
          {tier >= 3 && <ellipse cx="12" cy="18.5" rx="2.4" ry="3.2" fill={core} />}
          {/* At the top tiers a couple of embers drift off it. */}
          {tier >= 4 && (
            <g fill={mid} opacity="0.85">
              <circle cx="18" cy="7" r="1.5" />
              <circle cx="6" cy="5" r="1.1" />
            </g>
          )}
          {tier >= 5 && <circle cx="14" cy="1.5" r="1.3" fill={core} />}
        </svg>
      }
      // Sized for the largest flame so the row does not shift as the streak grows.
      box={size * 1.16}
    >
      {days}
    </Stat>
  )
}

/** Today against the goal, as a ring that fills. */
export function GoalRing({
  minutes,
  goal,
  size = 26,
}: {
  minutes: number
  goal: number
  size?: number
}) {
  const progress = goal > 0 ? Math.min(minutes / goal, 1) : 0
  const radius = 10
  const circumference = 2 * Math.PI * radius
  const met = minutes >= goal

  return (
    <Stat
      label={
        met
          ? `${formatMinutes(minutes)} studied today — daily goal of ${formatMinutes(goal)} met`
          : `${formatMinutes(minutes)} studied today of your ${formatMinutes(goal)} goal`
      }
      icon={
        <svg
          viewBox="0 0 26 26"
          width={size}
          height={size}
          aria-hidden
          className="shrink-0 -rotate-90"
        >
          <circle cx="13" cy="13" r={radius} fill="none" strokeWidth="4" className="stroke-ink-line" />
          <circle
            cx="13"
            cy="13"
            r={radius}
            fill="none"
            stroke={met ? '#7f9472' : '#c99a6b'}
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - progress)}
            className="transition-[stroke-dashoffset] duration-700 ease-cozy"
          />
        </svg>
      }
      box={size}
    >
      {formatMinutes(minutes)}
      <span className="font-bold text-ink-faint"> / {formatMinutes(goal)}</span>
    </Stat>
  )
}
