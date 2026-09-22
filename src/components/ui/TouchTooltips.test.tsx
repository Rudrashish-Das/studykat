import { act, createEvent, fireEvent, render, screen } from '@testing-library/react'
import { TouchTooltips } from './TouchTooltips'

/**
 * Every tooltip was a native `title`, which touch screens never show — on a
 * phone the HUD stats and the Stats charts explained nothing.
 */
function renderWith(ui: React.ReactNode) {
  return render(
    <>
      <TouchTooltips />
      {ui}
    </>,
  )
}

// jsdom has no PointerEvent, so `pointerType` has to be set on the event by hand.
const tap = (el: Element, pointerType = 'touch') => {
  const event = createEvent.pointerDown(el)
  Object.defineProperty(event, 'pointerType', { value: pointerType })
  act(() => {
    fireEvent(el, event)
  })
}

describe('touch tooltips', () => {
  it('shows the title of whatever is tapped', () => {
    renderWith(<span title="5 day streak">5</span>)
    tap(screen.getByText('5'))
    expect(screen.getByRole('tooltip')).toHaveTextContent('5 day streak')
  })

  it('finds the title on an ancestor of the tapped element', () => {
    renderWith(
      <span title="1,240 coins">
        <svg data-testid="icon" />
      </span>,
    )
    tap(screen.getByTestId('icon'))
    expect(screen.getByRole('tooltip')).toHaveTextContent('1,240 coins')
  })

  it('leaves the mouse to the native tooltip', () => {
    renderWith(<span title="5 day streak">5</span>)
    tap(screen.getByText('5'), 'mouse')
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('hides on a second tap, or a tap elsewhere', () => {
    renderWith(
      <>
        <span title="5 day streak">5</span>
        <p>elsewhere</p>
      </>,
    )
    tap(screen.getByText('5'))
    tap(screen.getByText('5'))
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()

    tap(screen.getByText('5'))
    tap(screen.getByText('elsewhere'))
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('does not get in the way of links', () => {
    renderWith(<a href="#/" title="Back to your room">StudyKat</a>)
    tap(screen.getByText('StudyKat'))
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })
})
