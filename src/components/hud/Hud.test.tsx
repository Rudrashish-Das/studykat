import { render, screen } from '@testing-library/react'
import { Hud, StreakFlame } from './Hud'

/**
 * The HUD's three stats were icons with a bare number: nothing named them on
 * hover, and the flame scaled about its base, so a small one sat visibly lower
 * than the coin and the ring beside it.
 */
function renderHud(overrides: Partial<Parameters<typeof Hud>[0]> = {}) {
  return render(
    <Hud coins={0} streak={0} minutesToday={0} goalMinutes={60} {...overrides} />,
  )
}

describe('the HUD stats', () => {
  it('names every stat on hover', () => {
    renderHud({ coins: 1240, streak: 5, minutesToday: 25 })
    for (const name of [/coins/i, /streak/i, /studied today/i]) {
      // `title` is what produces the native tooltip; an aria-label alone shows
      // nothing to a mouse user.
      expect(screen.getByRole('img', { name })).toHaveAttribute('title')
    }
  })

  it('reads the same to a screen reader as it does on hover', () => {
    renderHud({ coins: 1240 })
    const coins = screen.getByRole('img', { name: /coins/i })
    expect(coins.getAttribute('title')).toBe(coins.getAttribute('aria-label'))
  })

  it('states the value, not just the name', () => {
    renderHud({ coins: 1240, streak: 5, minutesToday: 25, goalMinutes: 90 })
    expect(screen.getByRole('img', { name: '1,240 coins — spend them in the shop' }))
      .toBeInTheDocument()
    expect(screen.getByRole('img', { name: /^5 day streak/ })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: '25m studied today of your 1h 30m goal' }))
      .toBeInTheDocument()
  })

  it('says a streak has not started rather than "0 day streak"', () => {
    renderHud({ streak: 0 })
    expect(screen.getByRole('img', { name: /no streak yet/i })).toBeInTheDocument()
  })

  it('says the goal is met once it is', () => {
    renderHud({ minutesToday: 90, goalMinutes: 60 })
    expect(screen.getByRole('img', { name: /goal of 1h met/i })).toBeInTheDocument()
  })

  it('announces each stat once, not icon-then-digits', () => {
    renderHud({ coins: 1240 })
    // The visible number repeats what the label already says.
    expect(screen.getByText('1,240')).toHaveAttribute('aria-hidden', 'true')
  })
})

describe('the streak flame', () => {
  const flame = (days: number) => {
    const { container } = render(<StreakFlame days={days} />)
    return container.querySelector('svg')!
  }

  it('scales about its centre so it stays on the row', () => {
    // Anchored at the bottom, the tier-0 flame rendered ~3px below the centre
    // of its own box — the misalignment against the coin and ring.
    expect(flame(0).style.transformOrigin).toBe('center')
  })

  it('still grows with the streak', () => {
    const small = flame(0).style.transform
    const large = flame(100).style.transform
    expect(small).not.toBe(large)
  })

  it('reserves the same space at every tier, so the row does not shift', () => {
    const box = (days: number) =>
      (render(<StreakFlame days={days} />).container.firstElementChild!.querySelector(
        'span',
      ) as HTMLElement).style.height
    expect(box(0)).toBe(box(100))
  })
})
