import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { NavBar } from './NavBar'
import { paths } from '@/lib/paths'

describe('NavBar', () => {
  /** The wordmark looked clickable and was a plain <span>. */
  it('takes you home from the wordmark', () => {
    render(
      <MemoryRouter initialEntries={[paths.stats]}>
        <NavBar />
      </MemoryRouter>,
    )
    // The wordmark is split across elements, so its accessible name comes out
    // as "Study Kat"; the router here is a MemoryRouter, so no leading "#".
    const logo = screen.getByRole('link', { name: /study\s*kat/i })
    expect(logo).toHaveAttribute('href', paths.home)
  })

  it('marks the current screen', () => {
    render(
      <MemoryRouter initialEntries={[paths.stats]}>
        <NavBar />
      </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: 'Stats' })).toHaveAttribute('aria-current', 'page')
  })
})
