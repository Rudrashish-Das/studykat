import { Outlet } from 'react-router-dom'
import { NavBar } from './NavBar'

/** Frame for the signed-in screens. Auth and Focus mode render outside it. */
export function AppShell() {
  return (
    <div className="flex min-h-full flex-col">
      <NavBar />
      <main id="main" className="flex-1">
        <Outlet />
      </main>
    </div>
  )
}
