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

/* --------------------------------------------------- schema vs. types ---- */

/**
 * `src/lib/supabase/types.ts` and `database.ts` are hand-written to match the
 * migrations, which means they can drift — and when they do, nothing complains
 * until a column reads back `undefined` in production. Now that the real schema
 * exists in this process, check the two against each other.
 *
 * A field in TypeScript that the database does not have is a hard failure. The
 * reverse is fine and common: plenty of columns (`updated_at`, `sort_order`)
 * are deliberately not modelled.
 */
const TYPE_TO_TABLE = {
  Profile: 'profiles',
  Subject: 'subjects',
  StudySession: 'study_sessions',
  Wallet: 'wallet',
  Transaction: 'transactions',
  Streak: 'streaks',
  CatalogItem: 'catalog_items',
  InventoryRow: 'inventory',
  RoomLayoutRow: 'room_layout',
  CatFood: 'cat_foods',
}

function fieldsOfType(source, typeName) {
  const start = source.indexOf(`export type ${typeName} = {`)
  if (start === -1) return null
  let depth = 0
  let i = source.indexOf('{', start)
  const open = i
  for (; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1
    else if (source[i] === '}') {
      depth -= 1
      if (depth === 0) break
    }
  }
  const body = source.slice(open + 1, i)
  // Top-level `name:` lines only — skip anything nested inside a sub-object.
  return body
    .split('\n')
    .map((line) => /^ {2}(\w+)\??:/.exec(line))
    .filter(Boolean)
    .map((m) => m[1])
}

/**
 * The whole security model rests on one invariant: the anon key is public, and
 * the only thing standing between it and the data is row-level security. A
 * table in `public` with RLS off is readable and writable by anyone who opens
 * the JavaScript bundle, because Supabase grants the API roles full table
 * privileges by default.
 *
 * So: assert RLS is on everywhere, and print exactly what the client can write
 * and what a signed-out visitor can read, rather than trusting that the
 * policies say what we remember writing.
 */
async function checkRlsCoverage(db) {
  const { rows: tables } = await db.query(
    `select c.relname as tbl, c.relrowsecurity as rls
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
      order by 1`,
  )

  const unprotected = tables.filter((t) => !t.rls)
  if (unprotected.length > 0) {
    for (const t of unprotected) {
      console.log(`${red('fail')}  ${t.tbl}: row-level security is OFF`)
    }
    return false
  }
  console.log(`${green('  ok')}  row-level security on all ${tables.length} tables`)

  const { rows: policies } = await db.query(
    `select tablename, cmd from pg_policies where schemaname = 'public'`,
  )
  const writable = [...new Set(policies.filter((p) => p.cmd !== 'SELECT').map((p) => p.tablename))]
  const { rows: anonRows } = await db.query(
    `select distinct tablename from pg_policies
      where schemaname = 'public' and 'anon' = any(roles)`,
  )

  console.log(`${green('  ok')}  client-writable tables: ${writable.join(', ') || '(none)'}`)
  console.log(
    `${green('  ok')}  readable signed-out: ${anonRows.map((r) => r.tablename).join(', ') || '(none)'}`,
  )

  // These five are the economy. If any of them ever gains a write policy, the
  // anon key stops being safe to publish.
  const mustBeReadOnly = ['wallet', 'transactions', 'streaks', 'study_sessions', 'inventory']
  const leaked = mustBeReadOnly.filter((t) => writable.includes(t))
  if (leaked.length > 0) {
    console.log(`${red('fail')}  these must never be client-writable: ${leaked.join(', ')}`)
    return false
  }
  return true
}

async function checkSchemaMatchesTypes(db) {
  const typesSrc = readFileSync(join(root, 'src', 'lib', 'supabase', 'types.ts'), 'utf8')
  const dbSrc = readFileSync(join(root, 'src', 'lib', 'supabase', 'database.ts'), 'utf8')
  let failed = false

  for (const [typeName, table] of Object.entries(TYPE_TO_TABLE)) {
    const fields = fieldsOfType(typesSrc, typeName)
    if (!fields) {
      console.log(`${red('fail')}  type ${typeName} not found in types.ts`)
      failed = true
      continue
    }
    const { rows } = await db.query(
      `select column_name from information_schema.columns
        where table_schema = 'public' and table_name = $1`,
      [table],
    )
    const columns = new Set(rows.map((r) => r.column_name))
    const missing = fields.filter((f) => !columns.has(f))
    if (missing.length > 0) {
      console.log(`${red('fail')}  ${typeName} -> ${table}: no such column: ${missing.join(', ')}`)
      failed = true
    } else {
      const unmodelled = [...columns].filter((c) => !fields.includes(c))
      const note = unmodelled.length > 0 ? dim(` (not modelled: ${unmodelled.join(', ')})`) : ''
      console.log(`${green('  ok')}  ${typeName} -> ${table}${note}`)
    }
  }

  // Every RPC the client can name must exist, or it is a runtime 404.
  const fnBlock = dbSrc.slice(dbSrc.indexOf('Functions: {'), dbSrc.indexOf('Enums: {'))
  const declared = [...fnBlock.matchAll(/^ {6}(\w+): \{/gm)].map((m) => m[1])
  const { rows: procs } = await db.query(
    `select p.proname from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'`,
  )
  const existing = new Set(procs.map((r) => r.proname))
  const missingFns = declared.filter((f) => !existing.has(f))
  if (missingFns.length > 0) {
    console.log(`${red('fail')}  RPCs declared in database.ts but absent: ${missingFns.join(', ')}`)
    failed = true
  } else {
    console.log(`${green('  ok')}  ${declared.length} RPCs in database.ts all exist`)
  }

  return !failed
}

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
  console.log(dim('checking row-level security coverage...'))
  const rlsOk = await checkRlsCoverage(db)
  if (!rlsOk) {
    console.error(`\n${red('The anon key would not be safe to publish against this schema.')}`)
    process.exit(1)
  }

  console.log()
  console.log(dim('checking the hand-written types against the real schema...'))
  const typesOk = await checkSchemaMatchesTypes(db)
  if (!typesOk) {
    console.error(`\n${red('TypeScript types do not match the schema.')}`)
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
