# StudyCat

A cozy study timer. Run a session, earn coins for focused minutes, keep a daily
streak, and spend the coins decorating an isometric room for a cat that is
generated from your account's seed and exists on no other account.

Static site on GitHub Pages; Supabase for auth, Postgres, and all economy logic.
There is no server to run.

## Status

| Phase | Scope | State |
|---|---|---|
| 1 | Skeleton: Vite + TS + Tailwind + router, design tokens, placeholder screens, CI deploy | **done** |
| 2 | Auth: Supabase, email/password, Google OAuth, protected routes, `profiles` trigger | not started |
| 3 | Timer and economy: schema, RLS, RPCs, server-anchored timer, coins, streaks | not started |
| 4 | The cat: seeded generator, SVG component, poses, idle animations, onboarding picker | not started |
| 5 | The room: isometric renderer, catalog, shop, purchases, editor, cat pathing | not started |
| 6 | Stats, polish, accessibility pass, mobile pass | not started |

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
- Palette, spacing, motion, and the isometric tile constants live in
  `tailwind.config.ts` and `src/index.css`. Components should not hand-roll
  colours.
