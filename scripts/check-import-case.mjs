#!/usr/bin/env node
/**
 * Windows and macOS resolve imports case-insensitively; Linux does not. So an
 * import written `@/components/ui/card` for a file named `Card.tsx` works all
 * the way through local development and then fails only in CI.
 *
 * This walks every import in `src/` and checks it resolves against the real,
 * case-sensitive filename.
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join, dirname, resolve, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const srcDir = join(root, 'src')
const EXTS = ['', '.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx']

function walk(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full)
  }
  return out
}

/** Does this path exist with exactly this capitalisation? */
function existsExact(absolute) {
  if (!existsSync(absolute)) return false
  let current = root
  for (const part of relative(root, absolute).split(sep)) {
    if (!readdirSync(current).includes(part)) return false
    current = join(current, part)
  }
  return true
}

const problems = []
for (const file of walk(srcDir)) {
  const source = readFileSync(file, 'utf8')
  for (const m of source.matchAll(/(?:from|import)\s+['"]([^'"]+)['"]/g)) {
    const spec = m[1]
    if (!spec.startsWith('.') && !spec.startsWith('@/')) continue // a package

    const base = spec.startsWith('@/')
      ? join(srcDir, spec.slice(2))
      : resolve(dirname(file), spec)

    if (!EXTS.some((ext) => existsExact(base + ext))) {
      problems.push(`${relative(root, file)}  ->  ${spec}`)
    }
  }
}

if (problems.length > 0) {
  console.error('\x1b[31mImports that will not resolve on a case-sensitive filesystem:\x1b[0m')
  for (const p of problems) console.error('  ' + p)
  process.exit(1)
}
console.log(`\x1b[32m  ok\x1b[0m  every import in src/ resolves case-sensitively`)
