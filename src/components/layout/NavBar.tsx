import { useEffect, useState, type MouseEvent } from 'react'
import { Link, useLocation } from 'react-router-dom'
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
  const location = useLocation()
  // The tab just tapped. A route change is a transition, so the location — and
  // with it the highlight — only moves once the new screen is ready; this
  // moves the highlight on the tap instead. Any navigation settles it.
  const [pending, setPending] = useState<string | null>(null)
  useEffect(() => setPending(null), [location.key])
  // Back and Forward are transitions too, with no tap to hang this on, so read
  // where the browser has already gone. (HashRouter: the path is the hash.)
  useEffect(() => {
    const onPop = () => {
      const path = window.location.hash.slice(1).split('?')[0]
      // An empty hash is the landing page.
      setPending(path?.length ? path : paths.landing)
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])
  const current = pending ?? location.pathname

  const press = (to: string) => (event: MouseEvent) => {
    // Modified clicks open a new tab; this page is not going anywhere.
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    setPending(to)
  }

  return (
    <nav
      aria-label="Main"
      className={cn(
        'fixed inset-x-0 bottom-0 z-20 border-t border-ink-line/70 bg-paper/90 pb-[env(safe-area-inset-bottom)] backdrop-blur',
        'sm:sticky sm:bottom-auto sm:top-0 sm:order-first sm:border-b sm:border-t-0 sm:pb-0',
      )}
    >
      <div className="mx-auto flex w-full max-w-5xl lg:max-w-7xl 2xl:max-w-[96rem] items-center gap-1 px-3 py-2 sm:gap-2 sm:px-5 sm:py-3">
        {/* The wordmark reads as a logo, so it has to behave like one: back to
            the room, the way every other app's logo goes home. */}
        <Link
          to={paths.home}
          onClick={press(paths.home)}
          title="StudyKat — back to your room"
          className={cn(
            'mr-auto hidden select-none rounded-pill px-1 text-lg font-extrabold tracking-tight sm:block',
            'transition-colors duration-cozy ease-cozy hover:text-wood-deep',
          )}
        >
          Study<span className="text-wood-deep">Kat</span>
        </Link>
        {links.map((link) => {
          const active = current === link.to || current.startsWith(`${link.to}/`)
          return (
            <Link
              key={link.to}
              to={link.to}
              onClick={press(link.to)}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex-1 rounded-pill px-4 py-2 text-center text-sm font-bold transition-colors duration-cozy ease-cozy sm:flex-none',
                active ? 'bg-sage-light text-ink' : 'text-ink-soft hover:bg-cream-300/70 hover:text-ink',
              )}
            >
              {link.label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
