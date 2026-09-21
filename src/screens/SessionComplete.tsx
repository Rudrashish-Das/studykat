import { useEffect, useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { Card } from '@/components/ui/Card'
import { ButtonLink } from '@/components/ui/Button'
import { Cat } from '@/components/cat/Cat'
import { CoinMark, StreakFlame } from '@/components/hud/Hud'
import { generateAppearance } from '@/lib/cat/appearance'
import { catReaction } from '@/lib/cat/pose'
import { useProfile } from '@/lib/queries/profile'
import { takeLastResult } from '@/lib/lastResult'
import { formatDuration } from '@/lib/timer'
import { paths } from '@/lib/paths'
import type { EndSessionResult } from '@/lib/supabase/types'

/**
 * The payoff. Deliberately quiet — §8 rules out confetti and slot-machine
 * noise. The reward for studying should feel like coming home.
 */
export function SessionComplete() {
  const { data: profile } = useProfile()
  // Read once on mount: the result is consumed, so a refresh goes home instead
  // of re-celebrating a session that already paid out.
  const [result] = useState<EndSessionResult | null>(() => takeLastResult())
  const [shown, setShown] = useState(false)

  useEffect(() => {
    const id = window.setTimeout(() => setShown(true), 80)
    return () => window.clearTimeout(id)
  }, [])

  const appearance = useMemo(
    () => (profile ? generateAppearance(profile.cat_seed, profile.cat_variant) : null),
    [profile?.cat_seed, profile?.cat_variant],
  )

  if (!result) return <Navigate to={paths.home} replace />
  if (!profile || !appearance) return null

  const reaction = catReaction({
    credited: result.credited,
    coins: result.coins_awarded,
    streakAdvanced: result.streak_advanced,
    goalMet: result.goal_met,
    freezeUsed: result.freeze_used,
    catName: profile.cat_name,
  })

  return (
    <div className="mx-auto flex min-h-full w-full max-w-md flex-col justify-center px-5 py-12">
      <div className="mx-auto w-36 animate-fade-up">
        <Cat appearance={appearance} pose={result.credited ? 'happy' : 'idle'} />
      </div>

      <Card className="mt-6 animate-fade-up text-center">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-ink-faint">
          {formatDuration(result.focused_seconds)} focused
        </p>

        <p className="mt-3 flex items-center justify-center gap-2 text-4xl font-extrabold tabular-nums">
          <CoinMark size={28} />
          <span
            className="transition-opacity duration-700 ease-cozy"
            style={{ opacity: shown ? 1 : 0 }}
          >
            {result.coins_awarded}
          </span>
        </p>

        <p className="mt-3 text-ink-soft">{reaction}</p>

        {result.credited && (
          <dl className="mt-6 space-y-2 text-left text-sm">
            <Row label="Minutes" value={`${result.base_coins}`} />
            {result.tier_bonus > 0 && (
              <Row label="Past 25 minutes" value={`+${result.tier_bonus}`} />
            )}
            {result.streak_multiplier > 1 && (
              <Row
                label={`Streak bonus (${result.current_streak} days)`}
                value={`×${result.streak_multiplier}`}
              />
            )}
            {result.goal_bonus > 0 && (
              <Row label="Daily goal met" value={`+${result.goal_bonus}`} />
            )}
            {result.daily_cap_hit && (
              <Row label="Daily cap reached" value="—" muted />
            )}
          </dl>
        )}

        <div className="mt-6 flex items-center justify-center gap-3 border-t border-ink-line pt-5">
          <StreakFlame days={result.current_streak} size={26} />
          <span className="text-sm text-ink-soft">
            {result.streak_advanced
              ? result.freeze_used
                ? 'Streak saved with a freeze token.'
                : 'Day added to your streak.'
              : result.credited
                ? 'Today was already counted.'
                : 'This one did not count.'}
          </span>
        </div>
      </Card>

      <div className="mt-6 flex justify-center gap-3">
        <ButtonLink to={paths.home} size="lg">
          Back to the room
        </ButtonLink>
        <ButtonLink to={paths.shop} variant="secondary" size="lg">
          Spend it
        </ButtonLink>
      </div>
    </div>
  )
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className={muted ? 'text-ink-faint' : 'text-ink-soft'}>{label}</dt>
      <dd className="font-bold tabular-nums">{value}</dd>
    </div>
  )
}
