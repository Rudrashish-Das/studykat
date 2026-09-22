import { afterEach, describe, expect, it, vi } from 'vitest'
import { readThemePreference, setThemePreference } from '@/lib/theme'

function mockSystemDark(dark: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: dark, addEventListener: vi.fn() })),
  )
}

afterEach(() => {
  localStorage.clear()
  document.documentElement.classList.remove('dark')
  vi.unstubAllGlobals()
})

describe('theme', () => {
  it('defaults to following the system', () => {
    expect(readThemePreference()).toBe('system')
  })

  it('an explicit choice wins over the system', () => {
    mockSystemDark(true)
    setThemePreference('light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)

    mockSystemDark(false)
    setThemePreference('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(readThemePreference()).toBe('dark')
  })

  it('system follows the OS and forgets the stored choice', () => {
    setThemePreference('dark')
    mockSystemDark(false)
    setThemePreference('system')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
    expect(localStorage.getItem('studykat:theme')).toBeNull()
  })
})
