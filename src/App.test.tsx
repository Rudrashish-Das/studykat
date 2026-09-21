import { render, screen } from '@testing-library/react'
import { App } from '@/App'
import { paths } from '@/lib/paths'

/**
 * These run with no Supabase credentials compiled in, which is also how a
 * freshly deployed site behaves before its repository variables are set. The
 * app must still render and explain itself rather than showing a white screen.
 */
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
