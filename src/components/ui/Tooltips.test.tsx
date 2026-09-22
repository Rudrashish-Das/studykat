import { act, createEvent, fireEvent, render, screen } from '@testing-library/react'
import { Tooltips } from './Tooltips'

/**
 * Every tooltip was a native `title`, which touch screens never show — on a
 * phone the HUD stats and the Stats charts explained nothing — and which on a
 * desktop could not be styled to match the app.
 */
function renderWith(ui: React.ReactNode) {
  return render(
    <>
      <Tooltips />
      {ui}
    </>,
  )
}

// jsdom has no PointerEvent, so `pointerType` has to be set on the event by hand.
const pointer = (
  kind: 'pointerDown' | 'pointerOver' | 'pointerOut',
  el: Element,
  pointerType: string,
  init: EventInit & { relatedTarget?: Element | null } = {},
) => {
  const event = createEvent[kind](el, init)
  Object.defineProperty(event, 'pointerType', { value: pointerType })
  act(() => {
    fireEvent(el, event)
  })
}
const tap = (el: Element, pointerType = 'touch') => pointer('pointerDown', el, pointerType)
const hover = (el: Element) => pointer('pointerOver', el, 'mouse')

describe('tooltips on touch', () => {
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

  it('ignores a mouse click; hover handles the mouse', () => {
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

describe('tooltips on hover', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  const wait = (ms: number) =>
    act(() => {
      vi.advanceTimersByTime(ms)
    })

  it('shows the styled bubble after a short pause', () => {
    renderWith(<span title="5 day streak">5</span>)
    hover(screen.getByText('5'))
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    wait(300)
    expect(screen.getByRole('tooltip')).toHaveTextContent('5 day streak')
  })

  it('parks the title while hovered so the native tooltip does not show too', () => {
    renderWith(
      <>
        <span title="5 day streak">5</span>
        <p>elsewhere</p>
      </>,
    )
    const flame = screen.getByText('5')
    hover(flame)
    expect(flame).not.toHaveAttribute('title')

    hover(screen.getByText('elsewhere'))
    expect(flame).toHaveAttribute('title', '5 day streak')
    expect(flame).not.toHaveAttribute('data-title')
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('swaps straight to the next tip once one is showing', () => {
    renderWith(
      <>
        <span title="Monday: 1h">a</span>
        <span title="Tuesday: 2h">b</span>
      </>,
    )
    hover(screen.getByText('a'))
    wait(300)
    hover(screen.getByText('b'))
    expect(screen.getByRole('tooltip')).toHaveTextContent('Tuesday: 2h')
  })

  it('stays up while hovered, unlike a tapped tip', () => {
    renderWith(<span title="5 day streak">5</span>)
    hover(screen.getByText('5'))
    wait(10_000)
    expect(screen.getByRole('tooltip')).toBeInTheDocument()
  })

  it('hides and restores the title when the mouse leaves the window', () => {
    renderWith(<span title="5 day streak">5</span>)
    const flame = screen.getByText('5')
    hover(flame)
    wait(300)
    pointer('pointerOut', flame, 'mouse', { relatedTarget: null })
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    expect(flame).toHaveAttribute('title', '5 day streak')
  })

  it('works on links too, since hovering does not follow them', () => {
    renderWith(<a href="#/" title="Back to your room">StudyKat</a>)
    hover(screen.getByText('StudyKat'))
    wait(300)
    expect(screen.getByRole('tooltip')).toHaveTextContent('Back to your room')
  })
})
