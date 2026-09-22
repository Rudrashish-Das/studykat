import { useMemo } from 'react'
import { Card } from '@/components/ui/Card'
import { FullScreenSpinner } from '@/components/ui/Spinner'
import { StreakFlame } from '@/components/hud/Hud'
import { useDailyTotals, useSubjectTotals, type DailyTotal } from '@/lib/queries/stats'
import { useToday } from '@/lib/queries/sessions'
import { formatMinutes } from '@/lib/timer'
import { cn } from '@/lib/cn'

/** The receipts view. Numbers here should confirm what the room already shows. */
export function Stats() {
  const daily = useDailyTotals(365)
  const subjects = useSubjectTotals()
  const today = useToday()

  if (daily.isPending) return <FullScreenSpinner label="Counting the hours" />

  const days = daily.data ?? []
  const lifetimeMinutes = Math.round((today.data?.lifetime_seconds ?? 0) / 60)
  const studiedDays = days.filter((d) => d.seconds > 0).length

  return (
    <div className="mx-auto w-full max-w-4xl px-4 pb-10 pt-4 sm:px-5">
      <h1 className="text-2xl sm:text-3xl">Stats</h1>

      <div className="mt-5 grid gap-4 sm:grid-cols-4">
        <Stat label="Lifetime" value={formatMinutes(lifetimeMinutes)} />
        <Stat label="Days studied" value={String(studiedDays)} />
        <Stat
          label="Current streak"
          value={String(today.data?.current_streak ?? 0)}
          adornment={<StreakFlame days={today.data?.current_streak ?? 0} size={18} />}
        />
        <Stat label="Longest streak" value={String(today.data?.longest_streak ?? 0)} />
      </div>

      <Card className="mt-6">
        <h2 className="text-lg">This year</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Each square is a day in your timezone. Darker means longer.
        </p>
        <Heatmap days={days} />
      </Card>

      <Card className="mt-6">
        <h2 className="text-lg">Last 12 weeks</h2>
        <WeeklyBars days={days} />
      </Card>

      <Card className="mt-6">
        <h2 className="text-lg">By subject</h2>
        {subjects.isPending ? (
          <p className="mt-3 text-sm text-ink-faint">Loading…</p>
        ) : (subjects.data ?? []).length === 0 ? (
          <p className="mt-3 text-sm text-ink-faint">
            No completed sessions yet. Subjects appear here once you have tagged a few.
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {(subjects.data ?? []).map((subject) => {
              const max = Math.max(...(subjects.data ?? []).map((s) => s.seconds), 1)
              return (
                <li key={subject.subject_id ?? 'none'}>
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="font-bold">{subject.name}</span>
                    <span className="tabular-nums text-ink-soft">
                      {formatMinutes(Math.round(subject.seconds / 60))}
                    </span>
                  </div>
                  <div className="mt-1.5 h-2.5 overflow-hidden rounded-pill bg-cream-300">
                    <div
                      className="h-full rounded-pill transition-[width] duration-700 ease-cozy"
                      style={{
                        width: `${(subject.seconds / max) * 100}%`,
                        backgroundColor: subject.color,
                      }}
                    />
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </Card>
    </div>
  )
}

function Stat({
  label,
  value,
  adornment,
}: {
  label: string
  value: string
  adornment?: React.ReactNode
}) {
  return (
    <div className="rounded-cozy border border-ink-line/70 bg-paper p-4 shadow-cozy">
      <p className="text-xs font-bold uppercase tracking-wider text-ink-faint">{label}</p>
      <p className="mt-1.5 flex items-center gap-2 text-2xl font-extrabold tabular-nums">
        {adornment}
        {value}
      </p>
    </div>
  )
}

// CSS variables so the empty end of the scale sinks into the page in dark mode
// instead of glaring (index.css).
const HEAT_STEPS = [
  'var(--sc-heat-0)',
  'var(--sc-heat-1)',
  'var(--sc-heat-2)',
  'var(--sc-heat-3)',
  'var(--sc-heat-4)',
] as const

function heatIndex(seconds: number): number {
  if (seconds <= 0) return 0
  const minutes = seconds / 60
  if (minutes < 20) return 1
  if (minutes < 45) return 2
  if (minutes < 90) return 3
  return 4
}

function Heatmap({ days }: { days: DailyTotal[] }) {
  // Lay out in columns of seven, the way a calendar reads.
  const weeks = useMemo(() => {
    const columns: DailyTotal[][] = []
    for (let i = 0; i < days.length; i += 7) {
      columns.push(days.slice(i, i + 7))
    }
    return columns
  }, [days])

  if (days.length === 0) {
    return <p className="mt-4 text-sm text-ink-faint">Nothing recorded yet.</p>
  }

  return (
    <div className="mt-4 overflow-x-auto pb-2">
      <div className="flex w-max gap-[3px]">
        {weeks.map((week, index) => (
          <div key={index} className="flex flex-col gap-[3px]">
            {week.map((day) => (
              <div
                key={day.day}
                title={`${day.day}: ${formatMinutes(Math.round(day.seconds / 60))}`}
                className="h-3 w-3 rounded-[3px]"
                style={{ backgroundColor: HEAT_STEPS[heatIndex(day.seconds)] }}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2 text-xs text-ink-faint">
        <span>Less</span>
        {HEAT_STEPS.map((color) => (
          <span key={color} className="h-3 w-3 rounded-[3px]" style={{ backgroundColor: color }} />
        ))}
        <span>More</span>
      </div>
    </div>
  )
}

function WeeklyBars({ days }: { days: DailyTotal[] }) {
  const weeks = useMemo(() => {
    const recent = days.slice(-84)
    const buckets: { label: string; minutes: number }[] = []
    for (let i = 0; i < recent.length; i += 7) {
      const week = recent.slice(i, i + 7)
      const minutes = Math.round(week.reduce((sum, d) => sum + d.seconds, 0) / 60)
      buckets.push({ label: week[0]?.day ?? '', minutes })
    }
    return buckets
  }, [days])

  const max = Math.max(...weeks.map((w) => w.minutes), 1)

  if (weeks.length === 0) {
    return <p className="mt-4 text-sm text-ink-faint">Nothing recorded yet.</p>
  }

  return (
    <div className="mt-4">
      <div className="flex h-36 items-end gap-1.5">
        {weeks.map((week) => (
          <div
            key={week.label}
            className="group relative flex-1"
            title={`Week of ${week.label}: ${formatMinutes(week.minutes)}`}
          >
            <div
              className={cn(
                'w-full rounded-t-md bg-wood transition-[height] duration-700 ease-cozy',
                week.minutes === 0 && 'bg-cream-300',
              )}
              style={{ height: `${Math.max((week.minutes / max) * 136, 3)}px` }}
            />
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-ink-faint">
        Tallest week: {formatMinutes(max)}.
      </p>
    </div>
  )
}
