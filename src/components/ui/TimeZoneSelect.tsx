import { useId, useMemo } from 'react'
import { timeZoneOptionsIncluding } from '@/lib/timezones'
import { cn } from '@/lib/cn'

/**
 * Picking the timezone, not typing it.
 *
 * The stored value decides when the day rolls over, so it drives the streak and
 * the daily coin cap — and the database rejects any name it does not recognise.
 * A dropdown built from the runtime's own IANA list makes an invalid value
 * unreachable instead of merely discouraged.
 */
export function TimeZoneSelect({
  value,
  onChange,
  label = 'Your timezone',
  hint,
  className,
}: {
  value: string
  onChange: (zone: string) => void
  label?: string
  hint?: string
  className?: string
}) {
  const id = useId()
  const hintId = `${id}-hint`
  const options = useMemo(() => timeZoneOptionsIncluding(value), [value])

  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-bold">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-describedby={hint ? hintId : undefined}
        className={cn(
          'w-full rounded-xl border border-ink-line bg-cream-50 px-4 py-2.5 text-ink',
          'transition-colors duration-cozy ease-cozy focus:border-teal-dark',
        )}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {hint && (
        <p id={hintId} className="mt-1.5 text-xs text-ink-faint">
          {hint}
        </p>
      )}
    </div>
  )
}
