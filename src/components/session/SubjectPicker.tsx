import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/cn'
import { useCreateSubject, useSubjects } from '@/lib/queries/sessions'
import type { Subject } from '@/lib/supabase/types'

const chip = cn(
  'inline-flex shrink-0 cursor-pointer items-center gap-2 whitespace-nowrap rounded-pill border px-3.5 py-1.5 text-sm font-bold',
  'transition-colors duration-cozy ease-cozy',
  'has-[:focus-visible]:outline has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-teal-dark',
)

/**
 * Pick what the next session is for. `null` means no subject. Creating a
 * subject here selects it straight away.
 */
export function SubjectPicker({
  value,
  onChange,
  className,
}: {
  value: string | null
  onChange: (subjectId: string | null) => void
  className?: string
}) {
  const subjects = useSubjects()
  const createSubject = useCreateSubject()
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // The person just asked for the field, so put the cursor in it.
  useEffect(() => {
    if (adding) inputRef.current?.focus()
  }, [adding])

  const list = subjects.data ?? []
  const trimmed = name.trim()
  const duplicate = list.some((s) => s.name.toLowerCase() === trimmed.toLowerCase())

  function add() {
    if (!trimmed || duplicate || createSubject.isPending) return
    createSubject.mutate(trimmed, {
      onSuccess: (subject: Subject) => {
        onChange(subject.id)
        setName('')
        setAdding(false)
      },
    })
  }

  return (
    <fieldset className={className}>
      <legend className="text-sm font-bold">Studying</legend>
      {/* One swipeable row on phones so a long list does not stack up; wraps on wider screens. */}
      <div className="-mx-4 mt-2 flex items-center gap-2 overflow-x-auto px-4 py-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden">
        <label
          className={cn(
            chip,
            value === null
              ? 'border-sage-dark bg-sage-light text-ink'
              : 'border-ink-line/70 bg-cream-50 text-ink-soft hover:text-ink',
          )}
        >
          <input
            type="radio"
            name="subject"
            checked={value === null}
            onChange={() => onChange(null)}
            className="sr-only"
          />
          No subject
        </label>

        {list.map((subject) => (
          <label
            key={subject.id}
            className={cn(
              chip,
              value === subject.id
                ? 'border-sage-dark bg-sage-light text-ink'
                : 'border-ink-line/70 bg-cream-50 text-ink-soft hover:text-ink',
            )}
          >
            <input
              type="radio"
              name="subject"
              checked={value === subject.id}
              onChange={() => onChange(subject.id)}
              className="sr-only"
            />
            <span
              aria-hidden
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: subject.color }}
            />
            {subject.name}
          </label>
        ))}

        {adding ? (
          <form
            className="inline-flex shrink-0 items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              add()
            }}
          >
            <input
              ref={inputRef}
              aria-label="New subject name"
              placeholder="e.g. Maths"
              maxLength={40}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setAdding(false)
                  setName('')
                }
              }}
              className="w-36 rounded-pill border border-ink-line bg-cream-50 px-3.5 py-1.5 text-sm text-ink placeholder:text-ink-faint focus:border-teal-dark"
            />
            <button
              type="submit"
              disabled={!trimmed || duplicate || createSubject.isPending}
              className="rounded-pill px-3 py-1.5 text-sm font-bold text-teal-dark disabled:opacity-50"
            >
              {createSubject.isPending ? 'Adding…' : 'Add'}
            </button>
            <button
              type="button"
              onClick={() => {
                setAdding(false)
                setName('')
              }}
              className="rounded-pill px-2 py-1.5 text-sm text-ink-soft hover:text-ink"
            >
              Cancel
            </button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="shrink-0 whitespace-nowrap rounded-pill border border-dashed border-ink-line px-3.5 py-1.5 text-sm font-bold text-ink-soft hover:text-ink"
          >
            + New subject
          </button>
        )}
      </div>

      {adding && duplicate && (
        <p className="mt-1.5 text-xs text-ink-faint">You already have a subject with that name.</p>
      )}
      {createSubject.isError && (
        <p className="mt-1.5 text-xs font-bold text-rose-deep">
          Could not add that subject: {createSubject.error.message}
        </p>
      )}
    </fieldset>
  )
}
