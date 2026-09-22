import { cn } from '@/lib/cn'

/** A slow, quiet breathing dot — no spinner whirl, per the art direction. */
export function Spinner({ className }: { className?: string }) {
  return (
    <span
      role="status"
      aria-live="polite"
      className={cn('inline-flex items-center gap-1.5', className)}
    >
      <span className="sr-only">Loading</span>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          aria-hidden
          className="h-2.5 w-2.5 rounded-full bg-wood animate-float-soft"
          style={{ animationDelay: `${i * 180}ms` }}
        />
      ))}
    </span>
  )
}

export function FullScreenSpinner({ label }: { label: string }) {
  return (
    // Pinned to the viewport rather than its parent: inside the app shell the
    // parent has no definite height, so a min-h-full box sat near the top.
    <div className="pointer-events-none fixed inset-0 flex flex-col items-center justify-center gap-4 px-5">
      <Spinner />
      <p className="text-sm text-ink-soft">{label}…</p>
    </div>
  )
}
