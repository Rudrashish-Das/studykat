import { HashRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useEffect } from 'react'
import { AppShell } from '@/components/layout/AppShell'
import {
  RedirectIfOnboarded,
  RedirectIfSignedIn,
  RequireAuth,
  RequireOnboarded,
} from '@/components/layout/Guards'
import { AuthProvider, useAuth } from '@/lib/auth'
import { paths } from '@/lib/paths'
import { Landing } from '@/screens/Landing'
import { Auth } from '@/screens/Auth'
import { Onboarding } from '@/screens/Onboarding'
import { Home } from '@/screens/Home'
import { Focus } from '@/screens/Focus'
import { SessionComplete } from '@/screens/SessionComplete'
import { Shop } from '@/screens/Shop'
import { RoomEditor } from '@/screens/RoomEditor'
import { Stats } from '@/screens/Stats'
import { Settings } from '@/screens/Settings'
import { NotFound } from '@/screens/NotFound'

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
          <RecoveryRedirect />
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
