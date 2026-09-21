import type { Config } from 'tailwindcss'

/**
 * Cozy palette. Anchors come from the art direction brief; each anchor gets a
 * small ramp so components never hand-roll one-off colours.
 *
 * Contrast note: body text is `ink` on `cream` (8.99:1) or on `paper`
 * (10.6:1). `ink-soft` on `cream` is 5.6:1. Anything lighter than `ink-soft`
 * is decorative only and must not carry text.
 */
const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        cream: {
          DEFAULT: '#f6ead8',
          50: '#fdf9f2',
          100: '#faf2e6',
          200: '#f6ead8',
          300: '#eedcc2',
          400: '#e3c9a4',
        },
        wood: {
          DEFAULT: '#c99a6b',
          light: '#dcb68d',
          mid: '#c99a6b',
          dark: '#a67a4f',
          deep: '#7d5836',
        },
        sage: {
          DEFAULT: '#a7b89b',
          light: '#c3d0b9',
          mid: '#a7b89b',
          dark: '#7f9472',
          deep: '#5d7052',
        },
        rose: {
          DEFAULT: '#d9a5a0',
          light: '#ecc7c3',
          mid: '#d9a5a0',
          dark: '#b87e78',
          deep: '#8f5a55',
        },
        teal: {
          DEFAULT: '#7fa8a4',
          light: '#a8c6c3',
          mid: '#7fa8a4',
          dark: '#5d8682',
          deep: '#43635f',
        },
        ink: {
          DEFAULT: '#4a3b34',
          soft: '#6b5a51',
          faint: '#9c8a7f',
          line: '#d8c8b4',
        },
        paper: '#fffaf2',
        night: '#2b2430',
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
        cozy: '0 8px 24px -12px rgba(74, 59, 52, 0.28)',
        'cozy-lg': '0 18px 48px -20px rgba(74, 59, 52, 0.35)',
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
