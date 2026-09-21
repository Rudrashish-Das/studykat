import { useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Room } from '@/components/room/Room'
import { Hud } from '@/components/hud/Hud'
import { Button, ButtonLink } from '@/components/ui/Button'
import { FullScreenSpinner } from '@/components/ui/Spinner'
import { Notice } from '@/components/ui/Notice'
import { useProfile } from '@/lib/queries/profile'
import { usePlacedItems } from '@/lib/queries/room'
import { useActiveSession, useStartSession, useToday } from '@/lib/queries/sessions'
import { generateAppearance } from '@/lib/cat/appearance'
import { poseForContext } from '@/lib/cat/pose'
import { useCatWander } from '@/lib/cat/useCatWander'
import { streakNudge, localHour } from '@/lib/economy/streak'
import { paths } from '@/lib/paths'
import { formatMinutes } from '@/lib/timer'

export function Home() {
  const navigate = useNavigate()
  const { data: profile } = useProfile()
  const today = useToday()
  const activeSession = useActiveSession()
  const { placed, isPending: roomPending } = usePlacedItems()
  const startSession = useStartSession()

  const timeZone = profile?.timezone ?? 'UTC'
  const now = new Date()

  // A live session takes over the screen; arriving here with one running means
  // a reload or a second tab, so send them back to it.
  useEffect(() => {
    if (activeSession.data) navigate(paths.focus, { replace: true })
  }, [activeSession.data, navigate])

  const appearance = useMemo(
    () => (profile ? generateAppearance(profile.cat_seed, profile.cat_variant) : null),
    [profile?.cat_seed, profile?.cat_variant],
  )

  const pose = poseForContext({ now, timeZone, sessionActive: false })
  const catTile = useCatWander({
    placed,
    mode: pose === 'sleeping' ? 'still' : 'wander',
  })

  if (!profile || !appearance || roomPending) {
    return <FullScreenSpinner label="Opening the door" />
  }

  const summary = today.data
  const nudge = summary
    ? streakNudge({
        now,
        timeZone,
        minutesToday: summary.minutes_today,
        thresholdMinutes: summary.streak_day_threshold_minutes,
      })
    : { show: false, minutesLeft: 0 }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-8 pt-4 sm:px-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl">{profile.cat_name}&apos;s room</h1>
          <p className="text-sm text-ink-soft">
            {pose === 'sleeping'
              ? `${profile.cat_name} is asleep. You can still study.`
              : `${profile.cat_name} is pottering about.`}
          </p>
        </div>
        <Hud
          coins={summary?.coins ?? 0}
          streak={summary?.current_streak ?? 0}
          minutesToday={summary?.minutes_today ?? 0}
          goalMinutes={summary?.daily_goal_minutes ?? profile.daily_goal_minutes}
          className="order-first w-full justify-between sm:order-none sm:w-auto"
        />
      </div>

      <Room
        placed={placed}
        cat={appearance}
        catPose={pose}
        catTile={catTile}
        nightness={nightnessFor(localHour(now, timeZone))}
        className="mt-5"
      />

      {nudge.show && (
        <Notice className="mt-5">
          {formatMinutes(nudge.minutesLeft)} left to keep your {summary?.current_streak}-day streak.
        </Notice>
      )}

      {startSession.isError && (
        <Notice tone="error" className="mt-5">
          Could not start a session: {(startSession.error as Error).message}
        </Notice>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Button
          size="lg"
          disabled={startSession.isPending}
          onClick={() => {
            startSession.mutate(
              {},
              { onSuccess: () => navigate(paths.focus) },
            )
          }}
        >
          {startSession.isPending ? 'Starting…' : 'Start studying'}
        </Button>
        <ButtonLink to={paths.room} variant="secondary" size="lg">
          Edit room
        </ButtonLink>
        <ButtonLink to={paths.shop} variant="ghost" size="lg">
          Shop
        </ButtonLink>
      </div>

      <p className="mt-3 text-sm text-ink-faint">
        One coin a minute, more after 25 minutes, more again as your streak grows. Sessions under
        five minutes earn nothing and do not count toward your streak.
      </p>
    </div>
  )
}

/**
 * How dark the room looks, from the local hour. Dusk comes on gradually from
 * 6pm and lifts again at 6am — a tint, never a blackout.
 */
export function nightnessFor(hour: number): number {
  if (hour >= 6 && hour < 17) return 0
  if (hour >= 17 && hour < 20) return (hour - 17) / 3 // dusk
  if (hour >= 20 || hour < 4) return 1
  return Math.max(0, (6 - hour) / 2) // dawn
}
