import { Link, NavLink } from 'react-router-dom'
import { paths } from '@/lib/paths'
import { cn } from '@/lib/cn'

const links = [
  { to: paths.home, label: 'Room' },
  { to: paths.shop, label: 'Shop' },
  { to: paths.stats, label: 'Stats' },
  { to: paths.settings, label: 'Settings' },
] as const

/**
 * Desktop: a quiet bar across the top. Mobile: the same links pinned to the
 * bottom, per §9 — the HUD and navigation belong under the thumb.
 *
 * On a phone it is `fixed`, not `sticky`: a sticky bar is part of the page, so
 * the browser's overscroll bounce at the bottom dragged it up with the content.
 * AppShell pads <main> by the bar's height to make room.
 */
export function NavBar() {
  return (
    <nav
      aria-label="Main"
      className={cn(
        'fixed inset-x-0 bottom-0 z-20 border-t border-ink-line/70 bg-paper/90 pb-[env(safe-area-inset-bottom)] backdrop-blur',
        'sm:sticky sm:bottom-auto sm:top-0 sm:order-first sm:border-b sm:border-t-0 sm:pb-0',
      )}
    >
      <div className="mx-auto flex w-full max-w-5xl items-center gap-1 px-3 py-2 sm:gap-2 sm:px-5 sm:py-3">
        {/* The wordmark reads as a logo, so it has to behave like one: back to
            the room, the way every other app's logo goes home. */}
        <Link
          to={paths.home}
          title="StudyKat — back to your room"
          className={cn(
            'mr-auto hidden select-none rounded-pill px-1 text-lg font-extrabold tracking-tight sm:block',
            'transition-colors duration-cozy ease-cozy hover:text-wood-deep',
          )}
        >
          Study<span className="text-wood-deep">Kat</span>
        </Link>
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            className={({ isActive }) =>
              cn(
                'flex-1 rounded-pill px-4 py-2 text-center text-sm font-bold transition-colors duration-cozy ease-cozy sm:flex-none',
                isActive ? 'bg-sage-light text-ink' : 'text-ink-soft hover:bg-cream-300/70 hover:text-ink',
              )
            }
          >
            {link.label}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
