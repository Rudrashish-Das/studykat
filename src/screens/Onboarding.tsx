import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { Notice } from '@/components/ui/Notice'
import { Cat } from '@/components/cat/Cat'
import { FullScreenSpinner } from '@/components/ui/Spinner'
import { candidateAppearances, describeAppearance } from '@/lib/cat/appearance'
import { profileKey, useProfile } from '@/lib/queries/profile'
import { TimeZoneSelect } from '@/components/ui/TimeZoneSelect'
import { guessTimeZone } from '@/lib/timezones'
import { requireSupabase } from '@/lib/supabase/client'
import type { Profile } from '@/lib/supabase/types'
import { paths } from '@/lib/paths'
import { cn } from '@/lib/cn'
import {
  DAILY_GOAL_MAX,
  DAILY_GOAL_MIN,
  clampDailyGoal,
  streakThresholdMinutes,
} from '@/lib/economy/coins'

const GOALS = [
  { minutes: 25, label: '25 min', note: 'One session.' },
  { minutes: 60, label: '1 hour', note: 'The common choice.' },
  { minutes: 120, label: '2 hours', note: 'Serious.' },
  { minutes: 180, label: '3 hours', note: 'Exam season.' },
] as const

export function Onboarding() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data: profile, isPending } = useProfile()

  const [name, setName] = useState('')
  const [variant, setVariant] = useState(0)
  const [goal, setGoal] = useState(60)
  // Tracked separately from `goal` so the field can hold a half-typed number
  // without the preset chips flickering as you type.
  const [customGoal, setCustomGoal] = useState('')
  const usingCustom = !GOALS.some((option) => option.minutes === goal)
  const [timezone, setTimezone] = useState(guessTimeZone)
  const [error, setError] = useState<string | null>(null)

  // The three candidates are a pure function of the account seed, so they are
  // the same three every time this screen is opened — the choice is real, but
  // the cat is still permanently tied to the account.
  const candidates = useMemo(
    () => (profile ? candidateAppearances(profile.cat_seed) : null),
    [profile],
  )

  const complete = useMutation({
    mutationFn: async (): Promise<Profile> => {
      const { data, error: rpcError } = await requireSupabase().rpc('complete_onboarding', {
        p_cat_name: name.trim(),
        p_cat_variant: variant,
        p_daily_goal: goal,
        p_timezone: timezone,
      })
      if (rpcError) throw rpcError
      return data
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(profileKey(updated.id), updated)
      navigate(paths.home, { replace: true })
    },
    onError: (err: Error) => setError(err.message),
  })

  if (isPending || !profile || !candidates) {
    return <FullScreenSpinner label="Finding your cat" />
  }

  const chosen = candidates[variant] ?? candidates[0]

  return (
    <div className="mx-auto w-full max-w-3xl animate-fade-up px-5 py-10 sm:py-14">
      <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-ink-faint">
        One time only
      </p>
      <h1 className="text-3xl sm:text-4xl">Meet your cat</h1>
      <p className="mt-3 max-w-prose text-ink-soft">
        These three came from your account&apos;s seed and no one else&apos;s. Pick the one you like
        — whichever you choose is yours for good.
      </p>

      <fieldset className="mt-8">
        <legend className="sr-only">Choose a cat</legend>
        <div className="grid gap-4 sm:grid-cols-3">
          {candidates.map((candidate, index) => {
            const selected = index === variant
            return (
              <button
                key={index}
                type="button"
                onClick={() => setVariant(index)}
                aria-pressed={selected}
                className={cn(
                  'group rounded-cozy border-2 bg-paper p-4 text-left transition-all duration-cozy ease-cozy',
                  selected
                    ? 'border-wood-deep shadow-cozy-lg'
                    : 'border-ink-line/70 shadow-cozy hover:border-wood',
                )}
              >
                <Cat appearance={candidate} pose={selected ? 'happy' : 'idle'} animate={selected} />
                <p className="mt-3 text-sm font-bold capitalize">
                  {candidate.coat.name} {candidate.pattern !== 'solid' && candidate.pattern}
                </p>
                <p className="mt-1 text-xs text-ink-faint">{describeAppearance(candidate)}</p>
              </button>
            )
          })}
        </div>
      </fieldset>

      <Card className="mt-8 space-y-6">
        <Field
          label="What is their name?"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Mochi"
          maxLength={24}
          hint="You can change this later in Settings."
        />

        <fieldset>
          <legend className="mb-2 block text-sm font-bold">How long do you want to study each day?</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {GOALS.map((option) => (
              <button
                key={option.minutes}
                type="button"
                onClick={() => setGoal(option.minutes)}
                aria-pressed={goal === option.minutes}
                className={cn(
                  'rounded-xl border-2 px-3 py-3 text-center transition-colors duration-cozy ease-cozy',
                  goal === option.minutes
                    ? 'border-wood-deep bg-sage-light'
                    : 'border-ink-line bg-cream-50 hover:border-wood',
                )}
              >
                <span className="block text-sm font-extrabold">{option.label}</span>
                <span className="mt-0.5 block text-xs text-ink-faint">{option.note}</span>
              </button>
            ))}
            <button
              type="button"
              aria-pressed={usingCustom}
              onClick={() => {
                // Seed the field from whatever is currently selected, so the
                // custom option starts from the number you were already on.
                const start = customGoal || String(goal)
                setCustomGoal(start)
                setGoal(clampDailyGoal(Number(start)))
              }}
              className={cn(
                'rounded-xl border-2 px-3 py-3 text-center transition-colors duration-cozy ease-cozy',
                usingCustom
                  ? 'border-wood-deep bg-sage-light'
                  : 'border-ink-line bg-cream-50 hover:border-wood',
              )}
            >
              <span className="block text-sm font-extrabold">Custom</span>
              <span className="mt-0.5 block text-xs text-ink-faint">Your number.</span>
            </button>
          </div>

          {usingCustom && (
            <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-ink-line bg-cream-50 px-4 py-3">
              <label htmlFor="custom-goal" className="text-sm font-bold">
                Minutes a day
              </label>
              <input
                id="custom-goal"
                type="number"
                inputMode="numeric"
                min={DAILY_GOAL_MIN}
                max={DAILY_GOAL_MAX}
                step={5}
                value={customGoal}
                autoFocus
                onChange={(e) => {
                  setCustomGoal(e.target.value)
                  const parsed = Number(e.target.value)
                  // Only move the real goal once the field holds something
                  // usable; an empty or half-typed box should not reset it.
                  if (e.target.value !== '' && Number.isFinite(parsed)) {
                    setGoal(clampDailyGoal(parsed))
                  }
                }}
                onBlur={() => setCustomGoal(String(goal))}
                className="w-28 rounded-lg border border-ink-line bg-paper px-3 py-2 text-ink"
                aria-describedby="custom-goal-hint"
              />
              <span id="custom-goal-hint" className="text-xs text-ink-faint">
                Between {DAILY_GOAL_MIN} and {DAILY_GOAL_MAX} ({DAILY_GOAL_MAX / 60} hours).
              </span>
            </div>
          )}

          <p className="mt-2 text-xs text-ink-faint">
            A day counts toward your streak at {streakThresholdMinutes(goal)} minutes — half your
            goal, or fifteen minutes, whichever is more.
          </p>
        </fieldset>

        <TimeZoneSelect
          value={timezone}
          onChange={setTimezone}
          hint="This decides when your day rolls over, so the streak lines up with your actual midnight rather than UTC's."
        />

        {error && <Notice tone="error">{error}</Notice>}

        <Button
          size="lg"
          className="w-full"
          disabled={name.trim().length === 0 || complete.isPending}
          onClick={() => {
            setError(null)
            complete.mutate()
          }}
        >
          {complete.isPending ? 'One moment…' : `Take ${name.trim() || 'them'} home`}
        </Button>
      </Card>

      <p className="mt-5 text-center text-xs text-ink-faint">
        Seed <code className="rounded bg-cream-200 px-1.5 py-0.5">{profile.cat_seed}</code> —{' '}
        {chosen?.pattern} {chosen?.coat.name}. It never changes.
      </p>
    </div>
  )
}
