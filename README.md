# StudyKat

A cozy study timer. Run a session, earn coins for focused minutes, keep a daily
streak, and spend the coins decorating an isometric room for a cat that is
generated from your account's seed and exists on no other account.

Static site on GitHub Pages; Supabase for auth, Postgres, and all economy logic.
There is no server to run.

## Status

| Phase | Scope | State |
|---|---|---|
| 1 | Skeleton: Vite + TS + Tailwind + router, design tokens, placeholder screens, CI deploy | **done** |
| 2 | Auth: Supabase, email/password, Google OAuth, protected routes, `profiles` trigger | **code done**, needs the project set up (SETUP.md) |
| 3 | Timer and economy: schema, RLS, RPCs, server-anchored timer, coins, streaks | **done**, migrations verified against PGlite |
| 4 | The cat: seeded generator, SVG component, poses, idle animations, onboarding picker | **done** |
| 5 | The room: isometric renderer, catalog, shop, purchases, editor, cat pathing | **done** |
| 6 | Stats, polish, accessibility pass, mobile pass | **done** |

Everything through Phase 6 is written, typechecked, linted, building, and — as
of `npm run test:sql` — actually executed: all seven migrations apply cleanly
and 94 SQL assertions pass against an in-process PostgreSQL.

What has **not** happened is a run against a live Supabase project. No signup,
session, or purchase has gone end to end through PostgREST, and the API roles
and default grants are modelled by a shim rather than observed. See
[SETUP.md](SETUP.md) §2.3 to apply the migrations, and
[SECURITY.md](SECURITY.md) for exactly how far the verification goes.

## Tests

`npm test` runs 149 unit tests covering the parts that must be right:

| Area | What is pinned |
|---|---|
| `src/lib/economy/coins.test.ts` | The coin formula, case by case, including the daily cap and the sub-5-minute floor |
| `src/lib/economy/streak.test.ts` | Day boundaries in real timezones, DST transitions in both directions, freeze tokens |
| `src/lib/cat/appearance.test.ts` | The cat generator's determinism, and that the PRNG output never silently changes |
| `src/lib/iso/projection.test.ts` | Isometric projection, footprint collision, and depth sorting |
| `src/lib/timer.test.ts` | Elapsed time derived from `started_at`, including pauses and slept tabs |

`npm run test:sql` runs the migrations and 94 SQL assertions against PGlite —
PostgreSQL compiled to WebAssembly — so the schema, the row-level security
policies and the whole economy are exercised on any machine that can run
`npm test`, with no Docker and no database to set up. It runs in CI too.

It finishes by checking the hand-written types in `src/lib/supabase/` against
the schema it just built: a field in TypeScript with no matching column, or an
RPC named in `database.ts` that does not exist, fails the run. Those are the
mistakes that otherwise surface as `undefined` in production rather than as a
compile error.

`npm run lint` runs ESLint with type-aware rules — floating promises, hook
dependencies, and `jsx-a11y` — and is gated in CI alongside typecheck, tests,
and the build.

`supabase/tests/` holds SQL assertions for the RPCs and row-level security,
including the explicit "the client cannot write to `wallet`" negative test and
regressions for every finding in [SECURITY.md](SECURITY.md). Those need a
database — see the README there, and note that its fixtures must never be
installed on a project with real accounts.

## Running locally

```bash
npm install
npm run dev
```

Then open http://localhost:5173. No Supabase project is needed until Phase 2;
copy `.env.example` to `.env.local` when it is.

| Script | What it does |
|---|---|
| `npm run dev` | Vite dev server on :5173 (served at `/`, not the Pages subpath) |
| `npm run typecheck` | `tsc --noEmit` over both the app and the build config |
| `npm test` | Vitest, once |
| `npm run build` | Typecheck, then production build into `dist/` |
| `npm run preview` | Serve `dist/` — note it is served at the subpath, so use the URL Vite prints |

## Deployment

Push to `main`; `.github/workflows/deploy.yml` typechecks, tests, builds, and
publishes `dist/` to GitHub Pages. See [SETUP.md](SETUP.md) for the one-time
repository and Supabase configuration.

`vite.config.ts` derives `base` from `GITHUB_REPOSITORY` in CI, so renaming the
repository cannot desync the asset paths. Override with `VITE_BASE_PATH` (set it
to `/` for a custom domain).

## Design notes

- **Routing is `HashRouter`.** GitHub Pages has no rewrite rules, so deep links
  would 404 under a `BrowserRouter`.
- **The Supabase anon key ships in the bundle.** That is safe only because every
  table has row-level security enabled and every economy write — coins, streaks,
  inventory, purchases — goes through a `SECURITY DEFINER` Postgres function.
  The client never writes to `wallet`, `streaks`, or `inventory` directly.
- **`localStorage` is never the source of truth** for anything earned. It caches
  UI preferences only.
- A security audit of the schema, policies, auth flow and dependencies is
  written up in [SECURITY.md](SECURITY.md), along with the accepted risks.
- Palette, spacing, motion, and the isometric tile constants live in
  `tailwind.config.ts` and `src/index.css`. Components should not hand-roll
  colours.
