import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'
import { existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import type { Plugin } from 'vite'

/**
 * A Content Security Policy for the built site. GitHub Pages cannot send
 * response headers, so it goes in a <meta> tag — which means `frame-ancestors`
 * is not available, but everything else is.
 *
 * Build only: the dev server injects its own inline scripts for hot reload,
 * which this policy would rightly block. The theme script in index.html is
 * allowed by its hash, computed here from the final HTML so editing the script
 * cannot silently break the page.
 */
function contentSecurityPolicy(): Plugin {
  const supabase = process.env.VITE_SUPABASE_URL?.trim()
  const supabaseOrigin = supabase?.startsWith('https://') ? new URL(supabase).origin : 'https://*.supabase.co'
  const supabaseSocket = supabaseOrigin.replace('https://', 'wss://')

  return {
    name: 'studykat-csp',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        const inlineHashes = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(
          (m) => `'sha256-${createHash('sha256').update(m[1]).digest('base64')}'`,
        )
        const policy = [
          "default-src 'self'",
          `script-src 'self' ${inlineHashes.join(' ')}`,
          "style-src 'self' https://fonts.googleapis.com",
          'font-src https://fonts.gstatic.com',
          "img-src 'self' data:",
          `connect-src 'self' ${supabaseOrigin} ${supabaseSocket}`,
          "object-src 'none'",
          "base-uri 'self'",
          "form-action 'self'",
        ].join('; ')
        return html.replace(
          '<meta charset="UTF-8" />',
          `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />`,
        )
      },
    },
  }
}

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
  plugins: [react(), contentSecurityPolicy()],
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
    // No source maps: everything in dist/ is published, so a map would put the
    // full source, comments and all, on the live site. `vite build --sourcemap`
    // gets them back for debugging a local build.
    sourcemap: false,
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
