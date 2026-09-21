import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

/**
 * GitHub Pages serves this app from a subpath (`/<repo>/`), so Vite needs a
 * matching `base`. We derive it from `GITHUB_REPOSITORY` in CI so renaming the
 * repo can never desync the build, and fall back to `/studycat/` locally.
 * `VITE_BASE_PATH` overrides both (e.g. for a custom domain, where it is `/`).
 */
function resolveBase(isDevServer: boolean): string {
  if (isDevServer) return '/'
  const explicit = process.env.VITE_BASE_PATH
  if (explicit) return explicit.endsWith('/') ? explicit : `${explicit}/`
  const repo = process.env.GITHUB_REPOSITORY?.split('/')[1]
  return repo ? `/${repo}/` : '/studycat/'
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
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
}))
