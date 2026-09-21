import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

type Tone = 'info' | 'error' | 'good'

const tones: Record<Tone, string> = {
  // Deliberately soft — §8 rules out loud red badges.
  info: 'bg-teal-light/50 text-ink border-teal/50',
  error: 'bg-rose-light/50 text-ink border-rose-dark/50',
  good: 'bg-sage-light/60 text-ink border-sage-dark/40',
}

export function Notice({
  tone = 'info',
  children,
  className,
}: {
  tone?: Tone
  children: ReactNode
  className?: string
}) {
  return (
    <p
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn('rounded-xl border px-4 py-3 text-sm', tones[tone], className)}
    >
      {children}
    </p>
  )
}
