import type { EndSessionResult } from '@/lib/supabase/types'

/**
 * The payoff from the session that just ended, handed from Focus mode to the
 * session-complete screen.
 *
 * It lives in a module variable rather than in router state or localStorage on
 * purpose: it is the server's own response, it is only meaningful for the few
 * seconds between the two screens, and nothing the user earned depends on it —
 * the wallet and streak are already written. Reloading the complete screen
 * simply sends them home.
 */
let lastResult: EndSessionResult | null = null

export function setLastResult(result: EndSessionResult): void {
  lastResult = result
}

export function takeLastResult(): EndSessionResult | null {
  const result = lastResult
  lastResult = null
  return result
}
