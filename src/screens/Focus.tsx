import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Cat } from '@/components/cat/Cat'
import { Button } from '@/components/ui/Button'
import { FullScreenSpinner } from '@/components/ui/Spinner'
import { Notice } from '@/components/ui/Notice'
import { useCatAppearance } from '@/lib/cat/useCatAppearance'
import { useProfile } from '@/lib/queries/profile'
import {
  useAbandonSession,
  useActiveSession,
  useEndSession,
  usePauseSession,
  useResumeSession,
  useSubjects,
  useToday,
} from '@/lib/queries/sessions'
import { COIN_RULES, computeCoins } from '@/lib/economy/coins'
import { focusedSeconds, formatDuration, isPaused, useTicker, useTimerStore } from '@/lib/timer'
import { paths } from '@/lib/paths'
import { usePrefersReducedMotion } from '@/lib/useReducedMotion'
import { setLastResult } from '@/lib/lastResult'

/**
 * Focus mode. While a session runs the screen belongs to the timer: dimmed
 * palette, no navigation, nothing that blinks for attention.
 *
 * The clock is derived from the session's `started_at` on every tick, never
 * incremented — so a slept tab, a locked phone, or a full reload all come back
 * to the right number.
 */
export function Focus() {
  const navigate = useNavigate()
  const { data: profile } = useProfile()
  const session = useActiveSession()
  const today = useToday()
  const subjects = useSubjects()
  const reducedMotion = usePrefersReducedMotion()

  const endSession = useEndSession()
  const pauseSession = usePauseSession()
  const resumeSession = useResumeSession()
  const abandonSession = useAbandonSession()

  const [confirmStop, setConfirmStop] = useState(false)

  const now = useTimerStore((s) => s.now)
  const paused = session.data ? isPaused(session.data) : false
  useTicker(Boolean(session.data) && !paused)

  const appearance = useCatAppearance(profile)

  // No session — someone navigated here directly, or it was just ended. Not
  // while a refetch is still out, though: that answer may be about to change.
  useEffect(() => {
    if (!session.isPending && !session.isFetching && !session.data) {
      navigate(paths.home, { replace: true })
    }
  }, [session.isPending, session.isFetching, session.data, navigate])

  if (session.isPending || !session.data || !profile || !appearance) {
    return (
      <div className="flex min-h-full items-center justify-center bg-night text-moon">
        <FullScreenSpinner label="Settling in" />
      </div>
    )
  }

  // Narrowed once here, so the closures below don't each need to re-assert
  // that `session.data` is still there.
  const activeSession = session.data
  const subjectId = activeSession.subject_id
  const subject = subjects.data?.find((s) => s.id === subjectId)
  const seconds = focusedSeconds(activeSession, now)
  const belowFloor = seconds < COIN_RULES.minSeconds

  // An honest preview, computed with the same rules the server will apply.
  const preview = computeCoins({
    focusedSeconds: seconds,
    currentStreak: today.data?.current_streak ?? 0,
    coinsToday: today.data?.coins_from_sessions_today ?? 0,
    meetsGoalFirstTime: false,
  })

  async function stop() {
    const result = await endSession.mutateAsync({
      sessionId: activeSession.id,
      clientSeconds: seconds,
    })
    setLastResult(result)
    navigate(paths.sessionComplete, { replace: true })
  }

  return (
    <div className="flex min-h-full flex-col items-center justify-center bg-night px-5 py-10 text-moon">
      <div className="w-full max-w-sm text-center">
        <div className="mx-auto w-40 opacity-95 sm:w-48">
          <Cat appearance={appearance} pose="studying" animate={!reducedMotion} />
        </div>

        <p className="mt-6 font-mono text-6xl font-bold tabular-nums sm:text-7xl" aria-live="off">
          {formatDuration(seconds)}
        </p>
        {/* A polite, low-frequency announcement for screen readers, rather than
            one per second. */}
        <p className="sr-only" aria-live="polite">
          {Math.floor(seconds / 60)} minutes focused
        </p>

        {subject && (
          <p className="mt-2 inline-flex items-center gap-2 text-sm font-bold text-moon/80">
            <span
              aria-hidden
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: subject.color }}
            />
            {subject.name}
          </p>
        )}
        {activeSession.label && (
          <p className="mt-2 text-sm text-moon/70">{activeSession.label}</p>
        )}

        <p className="mt-4 text-sm text-moon/60">
          {paused ? (
            'Paused. The clock is stopped.'
          ) : belowFloor ? (
            <>Under five minutes earns nothing — {5 - Math.floor(seconds / 60)} to go.</>
          ) : (
            <>
              About {preview.total} coin{preview.total === 1 ? '' : 's'} so far
              {preview.dailyCapHit ? ' — you have hit today&apos;s cap' : ''}.
            </>
          )}
        </p>

        {endSession.isError && (
          <Notice tone="error" className="mt-5">
            Could not end the session: {(endSession.error).message}
          </Notice>
        )}

        <div className="mt-8 flex justify-center gap-3">
          <Button
            variant="secondary"
            size="lg"
            disabled={pauseSession.isPending || resumeSession.isPending}
            onClick={() => {
              if (paused) resumeSession.mutate(activeSession.id)
              else pauseSession.mutate(activeSession.id)
            }}
          >
            {paused ? 'Resume' : 'Pause'}
          </Button>
          <Button
            size="lg"
            disabled={endSession.isPending}
            onClick={() => {
              if (belowFloor && !confirmStop) setConfirmStop(true)
              else void stop()
            }}
          >
            {endSession.isPending ? 'Saving…' : confirmStop ? 'Stop anyway' : 'Stop'}
          </Button>
        </div>

        {confirmStop && belowFloor && (
          <p className="mt-4 text-sm text-moon/70">
            Stopping now earns nothing and will not count toward your streak.{' '}
            <button
              type="button"
              className="underline"
              onClick={() => setConfirmStop(false)}
            >
              Keep going
            </button>
            {' · '}
            <button
              type="button"
              className="underline"
              onClick={() => {
                abandonSession.mutate(activeSession.id, {
                  onSuccess: () => navigate(paths.home, { replace: true }),
                })
              }}
            >
              Discard it
            </button>
          </p>
        )}

        <p className="mt-10 text-xs text-moon/40">
          {/* The clock runs on the server. You can close this tab. */}
        </p>
      </div>
    </div>
  )
}
