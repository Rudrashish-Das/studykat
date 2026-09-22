import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { Onboarding } from './Onboarding'
import type { Profile } from '@/lib/supabase/types'

/**
 * The goal picker had a bug that 171 passing tests did not catch: "is this a
 * custom goal?" was *derived* from whether the value matched a preset, and the
 * default of 60 is itself a preset — so clicking Custom could never reveal the
 * field. It only showed up by clicking the button in a browser.
 *
 * These render the real screen and click the real controls, which is the level
 * the bug lived at.
 */

const profile: Profile = {
  id: 'test-user',
  display_name: null,
  cat_name: 'Cat',
  cat_seed: 'abcdefghijkmnopq',
  cat_variant: 0,
  daily_goal_minutes: 60,
  timezone: 'UTC',
  timezone_changed_at: null,
  onboarded_at: null,
  created_at: '2026-01-01T00:00:00Z',
}

vi.mock('@/lib/queries/profile', () => ({
  useProfile: () => ({ data: profile, isPending: false, isError: false }),
  profileKey: (id: string) => ['profile', id],
}))

vi.mock('@/lib/supabase/client', () => ({
  requireSupabase: () => ({ rpc: vi.fn().mockResolvedValue({ data: profile, error: null }) }),
}))

function renderOnboarding() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <Onboarding />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const customChip = () => screen.getByRole('button', { name: /custom/i })
const goalField = () => screen.queryByLabelText('Minutes a day')

describe('the daily goal picker', () => {
  it('starts on a preset with no custom field showing', () => {
    renderOnboarding()
    expect(screen.getByRole('button', { name: /1 hour/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(goalField()).not.toBeInTheDocument()
  })

  it('reveals the field when Custom is clicked, even though the default is a preset', () => {
    renderOnboarding()
    fireEvent.click(customChip())

    expect(goalField()).toBeInTheDocument()
    expect(customChip()).toHaveAttribute('aria-pressed', 'true')
    // The preset must let go, or two chips look selected at once.
    expect(screen.getByRole('button', { name: /1 hour/i })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  it('seeds the field from the preset that was selected', () => {
    renderOnboarding()
    fireEvent.click(customChip())
    expect(goalField()).toHaveValue(60)
  })

  it('updates the streak threshold as the goal is typed', () => {
    renderOnboarding()
    fireEvent.click(customChip())
    fireEvent.change(goalField()!, { target: { value: '95' } })
    // ceil(95 / 2) = 48
    expect(screen.getByText(/counts toward your streak at 48 minutes/i)).toBeInTheDocument()
  })

  it('clamps a goal beyond the allowed range', () => {
    renderOnboarding()
    fireEvent.click(customChip())
    fireEvent.change(goalField()!, { target: { value: '99999' } })
    // Clamped to DAILY_GOAL_MAX (480), so the threshold is 240.
    expect(screen.getByText(/counts toward your streak at 240 minutes/i)).toBeInTheDocument()
  })

  it('goes back to a preset cleanly', () => {
    renderOnboarding()
    fireEvent.click(customChip())
    fireEvent.click(screen.getByRole('button', { name: /2 hours/i }))

    expect(goalField()).not.toBeInTheDocument()
    expect(customChip()).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByText(/counts toward your streak at 60 minutes/i)).toBeInTheDocument()
  })
})

describe('the timezone picker', () => {
  it('is a select, not a free-text box', () => {
    renderOnboarding()
    expect(screen.getByLabelText('Your timezone').tagName).toBe('SELECT')
  })
})
