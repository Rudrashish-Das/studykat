import { render, screen, fireEvent } from '@testing-library/react'
import { TimeZoneSelect } from './TimeZoneSelect'

describe('TimeZoneSelect', () => {
  it('renders a labelled select with many zones', () => {
    render(<TimeZoneSelect value="UTC" onChange={() => {}} />)
    const select = screen.getByLabelText('Your timezone')
    expect(select.tagName).toBe('SELECT')
    expect(select.querySelectorAll('option').length).toBeGreaterThan(30)
  })

  it('shows the current value as selected', () => {
    render(<TimeZoneSelect value="UTC" onChange={() => {}} />)
    expect(screen.getByLabelText<HTMLSelectElement>('Your timezone').value).toBe('UTC')
  })

  it('keeps a stored zone the runtime does not list, rather than dropping it', () => {
    // Asia/Calcutta is the legacy alias for Asia/Kolkata; a profile saved under
    // it must still show its own setting.
    render(<TimeZoneSelect value="Asia/Calcutta" onChange={() => {}} />)
    expect(screen.getByLabelText<HTMLSelectElement>('Your timezone').value).toBe('Asia/Calcutta')
  })

  it('reports the chosen zone', () => {
    const onChange = vi.fn()
    render(<TimeZoneSelect value="UTC" onChange={onChange} />)
    fireEvent.change(screen.getByLabelText('Your timezone'), { target: { value: 'Europe/London' } })
    expect(onChange).toHaveBeenCalledWith('Europe/London')
  })

  it('associates the hint with the control for screen readers', () => {
    render(<TimeZoneSelect value="UTC" onChange={() => {}} hint="Decides when your day rolls over." />)
    expect(screen.getByLabelText('Your timezone')).toHaveAccessibleDescription(
      'Decides when your day rolls over.',
    )
  })

  it('accepts a custom label', () => {
    render(<TimeZoneSelect value="UTC" onChange={() => {}} label="Timezone" />)
    expect(screen.getByLabelText('Timezone')).toBeInTheDocument()
  })
})
