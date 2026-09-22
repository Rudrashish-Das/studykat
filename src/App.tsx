import { HashRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Suspense, lazy, useEffect } from 'react'
import { AppShell } from '@/components/layout/AppShell'
import { Tooltips } from '@/components/ui/Tooltips'
import {
  RedirectIfOnboarded,
  RedirectIfSignedIn,
  RequireAuth,
  RequireOnboarded,
} from '@/components/layout/Guards'
import { AuthProvider } from '@/lib/auth'
import { useAuth } from '@/lib/useAuth'
import { paths } from '@/lib/paths'
import { Landing } from '@/screens/Landing'
import { Auth } from '@/screens/Auth'
import { NotFound } from '@/screens/NotFound'
import { FullScreenSpinner } from '@/components/ui/Spinner'

// The signed-in screens carry the room renderer, the cat and all the furniture
// art, none of which the landing and sign-in pages need. Loading them on
// demand keeps that out of a first visit's download.
const screens = {
  onboarding: () => import('@/screens/Onboarding'),
  home: () => import('@/screens/Home'),
  focus: () => import('@/screens/Focus'),
  sessionComplete: () => import('@/screens/SessionComplete'),
  shop: () => import('@/screens/Shop'),
  room: () => import('@/screens/RoomEditor'),
  stats: () => import('@/screens/Stats'),
  settings: () => import('@/screens/Settings'),
}
const Onboarding = lazy(() => screens.onboarding().then((m) => ({ default: m.Onboarding })))
const Home = lazy(() => screens.home().then((m) => ({ default: m.Home })))
const Focus = lazy(() => screens.focus().then((m) => ({ default: m.Focus })))
const SessionComplete = lazy(() =>
  screens.sessionComplete().then((m) => ({ default: m.SessionComplete })),
)
const Shop = lazy(() => screens.shop().then((m) => ({ default: m.Shop })))
const RoomEditor = lazy(() => screens.room().then((m) => ({ default: m.RoomEditor })))
const Stats = lazy(() => screens.stats().then((m) => ({ default: m.Stats })))
const Settings = lazy(() => screens.settings().then((m) => ({ default: m.Settings })))

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: true,
    },
  },
})

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      {/* HashRouter, not BrowserRouter: GitHub Pages has no rewrite rules, so
          every deep link would 404 without the hash (§3). */}
      <HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AuthProvider>
          <SkipLink />
          <Tooltips />
          <RecoveryRedirect />
          <PreloadScreens />
          <Suspense fallback={<FullScreenSpinner label="Loading" />}>
            <Routes>
              {/* Public. Signed-in users are bounced to their room. */}
              <Route
                path={paths.landing}
                element={
                  <RedirectIfSignedIn>
                    <Landing />
                  </RedirectIfSignedIn>
                }
              />
              <Route
                path={paths.login}
                element={
                  <RedirectIfSignedIn>
                    <Auth mode="login" />
                  </RedirectIfSignedIn>
                }
              />
              <Route
                path={paths.register}
                element={
                  <RedirectIfSignedIn>
                    <Auth mode="register" />
                  </RedirectIfSignedIn>
                }
              />
              <Route path={paths.reset} element={<Auth mode="reset" />} />
              {/* Reached from a reset email, where a recovery session is active. */}
              <Route path={paths.newPassword} element={<Auth mode="new-password" />} />

              {/* Signed in. */}
              <Route element={<RequireAuth />}>
                <Route element={<RedirectIfOnboarded />}>
                  <Route path={paths.onboarding} element={<Onboarding />} />
                </Route>

                <Route element={<RequireOnboarded />}>
                  {/* Full-bleed: Focus mode and the payoff screen get no chrome. */}
                  <Route path={paths.focus} element={<Focus />} />
                  <Route path={paths.sessionComplete} element={<SessionComplete />} />

                  <Route element={<AppShell />}>
                    <Route path={paths.home} element={<Home />} />
                    <Route path={paths.shop} element={<Shop />} />
                    <Route path={paths.room} element={<RoomEditor />} />
                    <Route path={paths.stats} element={<Stats />} />
                    <Route path={paths.settings} element={<Settings />} />
                  </Route>
                </Route>
              </Route>

              <Route path="/index.html" element={<Navigate to={paths.landing} replace />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </AuthProvider>
      </HashRouter>
    </QueryClientProvider>
  )
}

function SkipLink() {
  return (
    <a
      href="#main"
      className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-pill focus:bg-paper focus:px-5 focus:py-2.5 focus:font-bold focus:shadow-cozy"
    >
      Skip to content
    </a>
  )
}

/**
 * Once someone is signed in, fetch the rest of the screens while the browser is
 * idle. A route change waits for its screen's code, and holds the old screen —
 * nav highlight and all — until it arrives, so switching tabs felt laggy
 * whenever that code was not already here.
 */
function PreloadScreens() {
  const { user } = useAuth()

  useEffect(() => {
    if (!user) return
    const preload = () => {
      for (const load of Object.values(screens)) void load().catch(() => undefined)
    }
    // Safari has no requestIdleCallback.
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(preload, { timeout: 3000 })
      return () => window.cancelIdleCallback(id)
    }
    const id = window.setTimeout(preload, 1500)
    return () => window.clearTimeout(id)
  }, [user])

  return null
}

/**
 * Arriving from a password-reset email signs the user in with a recovery
 * session. Without this they would land in the app and never be asked to set a
 * new password, which is the one thing they came to do.
 */
function RecoveryRedirect() {
  const { recovery } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    if (recovery && location.pathname !== paths.newPassword) {
      navigate(paths.newPassword, { replace: true })
    }
  }, [recovery, location.pathname, navigate])

  return null
}
