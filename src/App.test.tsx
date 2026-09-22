import { render, screen } from '@testing-library/react'
import { App } from '@/App'
import { paths } from '@/lib/paths'

/**
 * Pin the environment rather than inheriting it.
 *
 * `import.meta.env` is populated from `.env.local` when one exists, so without
 * this the suite passed or failed depending on whether the machine running it
 * happened to have Supabase credentials — green in CI, red as soon as a
 * developer configured the app locally. With credentials present the provider
 * starts in its loading state and renders a spinner instead of the landing
 * page, which is correct behaviour and a broken test.
 *
 * Unconfigured is also how a freshly deployed site behaves before its
 * repository variables are set, so it is the state worth asserting: the app
 * must still render and explain itself rather than showing a white screen.
 */
vi.mock('@/lib/env', () => ({
  isSupabaseConfigured: false,
  supabaseConfig: null,
  authRedirectTo: () => 'http://localhost:5173/',
}))

describe('app shell', () => {
  it('renders the landing screen at the default hash route', () => {
    render(<App />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/Study a little/i)
  })

  it('offers a skip link for keyboard users', () => {
    render(<App />)
    expect(screen.getByRole('link', { name: /skip to content/i })).toBeInTheDocument()
  })

  it('declares a unique path for every screen in the spec', () => {
    const values = Object.values(paths)
    expect(new Set(values).size).toBe(values.length)
    // Landing, login, register, reset, new password, onboarding, home, focus,
    // session complete, shop, room, stats, settings.
    expect(values).toHaveLength(13)
  })

  it('routes every path through a leading slash, so HashRouter links resolve', () => {
    for (const path of Object.values(paths)) {
      expect(path.startsWith('/')).toBe(true)
    }
  })
})
