import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

/**
 * GitHub Pages serves this app from a subpath (`/<repo>/`), so Vite needs a
 * matching `base`. We derive it from `GITHUB_REPOSITORY` in CI so renaming the
 * repo can never desync the build, and fall back to `/studycat/` locally.
 * `VITE_BASE_PATH` overrides both (e.g. for a custom domain, where it is `/`).
 */
function resolveBase(isServe: boolean): string {
  if (isServe) return '/'
  const explicit = process.env.VITE_BASE_PATH
  if (explicit) return explicit.endsWith('/') ? explicit : `${explicit}/`
  const repo = process.env.GITHUB_REPOSITORY?.split('/')[1]
  return repo ? `/${repo}/` : '/studycat/'
}

export default defineConfig(({ command }) => ({
  base: resolveBase(command === 'serve'),
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
