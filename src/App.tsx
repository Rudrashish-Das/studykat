import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppShell } from '@/components/layout/AppShell'
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
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-pill focus:bg-paper focus:px-5 focus:py-2.5 focus:font-bold focus:shadow-cozy"
        >
          Skip to content
        </a>
        <Routes>
          {/* Public + full-bleed screens render outside the app shell. */}
          <Route path={paths.landing} element={<Landing />} />
          <Route path={paths.login} element={<Auth mode="login" />} />
          <Route path={paths.register} element={<Auth mode="register" />} />
          <Route path={paths.reset} element={<Auth mode="reset" />} />
          <Route path={paths.onboarding} element={<Onboarding />} />
          <Route path={paths.focus} element={<Focus />} />
          <Route path={paths.sessionComplete} element={<SessionComplete />} />

          {/* Signed-in screens share the nav chrome. Phase 2 puts an auth
              guard on this branch. */}
          <Route element={<AppShell />}>
            <Route path={paths.home} element={<Home />} />
            <Route path={paths.shop} element={<Shop />} />
            <Route path={paths.room} element={<RoomEditor />} />
            <Route path={paths.stats} element={<Stats />} />
            <Route path={paths.settings} element={<Settings />} />
          </Route>

          <Route path="/index.html" element={<Navigate to={paths.landing} replace />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </HashRouter>
    </QueryClientProvider>
  )
}
