import { render, screen } from '@testing-library/react'
import { App } from '@/App'
import { paths } from '@/lib/paths'

describe('Phase 1 skeleton', () => {
  it('renders the landing screen at the default hash route', () => {
    render(<App />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/Study a little/i)
  })

  it('has a skip link as the first focusable element', () => {
    render(<App />)
    expect(screen.getByRole('link', { name: /skip to content/i })).toBeInTheDocument()
  })

  it('declares a unique path for every screen in the spec', () => {
    const values = Object.values(paths)
    expect(new Set(values).size).toBe(values.length)
    expect(values).toHaveLength(12)
  })
})
