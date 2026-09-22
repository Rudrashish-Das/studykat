import { useLayoutEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { NavBar } from './NavBar'

/** Frame for the signed-in screens. Auth and Focus mode render outside it. */
export function AppShell() {
  const { pathname } = useLocation()

  // Each tab opens at its top. Without this a screen inherited the previous
  // one's scroll position, so Settings could reopen already near its bottom.
  useLayoutEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])

  return (
    <div className="flex min-h-full flex-col">
      <NavBar />
      {/* On a phone the nav is fixed to the bottom, so leave room for it. */}
      <main id="main" className="flex-1 pb-[calc(3.5rem+env(safe-area-inset-bottom))] sm:pb-0">
        <Outlet />
      </main>
    </div>
  )
}
