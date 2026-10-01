import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Card } from '@/components/ui/Card'
import { cn } from '@/lib/cn'
import { paths } from '@/lib/paths'
import { Notice } from '@/components/ui/Notice'
import { Button } from '@/components/ui/Button'
import {
  CHIME_UPGRADE,
  setPreferences,
  useOwnedUpgrades,
  usePreferences,
  type ChimeSound,
  type Upgrade,
} from '@/lib/preferences'
import { useProfile, useUpdateProfile, type ProfilePatch } from '@/lib/queries/profile'
import { POMODORO_LIMITS } from '@/lib/pomodoro'
import type { Profile, TimerMode } from '@/lib/supabase/types'
import { playChime, playItemSound, playMeow } from '@/lib/sound'

/**
 * The timer and every sound, in two cards. The timer is the account's — it
 * lives on the profile and is saved with its own button, so every device runs
 * the same Pomodoro, and the server enforces it. Sounds are this device's,
 * saved the moment they change; any that needs a Shop upgrade is shown, but
 * locked, with a way to get it.
 */
export function TimerSoundSettings() {
  const prefs = usePreferences()
  const owned = useOwnedUpgrades()
  const has = (u: Upgrade) => owned.has(u)

  return (
    <>
      <TimerCard />

      <Card className="mt-5 space-y-5">
        <div>
          <h2 className="text-lg">Sound</h2>
          <p className="mt-1 text-sm text-ink-soft">
            Saved on this device as soon as you change it.
          </p>
        </div>


        <SwitchRow
          label="Sound"
          hint="Turns every sound below on or off at once."
          checked={prefs.sound}
          onChange={(sound) => setPreferences({ sound })}
        />

        <div className={cn(!prefs.sound && 'pointer-events-none opacity-50')}>
          <label htmlFor="volume" className="mb-1.5 block text-sm font-bold">
            Volume
          </label>
          <input
            id="volume"
            type="range"
            min={0}
            max={100}
            step={5}
            value={Math.round(prefs.volume * 100)}
            disabled={!prefs.sound}
            onChange={(e) => setPreferences({ volume: Number(e.target.value) / 100 })}
            // Let them hear the level they picked.
            onPointerUp={() => playChime(undefined, { force: true, soft: true })}
            onKeyUp={() => playChime(undefined, { force: true, soft: true })}
            className="h-2 w-full accent-wood-deep"
          />
        </div>

        <div className={cn('space-y-5', !prefs.sound && 'pointer-events-none opacity-50')}>
          <SwitchRow
            label="Timer sounds"
            hint="When a focus block or a break ends."
            checked={prefs.timerSounds}
            disabled={!prefs.sound}
            onChange={(timerSounds) => setPreferences({ timerSounds })}
          />

          <div>
            <Segmented<ChimeSound>
              legend="Timer sound"
              name="chime"
              value={chimeOwned(prefs.chime, owned) ? prefs.chime : 'bell'}
              onChange={(chime) => {
                setPreferences({ chime })
                playChime(chime, { force: true })
              }}
              options={[
                { value: 'bell', label: 'Bell' },
                { value: 'chime', label: 'Chime', locked: !has('chimes') },
                { value: 'marimba', label: 'Marimba', locked: !has('chimes') },
                { value: 'meow', label: 'Meow', locked: !has('meow-alarm') },
              ]}
              disabled={!prefs.sound || !prefs.timerSounds}
            />
            {(!has('chimes') || !has('meow-alarm')) && (
              <Locked
                upgrade={
                  !has('chimes') && !has('meow-alarm')
                    ? 'Chime pack and Meow alarm'
                    : !has('chimes')
                      ? 'Chime pack'
                      : 'Meow alarm'
                }
                plural={!has('chimes') && !has('meow-alarm')}
                className="mt-1.5"
              />
            )}
          </div>

          <SwitchRow
            label="Cat sounds"
            hint="Meows and purrs when you pet your cat, crunching when it eats."
            checked={has('cat-voice') && prefs.catSounds}
            disabled={!prefs.sound || !has('cat-voice')}
            onChange={(catSounds) => {
              setPreferences({ catSounds })
              if (catSounds) playMeow(true)
            }}
          />
          {!has('cat-voice') && <Locked upgrade="Cat voice" />}

          <SwitchRow
            label="Room sounds"
            hint="Toys, plants, the piano and the clock, while your cat is busy with them."
            checked={has('room-sounds') && prefs.itemSounds}
            disabled={!prefs.sound || !has('room-sounds')}
            onChange={(itemSounds) => {
              setPreferences({ itemSounds })
              if (itemSounds) playItemSound('jingle', true)
            }}
          />
          {!has('room-sounds') && <Locked upgrade="Room sounds" />}
        </div>
      </Card>
    </>
  )
}

type TimerSettings = Pick<
  Profile,
  | 'timer_mode'
  | 'focus_minutes'
  | 'short_break_minutes'
  | 'long_break_minutes'
  | 'long_break_every'
  | 'auto_resume'
>

const TIMER_KEYS = [
  'timer_mode',
  'focus_minutes',
  'short_break_minutes',
  'long_break_minutes',
  'long_break_every',
  'auto_resume',
] as const satisfies readonly (keyof TimerSettings)[]

function timerSettings(profile: Profile): TimerSettings {
  return Object.fromEntries(TIMER_KEYS.map((key) => [key, profile[key]])) as TimerSettings
}

/**
 * Edited as a draft and saved to the profile in one request when Save is
 * pressed — only the fields that changed — so it reaches every device.
 */
function TimerCard() {
  const { data: profile } = useProfile()
  const update = useUpdateProfile()
  if (!profile) return null

  const saved = timerSettings(profile)
  // A fresh draft whenever the saved settings change: after a save here, or a
  // change made on another device.
  return <TimerForm key={JSON.stringify(saved)} saved={saved} update={update} />
}

function TimerForm({
  saved,
  update,
}: {
  saved: TimerSettings
  update: ReturnType<typeof useUpdateProfile>
}) {
  const [draft, setDraft] = useState(saved)
  const set = (patch: Partial<TimerSettings>) => setDraft((d) => ({ ...d, ...patch }))

  const changes: ProfilePatch = Object.fromEntries(
    TIMER_KEYS.filter((key) => draft[key] !== saved[key]).map((key) => [key, draft[key]]),
  )
  const dirty = Object.keys(changes).length > 0
  const pomodoro = draft.timer_mode === 'pomodoro'
  const field = (key: keyof typeof POMODORO_LIMITS) => ({
    value: draft[key],
    limits: POMODORO_LIMITS[key],
    onCommit: (value: number) => set({ [key]: value }),
  })

  return (
    <Card className="mt-5 space-y-5">
      <div>
        <h2 className="text-lg">Timer</h2>
        <p className="mt-1 text-sm text-ink-soft">
          How Focus mode keeps time, on every device. Changes apply from your next session.
        </p>
      </div>

      <Segmented<TimerMode>
        legend="Style"
        name="timer-mode"
        value={draft.timer_mode}
        onChange={(timer_mode) => set({ timer_mode })}
        options={[
          { value: 'stopwatch', label: 'Stopwatch' },
          { value: 'pomodoro', label: 'Pomodoro' },
        ]}
        hint={
          pomodoro
            ? 'Counts down each focus block, then stops the clock for a break. Breaks never count as focused time.'
            : 'Counts up from zero until you stop.'
        }
      />

      {pomodoro && (
        <div className="grid gap-4 sm:grid-cols-2">
          <MinutesField label="Focus block" unit="min" {...field('focus_minutes')} />
          <MinutesField label="Short break" unit="min" {...field('short_break_minutes')} />
          <MinutesField label="Long break" unit="min" {...field('long_break_minutes')} />
          <MinutesField label="Long break after" unit="blocks" {...field('long_break_every')} />
        </div>
      )}

      {pomodoro && (
        <SwitchRow
          label="Start the next block automatically"
          hint="Otherwise the clock waits for you to press Resume when a break ends."
          checked={draft.auto_resume}
          onChange={(auto_resume) => set({ auto_resume })}
        />
      )}

      {update.isError && <Notice tone="error">Could not save: {update.error.message}</Notice>}
      {update.isSuccess && !dirty && <Notice tone="good">Saved.</Notice>}

      <Button disabled={!dirty || update.isPending} onClick={() => update.mutate(changes)}>
        {update.isPending ? 'Saving…' : 'Save changes'}
      </Button>
    </Card>
  )
}

function chimeOwned(chime: ChimeSound, owned: ReadonlySet<Upgrade>): boolean {
  const needs = CHIME_UPGRADE[chime]
  return !needs || owned.has(needs)
}

/* ------------------------------------------------------------ pieces */

/** Pulled up under the row it explains, unless that row is not its sibling. */
function Locked({
  upgrade,
  plural = false,
  className = '-mt-3',
}: {
  upgrade: string
  plural?: boolean
  className?: string
}) {
  return (
    <p className={cn('text-xs text-ink-faint', className)}>
      {plural ? 'Some of these need' : 'Needs'} the <span className="font-bold">{upgrade}</span>{' '}
      upgrade.{' '}
      <Link to={paths.shop} className="font-bold text-teal-dark underline">
        Get it in the Shop
      </Link>
    </p>
  )
}

function SwitchRow({
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  label: string
  hint?: ReactNode
  checked: boolean
  disabled?: boolean
  onChange: (next: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-sm font-bold">{label}</p>
        {hint && <p className="mt-0.5 text-xs text-ink-faint">{hint}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative h-7 w-12 shrink-0 rounded-pill transition-colors duration-cozy ease-cozy disabled:opacity-50',
          checked ? 'bg-sage-dark' : 'bg-ink-line',
        )}
      >
        <span
          className={cn(
            'absolute top-1 h-5 w-5 rounded-full bg-paper shadow transition-[left] duration-cozy ease-cozy',
            checked ? 'left-6' : 'left-1',
          )}
        />
      </button>
    </div>
  )
}

function Segmented<T extends string>({
  legend,
  name,
  value,
  options,
  onChange,
  hint,
  disabled,
}: {
  legend: string
  name: string
  value: T
  options: { value: T; label: string; locked?: boolean }[]
  onChange: (value: T) => void
  hint?: string
  disabled?: boolean
}) {
  return (
    <fieldset disabled={disabled}>
      <legend className="text-sm font-bold">{legend}</legend>
      <div className="mt-2 inline-flex flex-wrap gap-1 rounded-cozy border border-ink-line/70 bg-cream-50 p-1">
        {options.map((option) => (
          <label
            key={option.value}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-pill px-4 py-1.5 text-sm font-bold transition-colors duration-cozy ease-cozy',
              'has-[:focus-visible]:outline has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-teal-dark',
              option.locked
                ? 'cursor-not-allowed text-ink-faint'
                : value === option.value
                  ? 'cursor-pointer bg-sage-light text-ink'
                  : 'cursor-pointer text-ink-soft hover:text-ink',
            )}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              disabled={option.locked}
              onChange={() => onChange(option.value)}
              className="sr-only"
            />
            {option.locked && <LockGlyph />}
            {option.label}
            {option.locked && <span className="sr-only"> (locked)</span>}
          </label>
        ))}
      </div>
      {hint && <p className="mt-1.5 text-xs text-ink-faint">{hint}</p>}
    </fieldset>
  )
}

function LockGlyph() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="currentColor" aria-hidden>
      <path d="M4.5 7V5a3.5 3.5 0 1 1 7 0v2h.5A1 1 0 0 1 13 8v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h.5Zm1.5 0h4V5a2 2 0 1 0-4 0v2Z" />
    </svg>
  )
}

/**
 * A whole number of minutes (or blocks). Typed freely and only clamped and
 * saved on blur or Enter, so clearing the field to type "15" does not snap it
 * to the minimum after the first keystroke.
 */
function MinutesField({
  label,
  unit,
  value,
  limits: [min, max],
  onCommit,
}: {
  label: string
  unit: string
  value: number
  limits: readonly [number, number]
  onCommit: (value: number) => void
}) {
  const [draft, setDraft] = useState(String(value))
  useEffect(() => setDraft(String(value)), [value])
  const id = `pref-${label.toLowerCase().replace(/\W+/g, '-')}`

  function commit() {
    const n = Math.round(Number(draft))
    const next = Number.isFinite(n) && draft.trim() !== '' ? Math.min(Math.max(n, min), max) : value
    setDraft(String(next))
    if (next !== value) onCommit(next)
  }

  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-bold">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit()
          }}
          className="w-24 rounded-lg border border-ink-line bg-cream-50 px-3 py-1.5 text-right text-sm font-extrabold tabular-nums"
        />
        <span className="text-sm text-ink-faint">{unit}</span>
      </div>
      <p className="mt-1 text-xs text-ink-faint">
        {min}–{max}
      </p>
    </div>
  )
}
