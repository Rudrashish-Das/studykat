/**
 * Sound preferences. Like the theme, these are about this device — a laptop
 * and a phone want different volumes — so they live in localStorage and apply
 * the moment they change. (The timer's settings are the account's, on the
 * profile, so that every device runs the same Pomodoro.)
 *
 * Most sounds are bought first, as upgrades in the Shop. A choice that needs
 * an upgrade the account does not own is kept as chosen but not acted on:
 * `useEffectivePreferences` hands back the free fallback instead, so a
 * preference picked on one account never leaks into another.
 */
import { useSyncExternalStore } from 'react'

export type ChimeSound = 'bell' | 'chime' | 'marimba' | 'meow'

export interface Preferences {
  /** The master switch: off silences everything below. */
  sound: boolean
  /** 0–1. */
  volume: number
  timerSounds: boolean
  chime: ChimeSound
  catSounds: boolean
  itemSounds: boolean
}

/** Upgrade keys, as in the catalog's `upgrade/<key>` art keys (0016_upgrades.sql). */
export const UPGRADES = ['chimes', 'meow-alarm', 'cat-voice', 'room-sounds'] as const
export type Upgrade = (typeof UPGRADES)[number]

/** Which upgrade each chime needs; the bell is free. */
export const CHIME_UPGRADE: Record<ChimeSound, Upgrade | null> = {
  bell: null,
  chime: 'chimes',
  marimba: 'chimes',
  meow: 'meow-alarm',
}

export function upgradeKey(artKey: string): Upgrade | null {
  const [kind, key] = artKey.split('/')
  return kind === 'upgrade' && (UPGRADES as readonly string[]).includes(key ?? '')
    ? (key as Upgrade)
    : null
}

export const DEFAULT_PREFERENCES: Preferences = {
  sound: true,
  volume: 0.6,
  timerSounds: true,
  chime: 'bell',
  catSounds: true,
  itemSounds: true,
}

const PREFS_KEY = 'studykat:prefs'
/** The old sound toggle, from before preferences had their own store. */
const LEGACY_SOUND_KEY = 'studykat:sound'

const CHIMES: readonly ChimeSound[] = ['bell', 'chime', 'marimba', 'meow']

/** Whatever is stored, hand back a whole, in-range set of preferences. */
export function sanitize(raw: unknown): Preferences {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof Preferences, unknown>>
  const d = DEFAULT_PREFERENCES
  const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback)
  return {
    sound: bool(r.sound, d.sound),
    volume:
      typeof r.volume === 'number' && Number.isFinite(r.volume)
        ? Math.min(Math.max(r.volume, 0), 1)
        : d.volume,
    timerSounds: bool(r.timerSounds, d.timerSounds),
    chime: CHIMES.includes(r.chime as ChimeSound) ? (r.chime as ChimeSound) : d.chime,
    catSounds: bool(r.catSounds, d.catSounds),
    itemSounds: bool(r.itemSounds, d.itemSounds),
  }
}

function load(): Preferences {
  try {
    const stored = localStorage.getItem(PREFS_KEY)
    if (stored) return sanitize(JSON.parse(stored))
    return { ...DEFAULT_PREFERENCES, sound: localStorage.getItem(LEGACY_SOUND_KEY) !== 'off' }
  } catch {
    return DEFAULT_PREFERENCES
  }
}

// Cached so useSyncExternalStore gets the same object until something changes.
let current: Preferences | null = null
let owned: ReadonlySet<Upgrade> = new Set()
let effective: { from: Preferences; owned: ReadonlySet<Upgrade>; value: Preferences } | null = null
const listeners = new Set<() => void>()

export function getPreferences(): Preferences {
  current ??= load()
  return current
}

/** What actually applies: anything locked falls back to its free version. */
export function applyUpgrades(prefs: Preferences, have: ReadonlySet<Upgrade>): Preferences {
  const chimeNeeds = CHIME_UPGRADE[prefs.chime]
  return {
    ...prefs,
    chime: chimeNeeds && !have.has(chimeNeeds) ? 'bell' : prefs.chime,
    catSounds: have.has('cat-voice') && prefs.catSounds,
    itemSounds: have.has('room-sounds') && prefs.itemSounds,
  }
}

export function getEffectivePreferences(): Preferences {
  const from = getPreferences()
  if (effective?.from !== from || effective.owned !== owned) {
    effective = { from, owned, value: applyUpgrades(from, owned) }
  }
  return effective.value
}

export function getOwnedUpgrades(): ReadonlySet<Upgrade> {
  return owned
}

/** Fed from the inventory query; see `useSyncUpgrades`. */
export function setOwnedUpgrades(next: ReadonlySet<Upgrade>) {
  if (next.size === owned.size && [...next].every((u) => owned.has(u))) return
  owned = next
  listeners.forEach((listener) => listener())
}

export function setPreferences(patch: Partial<Preferences>) {
  current = sanitize({ ...getPreferences(), ...patch })
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(current))
  } catch {
    /* private mode; it applies for this visit and will not persist */
  }
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  // Another tab changed them.
  const onStorage = (e: StorageEvent) => {
    if (e.key !== PREFS_KEY) return
    current = null
    listener()
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', onStorage)
  }
}

/** As chosen, locked or not — for Settings. */
export function usePreferences(): Preferences {
  return useSyncExternalStore(subscribe, getPreferences)
}

/** As they apply — for everything that acts on them. */
export function useEffectivePreferences(): Preferences {
  return useSyncExternalStore(subscribe, getEffectivePreferences)
}

export function useOwnedUpgrades(): ReadonlySet<Upgrade> {
  return useSyncExternalStore(subscribe, getOwnedUpgrades)
}
