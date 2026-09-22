import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { Notice } from '@/components/ui/Notice'
import { FullScreenSpinner } from '@/components/ui/Spinner'
import { Cat } from '@/components/cat/Cat'
import { useProfile, useUpdateProfile } from '@/lib/queries/profile'
import { generateAppearance, describeAppearance } from '@/lib/cat/appearance'
import { useAuth } from '@/lib/auth'
import { signOut } from '@/lib/auth-actions'
import { requireSupabase } from '@/lib/supabase/client'
import { paths } from '@/lib/paths'
import { TimeZoneSelect } from '@/components/ui/TimeZoneSelect'
import {
  DAILY_GOAL_MAX,
  DAILY_GOAL_MIN,
  clampDailyGoal,
  streakThresholdMinutes,
} from '@/lib/economy/coins'

/**
 * The database rejects a few profile edits on purpose. Say why in a sentence
 * rather than surfacing a Postgres error.
 */
function friendlyProfileError(raw: string, timezone: string): string {
  const message = raw.toLowerCase()
  if (message.includes('once a day')) {
    return 'You already changed your timezone today. It can be changed again tomorrow — it decides when your day rolls over, so it is deliberately hard to flip back and forth.'
  }
  if (message.includes('timezone')) {
    return `"${timezone}" is not a timezone we recognise. Use an IANA name like Europe/London.`
  }
  return raw
}

/** Sound is a UI preference, so localStorage is the right home for it. */
const SOUND_KEY = 'studykat:sound'

function readSound(): boolean {
  try {
    return localStorage.getItem(SOUND_KEY) !== 'off'
  } catch {
    return true
  }
}

export function Settings() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { data: profile, isPending } = useProfile()
  const updateProfile = useUpdateProfile()

  const [catName, setCatName] = useState('')
  const [goal, setGoal] = useState(60)
  const [timezone, setTimezone] = useState('UTC')
  const [sound, setSound] = useState(readSound)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState('')

  useEffect(() => {
    if (!profile) return
    setCatName(profile.cat_name)
    setGoal(profile.daily_goal_minutes)
    setTimezone(profile.timezone)
  }, [profile])

  if (isPending || !profile) return <FullScreenSpinner label="Fetching your settings" />

  const appearance = generateAppearance(profile.cat_seed, profile.cat_variant)
  const dirty =
    catName !== profile.cat_name ||
    goal !== profile.daily_goal_minutes ||
    timezone !== profile.timezone

  async function save() {
    setError(null)
    setSaved(false)
    try {
      await updateProfile.mutateAsync({
        cat_name: catName.trim(),
        daily_goal_minutes: goal,
        timezone: timezone.trim(),
      })
      setSaved(true)
    } catch (err) {
      setError(friendlyProfileError((err as Error).message, timezone))
    }
  }

  async function deleteAccount() {
    setError(null)
    const { error: rpcError } = await requireSupabase().rpc('delete_my_account')
    if (rpcError) {
      setError(rpcError.message)
      return
    }
    await signOut()
    navigate(paths.landing, { replace: true })
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-12 pt-4 sm:px-5">
      <h1 className="text-2xl sm:text-3xl">Settings</h1>

      <Card className="mt-5">
        <div className="flex items-start gap-5">
          <div className="w-24 shrink-0">
            <Cat appearance={appearance} pose="idle" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg">{profile.cat_name}</h2>
            <p className="mt-1 text-sm text-ink-soft">{describeAppearance(appearance)}</p>
            <p className="mt-2 text-xs text-ink-faint">
              Seed <code className="rounded bg-cream-200 px-1.5 py-0.5">{profile.cat_seed}</code>.
              Fixed at signup and never rerolled — it is what makes this cat yours.
            </p>
          </div>
        </div>
      </Card>

      <Card className="mt-5 space-y-5">
        <Field
          label="Cat name"
          value={catName}
          maxLength={24}
          onChange={(e) => setCatName(e.target.value)}
        />

        <div>
          <label htmlFor="goal" className="mb-1.5 block text-sm font-bold">
            Daily goal
          </label>
          <div className="flex items-center gap-3">
            <input
              id="goal"
              type="range"
              min={DAILY_GOAL_MIN}
              max={DAILY_GOAL_MAX}
              step={5}
              value={goal}
              onChange={(e) => setGoal(Number(e.target.value))}
              className="h-2 flex-1 accent-wood-deep"
              aria-describedby="goal-hint"
            />
            {/* Typable as well as draggable, so a goal picked at onboarding can
                be reproduced exactly rather than hunted for on the slider. */}
            <input
              type="number"
              inputMode="numeric"
              min={DAILY_GOAL_MIN}
              max={DAILY_GOAL_MAX}
              step={5}
              value={goal}
              onChange={(e) => setGoal(clampDailyGoal(Number(e.target.value)))}
              aria-label="Daily goal in minutes"
              className="w-24 rounded-lg border border-ink-line bg-cream-50 px-3 py-1.5 text-right text-sm font-extrabold tabular-nums"
            />
            <span className="text-sm text-ink-faint">min</span>
          </div>
          <p id="goal-hint" className="mt-1.5 text-xs text-ink-faint">
            A day counts toward your streak at {streakThresholdMinutes(goal)} minutes.
          </p>
        </div>

        <TimeZoneSelect
          label="Timezone"
          value={timezone}
          onChange={setTimezone}
          hint="This decides when your day rolls over. It can only be changed once a day, because it moves the boundary your streak and daily coin cap are counted against."
        />

        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-bold">Sound</p>
            <p className="text-xs text-ink-faint">
              Kept in this browser only — it is a preference, not something you earned.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={sound}
            aria-label="Sound"
            onClick={() => {
              const next = !sound
              setSound(next)
              try {
                localStorage.setItem(SOUND_KEY, next ? 'on' : 'off')
              } catch {
                /* private mode; the toggle simply will not persist */
              }
            }}
            className={`relative h-7 w-12 shrink-0 rounded-pill transition-colors duration-cozy ease-cozy ${
              sound ? 'bg-sage-dark' : 'bg-ink-line'
            }`}
          >
            <span
              className={`absolute top-1 h-5 w-5 rounded-full bg-paper shadow transition-[left] duration-cozy ease-cozy ${
                sound ? 'left-6' : 'left-1'
              }`}
            />
          </button>
        </div>

        {error && <Notice tone="error">{error}</Notice>}
        {saved && !dirty && <Notice tone="good">Saved.</Notice>}

        <Button disabled={!dirty || updateProfile.isPending} onClick={save}>
          {updateProfile.isPending ? 'Saving…' : 'Save changes'}
        </Button>
      </Card>

      <Card className="mt-5">
        <h2 className="text-lg">Account</h2>
        <p className="mt-1 text-sm text-ink-soft">{user?.email}</p>
        <div className="mt-4">
          <Button
            variant="secondary"
            onClick={async () => {
              await signOut()
              navigate(paths.landing, { replace: true })
            }}
          >
            Log out
          </Button>
        </div>
      </Card>

      <Card className="mt-5 border-rose-dark/40">
        <h2 className="text-lg">Delete account</h2>
        <p className="mt-1 text-sm text-ink-soft">
          This removes your profile, your cat, your room, and every session you have logged. It
          cannot be undone, and the seed will not come back.
        </p>
        <label htmlFor="confirm" className="mt-4 block text-sm font-bold">
          Type <code className="rounded bg-cream-200 px-1.5 py-0.5">delete</code> to confirm
        </label>
        <input
          id="confirm"
          value={confirmDelete}
          onChange={(e) => setConfirmDelete(e.target.value)}
          className="mt-1.5 w-full rounded-xl border border-ink-line bg-cream-50 px-4 py-2.5"
        />
        <Button
          variant="secondary"
          className="mt-4 bg-rose-light hover:bg-rose"
          disabled={confirmDelete.trim().toLowerCase() !== 'delete'}
          onClick={deleteAccount}
        >
          Delete my account
        </Button>
      </Card>
    </div>
  )
}
