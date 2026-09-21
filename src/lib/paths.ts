/** Single source of truth for route paths (HashRouter, so these live after `#`). */
export const paths = {
  landing: '/',
  login: '/login',
  register: '/register',
  reset: '/reset-password',
  onboarding: '/onboarding',
  home: '/home',
  focus: '/focus',
  sessionComplete: '/session-complete',
  shop: '/shop',
  room: '/room',
  stats: '/stats',
  settings: '/settings',
} as const
