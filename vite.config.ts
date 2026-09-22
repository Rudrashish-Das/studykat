import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'
import { existsSync } from 'node:fs'

/** GitHub Pages reads the custom domain from a CNAME file at the site root. */
const cnameFile = fileURLToPath(new URL('./public/CNAME', import.meta.url))

/**
 * GitHub Pages serves this app from a subpath (`/<repo>/`) — unless there is a
 * custom domain, which serves it from the root instead.
 *
 * So `public/CNAME` decides the base as well as the domain. That file is the
 * one fact that already has to be right for the domain to work at all, and
 * deriving the base from it means the two cannot disagree: with a custom
 * domain configured and a `/<repo>/` base, every asset URL 404s and the page
 * renders blank. Same reasoning as reading `GITHUB_REPOSITORY` below rather
 * than writing the repo name out — one source, no drift.
 *
 * `VITE_BASE_PATH` overrides both, for a host that is neither.
 */
function resolveBase(isDevServer: boolean): string {
  if (isDevServer) return '/'
  const explicit = process.env.VITE_BASE_PATH
  if (explicit) return explicit.endsWith('/') ? explicit : `${explicit}/`
  if (existsSync(cnameFile)) return '/'
  const repo = process.env.GITHUB_REPOSITORY?.split('/')[1]
  return repo ? `/${repo}/` : '/studykat/'
}

export default defineConfig(({ command, isPreview }) => ({
  // `command` is 'serve' for both `vite dev` and `vite preview`, but preview
  // serves an already-built `dist/` whose asset URLs carry the subpath — so it
  // has to mount at the subpath too, or every asset 404s.
  base: resolveBase(command === 'serve' && !isPreview),
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        // Split the two big third-party groups out of the app chunk so a
        // change to a screen does not invalidate the whole download.
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          supabase: ['@supabase/supabase-js', '@tanstack/react-query'],
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
}))
