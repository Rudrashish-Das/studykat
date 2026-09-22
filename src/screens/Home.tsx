import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Room } from '@/components/room/Room'
import { CoinMark, Hud } from '@/components/hud/Hud'
import { Button, ButtonLink } from '@/components/ui/Button'
import { FullScreenSpinner } from '@/components/ui/Spinner'
import { Notice } from '@/components/ui/Notice'
import { useProfile } from '@/lib/queries/profile'
import { usePlacedItems } from '@/lib/queries/room'
import { useActiveSession, useStartSession, useSubjects, useToday } from '@/lib/queries/sessions'
import { SubjectPicker } from '@/components/session/SubjectPicker'
import { TreatMenu } from '@/components/cat/TreatMenu'
import { poseForContext } from '@/lib/cat/pose'
import { useCatLife } from '@/lib/cat/useCatLife'
import { streakNudge } from '@/lib/economy/streak'
import { paths } from '@/lib/paths'
import { formatMinutes } from '@/lib/timer'
import { ClockTimeZone, localTimeOfDay, nightnessFor, useNow } from '@/lib/daynight'
import { useCatAppearance } from '@/lib/cat/useCatAppearance'

const SUBJECT_KEY = 'studycat:last-subject'

function readLastSubject(): string | null {
  try {
    return localStorage.getItem(SUBJECT_KEY)
  } catch {
    return null
  }
}

export function Home() {
  const navigate = useNavigate()
  const { data: profile } = useProfile()
  const today = useToday()
  const activeSession = useActiveSession()
  const { placed, isPending: roomPending } = usePlacedItems()
  const startSession = useStartSession()
  const subjects = useSubjects()
  const [chosenSubject, setChosenSubject] = useState<string | null>(readLastSubject)
  // The remembered subject may have been archived or deleted since.
  const subjectId =
    chosenSubject && subjects.data?.some((s) => s.id === chosenSubject) ? chosenSubject : null

  function chooseSubject(id: string | null) {
    setChosenSubject(id)
    try {
      if (id) localStorage.setItem(SUBJECT_KEY, id)
      else localStorage.removeItem(SUBJECT_KEY)
    } catch {
      /* private mode; the choice simply will not persist */
    }
  }

  const timeZone = profile?.timezone ?? 'UTC'
  const now = useNow()

  // A live session takes over the screen; arriving here with one running means
  // a reload or a second tab, so send them back to it.
  useEffect(() => {
    if (activeSession.data) navigate(paths.focus, { replace: true })
  }, [activeSession.data, navigate])

  const appearance = useCatAppearance(profile)

  const bedtime = poseForContext({ now, timeZone, sessionActive: false }) === 'sleeping'
  const catLife = useCatLife({ placed, asleep: bedtime, catName: profile?.cat_name ?? 'Your cat' })

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
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl sm:text-3xl">{profile.cat_name}&apos;s room</h1>
          {/* Reserve two lines so the room doesn't jump as the description changes length. */}
          <p className="min-h-10 text-sm text-ink-soft" aria-live="polite">
            {catLife.description}
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

      <ClockTimeZone.Provider value={timeZone}>
        <Room
          placed={placed}
          cat={appearance}
          catPose={catLife.pose}
          catTile={catLife.tile}
          catFacing={catLife.facing}
          catPerch={catLife.perch}
          catEffect={catLife.effect}
          catPats={catLife.pats}
          catMeal={catLife.meal}
          activeItem={catLife.activeItem}
          catName={profile.cat_name}
          onCatClick={catLife.pet}
          onItemVisit={catLife.visit}
          nightness={nightnessFor(localTimeOfDay(now, timeZone))}
          className="mt-5"
        />
      </ClockTimeZone.Provider>

      <TreatMenu
        catName={profile.cat_name}
        coins={summary?.coins ?? 0}
        eating={catLife.eating}
        onFed={catLife.feed}
        className="mt-5"
      />

      {nudge.show && (
        <Notice className="mt-5">
          Study {formatMinutes(nudge.minutesLeft)} more today to{' '}
          {summary?.current_streak
            ? `keep your ${summary.current_streak}-day streak.`
            : 'start a streak.'}
        </Notice>
      )}

      {startSession.isError && (
        <Notice tone="error" className="mt-5">
          Could not start a session: {(startSession.error).message}
        </Notice>
      )}

      <section className="mt-6 rounded-cozy border border-ink-line/70 bg-paper p-4 shadow-cozy sm:p-6">
        <SubjectPicker value={subjectId} onChange={chooseSubject} />

        <div className="mt-5 flex flex-col gap-3 border-t border-ink-line/50 pt-5 sm:flex-row sm:items-center">
          <Button
            size="lg"
            className="w-full sm:w-auto"
            disabled={startSession.isPending}
            onClick={() => {
              startSession.mutate(
                { subjectId },
                { onSuccess: () => navigate(paths.focus) },
              )
            }}
          >
            {startSession.isPending ? 'Starting…' : 'Start studying'}
          </Button>
          <div className="grid grid-cols-2 gap-3 sm:ml-auto sm:flex">
            <ButtonLink to={paths.room} variant="secondary">
              Edit room
            </ButtonLink>
            <ButtonLink to={paths.shop} variant="outline">
              <CoinMark size={16} />
              Shop
            </ButtonLink>
          </div>
        </div>

        <p className="mt-4 text-xs leading-relaxed text-ink-faint">
          One coin a minute, more after 25 minutes, more again as your streak grows. Sessions under
          five minutes earn nothing and do not count toward your streak.
        </p>
      </section>
    </div>
  )
}
