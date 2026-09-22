import { useEffect, useLayoutEffect, useRef, useState } from 'react'

/** Gap between the bubble and the thing it describes, and from the screen edge. */
const GAP = 8
const HIDE_AFTER_MS = 4000

interface Tip {
  anchor: Element
  text: string
  rect: DOMRect
}

/**
 * Tooltips on touch screens.
 *
 * Every tooltip in the app is a native `title`, which a mouse shows on hover
 * and a touch screen never shows at all — there is no hover. Rather than
 * replace each one, this listens for taps app-wide and shows the tapped
 * element's `title` in a bubble. Mouse input is ignored, so desktop keeps the
 * native tooltip and never sees both.
 *
 * Links and buttons are skipped: a tap there already does something.
 */
export function TouchTooltips() {
  const [tip, setTip] = useState<Tip | null>(null)
  const bubbleRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType === 'mouse') return
      const target = event.target instanceof Element ? event.target : null
      const anchor = target?.closest('[title]')
      const text = anchor?.getAttribute('title')
      if (!anchor || !text || anchor.closest('a, button, input, select, textarea, label')) {
        setTip(null)
        return
      }
      // Tapping the same thing again puts the bubble away.
      setTip((current) =>
        current?.anchor === anchor ? null : { anchor, text, rect: anchor.getBoundingClientRect() },
      )
    }
    const hide = () => setTip(null)

    document.addEventListener('pointerdown', onPointerDown)
    // Capture, so scrolling an inner scroller (the heatmap) also hides it.
    window.addEventListener('scroll', hide, true)
    window.addEventListener('resize', hide)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('scroll', hide, true)
      window.removeEventListener('resize', hide)
    }
  }, [])

  useEffect(() => {
    if (!tip) return
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
