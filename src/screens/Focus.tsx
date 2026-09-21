import { Link } from 'react-router-dom'
import { paths } from '@/lib/paths'

/**
 * Focus mode renders outside <AppShell> on purpose: while a session runs the
 * screen belongs to the timer. Dimmed palette, no navigation, no notifications.
 */
export function Focus() {
  return (
    <div className="flex min-h-full flex-col items-center justify-center bg-night px-5 py-12 text-cream">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-cream/50">Phase 3</p>
      <p className="mt-8 font-mono text-6xl font-bold tabular-nums sm:text-7xl">00:00:00</p>
      <p className="mt-4 max-w-sm text-center text-sm text-cream/70">
        The clock will be anchored to the database&apos;s <code>started_at</code> and recomputed from
        wall-clock on every tick, so it stays right across sleep, refresh, and a closed tab.
      </p>
      <p className="mt-2 max-w-sm text-center text-sm text-cream/50">
        Sessions under 5 minutes earn no coins and don&apos;t count toward your streak.
      </p>
      <Link
        to={paths.home}
        className="mt-10 rounded-pill border border-cream/25 px-6 py-2.5 text-sm font-bold text-cream/80 transition-colors duration-cozy ease-cozy hover:bg-cream/10"
      >
        Leave focus mode
      </Link>
    </div>
  )
}
