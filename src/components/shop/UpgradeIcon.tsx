import type { Upgrade } from '@/lib/preferences'

/**
 * Shop art for upgrades, which have no furniture drawing. Line icons in the
 * current text colour, so they sit in either theme.
 */
export function UpgradeIcon({ upgrade, className }: { upgrade: Upgrade; className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      {ICONS[upgrade]}
    </svg>
  )
}

const ICONS: Record<Upgrade, JSX.Element> = {
  chimes: (
    <>
      <path d="M10 8h28" />
      <path d="M15 8v18M24 8v26M33 8v14" />
      <rect x="12" y="26" width="6" height="8" rx="2" />
      <rect x="21" y="34" width="6" height="8" rx="2" />
      <rect x="30" y="22" width="6" height="8" rx="2" />
    </>
  ),
  'meow-alarm': (
    <>
      <path d="M12 38V16l7 6h10l7-6v22z" />
      <circle cx="20" cy="29" r="1.5" fill="currentColor" />
      <circle cx="28" cy="29" r="1.5" fill="currentColor" />
      <path d="M40 10l4-4M8 10L4 6" />
    </>
  ),
  'cat-voice': (
    <>
      <path d="M8 36V16l6 5h8l6-5v20z" />
      <path d="M33 20c3 2 3 10 0 12M38 16c6 4 6 16 0 20" />
    </>
  ),
  'room-sounds': (
    <>
      <circle cx="17" cy="30" r="9" />
      <path d="M11 26c4 2 8 6 9 12M14 22c4 4 9 6 12 6" />
      <path d="M31 14v18" />
      <circle cx="28" cy="32" r="3" />
      <path d="M31 14l9-3v4l-9 3" />
    </>
  ),
}
