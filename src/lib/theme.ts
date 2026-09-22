/**
 * Light / dark / follow-the-system. A UI preference like sound, so it lives in
 * localStorage rather than on the profile — and it has to, because the landing
 * and sign-in screens are themed before there is a profile to read.
 *
 * index.html runs the same resolution inline before first paint so a dark
 * reload never flashes cream; keep the key and the logic there in step.
 */
import { useSyncExternalStore } from 'react'

export type ThemePreference = 'system' | 'light' | 'dark'

const THEME_KEY = 'studykat:theme'
const DARK_QUERY = '(prefers-color-scheme: dark)'

/** The browser chrome colour — the page background in each theme. */
const THEME_COLOR = { light: '#f6ead8', dark: '#1e1916' } as const

const listeners = new Set<() => void>()

export function readThemePreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(THEME_KEY)
    return stored === 'light' || stored === 'dark' ? stored : 'system'
  } catch {
    return 'system'
  }
}

function systemPrefersDark(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(DARK_QUERY).matches
}

function resolve(preference: ThemePreference): 'light' | 'dark' {
  if (preference === 'system') return systemPrefersDark() ? 'dark' : 'light'
  return preference
}

function apply() {
  const theme = resolve(readThemePreference())
  document.documentElement.classList.toggle('dark', theme === 'dark')
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', THEME_COLOR[theme])
}

export function setThemePreference(preference: ThemePreference) {
  try {
    if (preference === 'system') localStorage.removeItem(THEME_KEY)
    else localStorage.setItem(THEME_KEY, preference)
  } catch {
    /* private mode; it applies for this visit and will not persist */
  }
  apply()
  listeners.forEach((listener) => listener())
}

/** Apply the saved theme and keep "system" in step with the OS. Call once. */
export function initTheme() {
  apply()
  if (typeof window.matchMedia !== 'function') return
  window.matchMedia(DARK_QUERY).addEventListener('change', () => {
    if (readThemePreference() === 'system') apply()
  })
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useThemePreference(): ThemePreference {
  return useSyncExternalStore(subscribe, readThemePreference)
}
