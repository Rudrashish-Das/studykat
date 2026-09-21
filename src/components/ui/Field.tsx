import { useId, type InputHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

export function Field({
  label,
  hint,
  error,
  className,
  ...rest
}: {
  label: string
  hint?: string | undefined
  error?: string | undefined
} & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId()
  const hintId = `${id}-hint`
  const errorId = `${id}-error`

  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-bold">
        {label}
      </label>
      <input
        id={id}
        aria-describedby={cn(hint && hintId, error && errorId) || undefined}
        aria-invalid={error ? true : undefined}
        className={cn(
          'w-full rounded-xl border bg-cream-50 px-4 py-2.5 text-ink transition-colors duration-cozy ease-cozy',
          'placeholder:text-ink-faint disabled:opacity-60',
          error ? 'border-rose-deep' : 'border-ink-line focus:border-teal-dark',
        )}
        {...rest}
      />
      {hint && !error && (
        <p id={hintId} className="mt-1.5 text-xs text-ink-faint">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="mt-1.5 text-xs font-bold text-rose-deep">
          {error}
        </p>
      )}
    </div>
  )
}
