import { useEffect, useLayoutEffect, useRef, useState } from 'react'

/** Gap between the bubble and the thing it describes, and from the screen edge. */
const GAP = 8
/** A tapped tip has no "mouse left" to end it, so it goes away on its own. */
const HIDE_AFTER_MS = 4000
/** Crossing the HUD on the way elsewhere should not flash three bubbles. */
const HOVER_DELAY_MS = 250

/** Where a hovered element's `title` waits while the bubble stands in for it. */
const PARKED = 'data-title'

interface Tip {
  anchor: Element
  text: string
  rect: DOMRect
  touch: boolean
}

/**
 * The app's tooltips.
 *
 * Every tooltip in the app is a plain `title` attribute. The native tooltip
 * cannot be styled, and a touch screen never shows it at all — there is no
 * hover. So this watches the whole app and shows any `title` in one bubble:
 *
 * - With a mouse, on hover. The `title` is parked in `data-title` while the
 *   pointer is over it, so the native tooltip does not appear alongside, and
 *   is put back the moment the pointer leaves.
 * - On touch, on tap. Links and buttons are skipped: a tap there already does
 *   something.
 */
export function Tooltips() {
  const [tip, setTip] = useState<Tip | null>(null)
  const bubbleRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let hovered: Element | null = null
    let showTimer: number | undefined
    let showing = false

    const show = (next: Tip | null) => {
      window.clearTimeout(showTimer)
      showing = next !== null
      setTip(next)
    }

    const unpark = () => {
      window.clearTimeout(showTimer)
      if (!hovered) return
      const text = hovered.getAttribute(PARKED)
      if (text !== null) hovered.setAttribute('title', text)
      hovered.removeAttribute(PARKED)
      hovered = null
    }

    const onPointerOver = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return
      const target = event.target instanceof Element ? event.target : null
      const anchor = target?.closest(`[title], [${PARKED}]`) ?? null
      if (anchor === hovered) return

      unpark()
      const text = anchor?.getAttribute('title')
      if (!anchor || !text) {
        show(null)
        return
      }
      anchor.setAttribute(PARKED, text)
      anchor.removeAttribute('title')
      hovered = anchor
      const next = { anchor, text, rect: anchor.getBoundingClientRect(), touch: false }
      // Moving from one tip straight to the next (along the heatmap, say)
      // swaps it at once; only the first one waits.
      if (showing) show(next)
      else showTimer = window.setTimeout(() => show(next), HOVER_DELAY_MS)
    }

    // Leaving the window has no element to go "over", so catch it here.
    const onPointerOut = (event: PointerEvent) => {
      if (event.pointerType === 'mouse' && !event.relatedTarget) {
        unpark()
        show(null)
      }
    }

    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType === 'mouse') return
      const target = event.target instanceof Element ? event.target : null
      const anchor = target?.closest('[title]')
      const text = anchor?.getAttribute('title')
      if (!anchor || !text || anchor.closest('a, button, input, select, textarea, label')) {
        show(null)
        return
      }
      // Tapping the same thing again puts the bubble away.
      setTip((current) => {
        const next =
          current?.anchor === anchor
            ? null
            : { anchor, text, rect: anchor.getBoundingClientRect(), touch: true }
        showing = next !== null
        return next
      })
    }

    const hide = () => {
      unpark()
      show(null)
    }

    document.addEventListener('pointerover', onPointerOver)
    document.addEventListener('pointerout', onPointerOut)
    document.addEventListener('pointerdown', onPointerDown)
    // Capture, so scrolling an inner scroller (the heatmap) also hides it.
    window.addEventListener('scroll', hide, true)
    window.addEventListener('resize', hide)
    return () => {
      document.removeEventListener('pointerover', onPointerOver)
      document.removeEventListener('pointerout', onPointerOut)
      document.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('scroll', hide, true)
      window.removeEventListener('resize', hide)
      unpark()
    }
  }, [])

  useEffect(() => {
    if (!tip?.touch) return
    const timer = window.setTimeout(() => setTip(null), HIDE_AFTER_MS)
    return () => window.clearTimeout(timer)
  }, [tip])

  // Centre over the anchor, then keep the whole bubble on screen: above it,
  // unless that would run off the top.
  useLayoutEffect(() => {
    const bubble = bubbleRef.current
    if (!tip || !bubble) return
    const { rect } = tip
    const width = bubble.offsetWidth
    const height = bubble.offsetHeight
    const centre = rect.left + rect.width / 2
    const left = Math.min(
      Math.max(centre - width / 2, GAP),
      window.innerWidth - width - GAP,
    )
    const above = rect.top - height - GAP
    const top = above >= GAP ? above : rect.bottom + GAP
    bubble.style.left = `${left}px`
    bubble.style.top = `${top}px`
    bubble.style.visibility = 'visible'
  }, [tip])

  if (!tip) return null

  return (
    <div
      ref={bubbleRef}
      role="tooltip"
      // Hidden until placed, so it never flashes at the top-left corner.
      style={{ left: 0, top: 0, visibility: 'hidden' }}
      className="pointer-events-none fixed z-50 max-w-[min(18rem,calc(100vw-16px))] rounded-xl border border-ink-line/70 bg-paper px-3 py-1.5 text-center text-xs font-bold text-ink shadow-cozy"
    >
      {tip.text}
    </div>
  )
}
