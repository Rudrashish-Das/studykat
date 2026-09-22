#!/usr/bin/env node
/**
 * Runs the migrations and the SQL assertions against PGlite — real PostgreSQL
 * compiled to WebAssembly, running in this Node process.
 *
 * The point is that it needs nothing installed: no Docker, no local Postgres,
 * no Supabase project. `npm run test:sql` works on any machine that can run
 * `npm test`, which means the schema actually gets exercised in CI instead of
 * being reviewed and hoped about.
 *
 * It is not a perfect stand-in for Supabase — PGlite is single-connection, and
 * `00_shim.sql` fakes the `auth` schema and the API roles. What it does prove
 * is that every migration parses and executes in order, that the policies and
 * grants land, and that the economy behaves. Run `supabase/tests/run.sh`
 * against a throwaway container, or the files against a scratch project, when
 * you want the real thing.
 */
import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const migrationsDir = join(root, 'supabase', 'migrations')
const testsDir = join(root, 'supabase', 'tests')

/** psql meta-commands (`\echo`, `\i`) are not SQL; PGlite would choke on them. */
function stripPsqlMeta(sql) {
  return sql
    .split('\n')
    .filter((line) => !/^\s*\\/.test(line))
    .join('\n')
}

function read(path) {
  return stripPsqlMeta(readFileSync(path, 'utf8'))
}

const green = (s) => `\x1b[32m${s}\x1b[0m`
const red = (s) => `\x1b[31m${s}\x1b[0m`
const dim = (s) => `\x1b[2m${s}\x1b[0m`

async function main() {
  const db = await PGlite.create()
  const version = (await db.query('select version()')).rows[0].version
  console.log(dim(version.split(',')[0]))
  console.log()

  const steps = [
    ['shim', join(testsDir, '00_shim.sql')],
    ...readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort()
      .map((f) => [basename(f, '.sql'), join(migrationsDir, f)]),
    ['helpers', join(testsDir, '01_helpers.sql')],
  ]

  for (const [name, path] of steps) {
    try {
      if (name === 'helpers') {
        // The fixtures refuse to install without this. Safe here: the database
        // lives in memory and dies with the process.
        await db.exec("set studykat.i_know_this_is_a_test_database = 'yes';")
      }
      await db.exec(read(path))
      console.log(`${green('  ok')}  ${name}`)
    } catch (error) {
      console.log(`${red('fail')}  ${name}`)
      console.error(`\n${red(error.message)}`)
      if (error.hint) console.error(dim(`hint: ${error.hint}`))
      if (error.detail) console.error(dim(`detail: ${error.detail}`))
      if (error.position) {
        const sql = read(path)
        const upto = sql.slice(0, Number(error.position))
        const line = upto.split('\n').length
        console.error(dim(`at ${basename(path)}:${line}`))
        console.error(dim(sql.split('\n').slice(Math.max(0, line - 4), line + 2).join('\n')))
      }
      process.exit(1)
    }
  }

  console.log()
  console.log(dim('running assertions...'))
  try {
    await db.exec(read(join(testsDir, 'rls_and_rpc.sql')))
  } catch (error) {
    console.error(`\n${red('ASSERTION FAILED')}`)
    console.error(red(error.message))
    if (error.detail) console.error(dim(`detail: ${error.detail}`))
    if (error.where) console.error(dim(error.where))
    process.exit(1)
  }

  console.log()
  console.log(green('  All SQL assertions passed.'))
  await db.close()
}

main().catch((error) => {
  console.error(red(error.stack ?? String(error)))
  process.exit(1)
})
