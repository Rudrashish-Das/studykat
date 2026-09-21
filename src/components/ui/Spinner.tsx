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
    <div className="flex min-h-full flex-col items-center justify-center gap-4 px-5 py-20">
      <Spinner />
      <p className="text-sm text-ink-soft">{label}…</p>
    </div>
  )
}
