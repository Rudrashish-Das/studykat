import type { Config } from 'tailwindcss'

/**
 * Cozy palette. Anchors come from the art direction brief; each anchor gets a
 * small ramp so components never hand-roll one-off colours.
 *
 * Contrast note: body text is `ink` on `cream` (8.99:1) or on `paper`
 * (10.6:1). `ink-soft` on `cream` is 5.6:1. Anything lighter than `ink-soft`
 * is decorative only and must not carry text.
 *
 * Dark mode inverts each ramp (light <-> deep) rather than inventing new
 * pairings, so `bg-wood-deep text-paper` and `bg-sage-light text-ink` keep
 * their contrast in both themes.
 */
const v = (name: string) => `rgb(var(--c-${name}) / <alpha-value>)`

const ramp = (name: string) => ({
  DEFAULT: v(`${name}-mid`),
  light: v(`${name}-light`),
  mid: v(`${name}-mid`),
  dark: v(`${name}-dark`),
  deep: v(`${name}-deep`),
})

const config: Config = {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // Every palette colour is a CSS variable (see index.css) so dark mode is
      // one class on <html> rather than a `dark:` variant on every component.
      colors: {
        cream: {
          DEFAULT: v('cream-200'),
          50: v('cream-50'),
          100: v('cream-100'),
          200: v('cream-200'),
          300: v('cream-300'),
          400: v('cream-400'),
        },
        wood: ramp('wood'),
        sage: ramp('sage'),
        rose: ramp('rose'),
        teal: ramp('teal'),
        ink: {
          DEFAULT: v('ink'),
          soft: v('ink-soft'),
          faint: v('ink-faint'),
          line: v('ink-line'),
        },
        paper: v('paper'),
        // Fixed in both themes: the focus screen is always night, and `moon`
        // is the text that sits on it.
        night: '#2b2430',
        moon: '#f6ead8',
      },
      fontFamily: {
        sans: ['Nunito', 'ui-rounded', 'Segoe UI', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        cozy: '1.25rem',
        pill: '999px',
      },
      boxShadow: {
        // Soft, warm, never a hard drop shadow.
        cozy: '0 8px 24px -12px rgb(var(--c-shadow) / 0.28)',
        'cozy-lg': '0 18px 48px -20px rgb(var(--c-shadow) / 0.35)',
        inset: 'inset 0 2px 0 0 rgba(255, 255, 255, 0.5)',
      },
      transitionTimingFunction: {
        cozy: 'cubic-bezier(0.22, 0.61, 0.36, 1)',
      },
      transitionDuration: {
        cozy: '280ms',
      },
      keyframes: {
        breathe: {
          '0%, 100%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(1.02)' },
        },
        'float-soft': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-6px)' },
        },
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        breathe: 'breathe 4.5s ease-in-out infinite',
        'float-soft': 'float-soft 6s ease-in-out infinite',
        'fade-up': 'fade-up 320ms cubic-bezier(0.22, 0.61, 0.36, 1) both',
      },
    },
  },
  plugins: [],
}

export default config
