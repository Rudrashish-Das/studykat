import { memo } from 'react'
import { cn } from '@/lib/cn'

/**
 * Cat food, drawn the same way as everything else: flat fills, the warm
 * outline, one light from the upper left. Each food is drawn sitting in a
 * shallow dish centred on (20, 13) of a 40 x 30 box, so the menu can show it
 * on its own and the room can put it in the bowl without re-positioning.
 */

const OUTLINE = '#4a3b34'

function FoodPile({ artKey }: { artKey: string }) {
  switch (artKey) {
    case 'kibble':
      return (
        <g>
          {[
            [13, 12], [18, 10], [23, 11], [27, 13], [16, 14], [21, 14], [25, 15], [20, 7.5],
          ].map(([x, y]) => (
            <circle key={`${x}-${y}`} cx={x} cy={y} r="2.6" fill="#b07a4f" />
          ))}
          <circle cx="17.2" cy="9.2" r="0.8" fill="#e2b98f" stroke="none" />
          <circle cx="22.2" cy="10.2" r="0.8" fill="#e2b98f" stroke="none" />
        </g>
      )
    case 'biscuits':
      return (
        <g>
          {[
            { x: 12, y: 13, r: -10 },
            { x: 20, y: 10, r: 8 },
            { x: 25, y: 14, r: -4 },
            { x: 17, y: 15, r: 14 },
          ].map(({ x, y, r }) => (
            <g key={`${x}-${y}`} transform={`rotate(${r} ${x} ${y})`}>
              <path d={`M${x + 3} ${y} l 3 -2.4 l 0 4.8 z`} fill="#d98f4e" />
              <ellipse cx={x} cy={y} rx="4" ry="2.4" fill="#e9a45f" />
              <circle cx={x - 2} cy={y - 0.4} r="0.6" fill={OUTLINE} stroke="none" />
            </g>
          ))}
        </g>
      )
    case 'chicken':
      return (
        <g>
          <path d="M10 14 C 10 8 16 6 20 7 C 25 6 30 9 30 14 Z" fill="#efd9b4" />
          <path d="M14 10 L 18 12 M21 9 L 24 12 M17 7.5 L 19 9" fill="none" strokeWidth="1.2" opacity="0.6" />
          <ellipse cx="16" cy="9" rx="2.4" ry="1" fill="#fff5e4" stroke="none" />
        </g>
      )
    case 'sardine':
      return (
        <g>
          {/* Tail over the rim: it does not quite fit. */}
          <path d="M29 9 L 36 5 L 35 12 Z" fill="#7d93a6" />
          <path d="M8 12 C 12 6 24 6 30 9.5 C 24 14 12 15 8 12 Z" fill="#a9bccb" />
          <path d="M12 11 C 17 12 24 11.5 29 9.6" fill="none" strokeWidth="1" opacity="0.5" />
          <circle cx="11.5" cy="10.5" r="1" fill={OUTLINE} stroke="none" />
          <ellipse cx="18" cy="8.6" rx="4" ry="0.9" fill="#e6eef4" stroke="none" />
        </g>
      )
    case 'tuna':
      return (
        <g>
          <path d="M10 14 C 11 9 15 7 20 7 C 26 7 30 10 30 14 Z" fill="#c9776c" />
          <path d="M13 12 C 15 10 17 10 19 11 M21 9 C 23 9 25 10 26 12" fill="none" strokeWidth="1.1" opacity="0.55" />
          <ellipse cx="16" cy="9.4" rx="2.8" ry="1" fill="#e7a79d" stroke="none" />
        </g>
      )
    case 'salmon':
      return (
        <g>
          <path d="M9 13 C 10 7 17 6 21 6.5 C 27 7 31 10 30 14 Z" fill="#ee9a7a" />
          <g fill="none" stroke="#fbe1d4" strokeWidth="1.3">
            <path d="M14 13 C 14 10 16 8.5 18 8" />
            <path d="M19 13.5 C 19 10.5 21 8.5 23 8.2" />
            <path d="M24 13.5 C 24 11 25.5 9.5 27 9.4" />
          </g>
          <path d="M28 13.5 C 29.5 11 29 9 27.5 8" fill="none" stroke="#b9876f" strokeWidth="1.6" />
        </g>
      )
    default:
      return <circle cx="20" cy="11" r="4" fill="#b07a4f" />
  }
}

function Dish({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <g stroke={OUTLINE} strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round" className={className}>
      {/* Bowl body, then the food sitting in its mouth, then the front lip over it. */}
      <path d="M4 13 C 5 21 11 25 20 25 C 29 25 35 21 36 13 Z" fill="#9fb7c9" />
      <path d="M8 21 C 13 23.5 27 23.5 32 21" fill="none" stroke="#dbe6ee" strokeWidth="1.4" opacity="0.8" />
      <ellipse cx="20" cy="13" rx="16" ry="4.5" fill="#6f879a" />
      {children}
      <path d="M4 13 C 6 17 34 17 36 13" fill="none" />
    </g>
  )
}

/** The food alone in its dish, for the treat menu. */
export const FoodIcon = memo(function FoodIcon({
  artKey,
  className,
}: {
  artKey: string
  className?: string
}) {
  return (
    <svg viewBox="0 2 40 26" className={cn('overflow-visible', className)} aria-hidden>
      <Dish>
        <FoodPile artKey={artKey} />
      </Dish>
    </svg>
  )
})

/**
 * The bowl set down in front of the cat. It drops in, the food goes down in
 * bites while crumbs fly, and once `finished` it slides away empty.
 */
export function FoodBowl({
  artKey,
  finished,
  eatMs,
  className,
  style,
}: {
  artKey: string
  finished: boolean
  /** How long the food takes to go, so the last bite lands as the cat stops. */
  eatMs: number
  className?: string
  style?: React.CSSProperties
}) {
  return (
    <svg
      viewBox="0 0 40 30"
      aria-hidden
      className={cn('pointer-events-none overflow-visible', finished ? 'sc-bowl-leave' : 'sc-bowl-drop', className)}
      style={style}
    >
      <ellipse cx="20" cy="26" rx="17" ry="3.4" fill={OUTLINE} opacity="0.15" />
      <Dish>
        <g
          className="sc-food-eaten"
          style={{
            animationDuration: `${eatMs}ms`,
            transformBox: 'fill-box',
            transformOrigin: 'center bottom',
          }}
        >
          <FoodPile artKey={artKey} />
        </g>
      </Dish>
      {!finished &&
        CRUMBS.map((c) => (
          <circle
            key={c.x}
            cx={c.x}
            cy="9"
            r="1.2"
            fill={crumbColour(artKey)}
            className="sc-food-crumb"
            style={
              {
                '--sc-crumb-x': `${c.dx}px`,
                animationDelay: `${c.delay}s`,
                transformBox: 'fill-box',
                transformOrigin: 'center',
              } as React.CSSProperties
            }
          />
        ))}
    </svg>
  )
}

const CRUMBS = [
  { x: 14, dx: -7, delay: 0.5 },
  { x: 20, dx: 2, delay: 1.1 },
  { x: 26, dx: 8, delay: 0.8 },
  { x: 17, dx: -4, delay: 1.7 },
]

function crumbColour(artKey: string): string {
  switch (artKey) {
    case 'biscuits':
      return '#e9a45f'
    case 'chicken':
      return '#efd9b4'
    case 'sardine':
      return '#a9bccb'
    case 'tuna':
      return '#c9776c'
    case 'salmon':
      return '#ee9a7a'
    default:
      return '#b07a4f'
  }
}
