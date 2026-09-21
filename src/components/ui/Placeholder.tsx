import type { ReactNode } from 'react'
import { Card } from './Card'

/**
 * Phase 1 scaffolding. Every screen in §4 exists and is reachable, but only
 * renders its shape and the phase that will fill it in. Delete a screen's
 * <Placeholder> as its phase lands.
 */
export function Placeholder({
  title,
  blurb,
  phase,
  will,
  children,
}: {
  title: string
  blurb: string
  phase: number
  will: string[]
  children?: ReactNode
}) {
  return (
    <div className="mx-auto w-full max-w-3xl animate-fade-up px-5 py-10 sm:py-14">
      <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-ink-faint">
        Phase {phase}
      </p>
      <h1 className="text-3xl sm:text-4xl">{title}</h1>
      <p className="mt-3 max-w-prose text-ink-soft">{blurb}</p>

      {children}

      <Card className="mt-8">
        <h2 className="text-sm font-extrabold uppercase tracking-wider text-ink-soft">
          Not built yet
        </h2>
        <ul className="mt-3 space-y-2 text-sm text-ink-soft">
          {will.map((line) => (
            <li key={line} className="flex gap-2.5">
              <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-wood" />
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}
