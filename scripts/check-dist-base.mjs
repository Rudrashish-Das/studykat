#!/usr/bin/env node
/**
 * The built site's asset URLs have to match the path it is actually served
 * from, and nothing else in the pipeline looks at the built output.
 *
 * This failed in production exactly once and was invisible everywhere else: a
 * custom domain serves the site from `/`, the build still wrote
 * `/studykat/assets/...`, and every one of those URLs 404'd. The HTML loaded,
 * no script ran, the page was blank. Lint, typecheck, 180 unit tests and the
 * SQL suite were all green, because none of them opens `dist/`.
 *
 * So: whatever `index.html` asks for must exist in `dist/`, and the prefix it
 * asks under must match where GitHub Pages will serve from — the root when
 * there is a CNAME file, `/<repo>/` otherwise.
 */
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(root, 'dist')
const indexHtml = join(dist, 'index.html')

const fail = (message, detail) => {
  console.error(`\x1b[31m${message}\x1b[0m`)
  if (detail) console.error(detail)
  process.exit(1)
}

if (!existsSync(indexHtml)) fail('No dist/index.html — run `npm run build` first.')

const html = readFileSync(indexHtml, 'utf8')

// Where will this be served from?
const cname = join(root, 'public', 'CNAME')
const customDomain = existsSync(cname) ? readFileSync(cname, 'utf8').trim() : null
const repo = process.env.GITHUB_REPOSITORY?.split('/')[1] ?? 'studykat'
const expected = customDomain ? '/' : `/${repo}/`

// A custom domain only sticks if the CNAME file ships in the artifact: the
// Pages deployment replaces the whole site, settings included.
if (customDomain && !existsSync(join(dist, 'CNAME'))) {
  fail(`public/CNAME names ${customDomain}, but dist/CNAME is missing.`)
}

const urls = [...html.matchAll(/(?:src|href)="(\/[^"]*)"/g)].map((m) => m[1])
if (urls.length === 0) fail('dist/index.html references no absolute asset URLs — did the build run?')

const problems = []
for (const url of urls) {
  if (!url.startsWith(expected)) {
    problems.push(`${url}\n      served from ${expected}, so this resolves to nothing`)
    continue
  }
  const onDisk = join(dist, url.slice(expected.length))
  if (!existsSync(onDisk)) problems.push(`${url}\n      no such file: dist/${url.slice(expected.length)}`)
}

if (problems.length > 0) {
  fail(
    `dist/index.html asks for assets that will 404 (site is served from "${expected}"):`,
    problems.map((p) => `  - ${p}`).join('\n'),
  )
}

const where = customDomain ? `https://${customDomain}/` : `/${repo}/`
console.log(`\x1b[32m  ok\x1b[0m  ${urls.length} asset URLs resolve under ${where}`)
