# Security

## The model in one paragraph

StudyKat is a static site with no server of its own. The Supabase anon key ships
inside the JavaScript bundle and is public by design. That is safe **only**
because every table has row-level security enabled, the client holds `SELECT` on
its own rows and essentially nothing else, and every write that creates value —
coins, streaks, inventory, sessions — happens inside a `SECURITY DEFINER`
Postgres function. Compromising the key gets an attacker exactly what any signed
-out visitor already has.

The one table the client writes directly is `room_layout`, because arranging
furniture creates no value, and even there the policy requires that you own the
item.

---

## Audit, 2026-09-22

Scope: the SQL migrations, the row-level security policies, the client's data
layer, the auth flow, the deployment workflow, and the dependency tree. The
findings below were all found and fixed in this pass; regression assertions for
each live in `supabase/tests/rls_and_rpc.sql`.

**How far this is verified.** All seven migrations and 94 assertions now run
green against PGlite — real PostgreSQL 18 compiled to WebAssembly — via
`npm run test:sql`, and the same suite runs in CI. That covers every finding
below with a regression test, and the harness is checked to fail on a bad
assertion rather than passing vacuously.

What it does *not* cover: PGlite is single-connection, and `00_shim.sql` fakes
Supabase's `auth` schema, its `anon`/`authenticated` roles, and its default
grants. The grant and policy behaviour is therefore modelled rather than
observed. Nothing has been run against a real Supabase project, and no signup,
session, or purchase has gone end to end through PostgREST. Treat the row-level
security results as strong evidence, not proof, until the migrations are applied
to a scratch project and the suite is run there.

### Fixed

#### 1. Cross-user data disclosure via internal rollup helpers — *high*

`credited_seconds_on`, `session_coins_on`, and `goal_bonus_paid_on` are
`SECURITY DEFINER` and take an arbitrary `p_user uuid`. Supabase grants
`EXECUTE` on public functions to `authenticated` by default, so any signed-in
user could call them over PostgREST with someone else's id:

```sql
select credited_seconds_on('<another-user-id>', 'UTC', '2026-09-21');
```

and read that account's study time, coin total for the day, or whether they had
met their goal. Row-level security does not help here: a definer function runs
as its owner, which is the whole point of it.

**Fixed** in `0007_hardening.sql` by revoking `EXECUTE` from `public`, `anon`,
and `authenticated`. They are internals of `end_session` and `get_today`, which
still reach them because a definer body runs as the definer — a case the tests
now assert explicitly, since revoking a function your own RPCs depend on is
exactly the kind of fix that can break the thing it protects.

#### 2. Test fixtures could mint currency if installed on a live database — *high*

`supabase/tests/01_helpers.sql` installs `SECURITY DEFINER` fixtures —
`tst.set_coins`, `tst.set_streak`, `tst.backdate_session` — and grants them to
`authenticated`, because the tests must run as that role in order to prove what
RLS blocks. While installed, **any signed-in user can call `tst.set_coins()` and
give themselves unlimited coins.**

The dangerous part was the documentation: the previous `supabase/tests/README.md`
instructed the reader to run the helpers against their real Supabase project.

**Fixed** three ways: the file now refuses to install unless the session sets
`studykat.i_know_this_is_a_test_database` *and* the database has at most five
accounts, so pasting it into a live project's SQL editor fails closed; the
`anon` grant is dropped; and the README now says plainly not to do this, with
teardown instructions.

#### 3. `search_path` shadowing in a `SECURITY DEFINER` function — *medium*

`handle_new_user` pinned `search_path = public`. When `pg_temp` is not named
explicitly it is searched **first**, so a user able to create temporary objects
could shadow a name the function resolves and have their code run as the
definer — the CVE-2018-1058 shape.

**Fixed** by naming `pg_temp` last in `handle_new_user` and
`delete_my_account`, and by pinning a `search_path` on the eight remaining
functions that had a mutable one (Supabase's own linter flags these as
`function_search_path_mutable`). The tests now assert that *every* definer
function in `public` pins a `search_path` that names `pg_temp`, so a new one
cannot regress this.

#### 4. Daily cap and streak could be reset by changing timezone — *medium*

The coin cap and the streak are bucketed by `local_day(now(), profile.timezone)`
— correct, and the whole reason the timezone is stored. But the client can
update its own timezone freely, and doing so moves the boundary: flip it far
enough and a capped day becomes a fresh one, or a single stretch of study
credits two different days.

**Mitigated** by rate-limiting timezone changes to once per 24 hours, enforced
in the trigger, with the clock itself not clearable by the client (the tests
assert both). This bounds the abuse rather than eliminating it. Eliminating it
would mean pinning each day's accounting to the timezone in effect when that day
was first credited, which is a larger change than a single-player app where the
only person being cheated is the user warrants. Recorded here as accepted
residual risk.

#### 5. Unbounded writes to the one client-writable table — *medium*

`room_layout` had no uniqueness constraint and no row ceiling. A hostile client
could place the same owned sofa a thousand times, or insert rows until it filled
the free-tier database.

**Fixed** with a unique index on `(user_id, item_id)` — you own one sofa, you
place one sofa — plus a 200-row-per-user ceiling enforced by trigger. Related:
`pause_session` now refuses after 100 pauses in a session, since each
pause/resume pair appends to a `jsonb` array that a loop could otherwise grow
without bound.

#### 6. Trigger functions callable over the API — *low*

`handle_new_user`, `touch_updated_at`, `guard_profile_writes`, and
`generate_cat_seed` were reachable as RPCs. None is exploitable on its own —
trigger functions error out without trigger context — but none is part of the
client's API either. **Revoked.**

`compute_coins`, `paused_seconds`, `local_day`, `is_valid_timezone`, and
`streak_threshold_minutes` are deliberately **left callable**: they are pure
functions over no user data, and being able to ask the database what it thinks
your local day is, or to check its arithmetic against the client's mirror of the
coin rules, is worth more than the tidiness of hiding them.

### Reviewed, no change needed

- **No DOM injection sinks.** No `dangerouslySetInnerHTML`, `innerHTML`, `eval`,
  `new Function`, or `document.write` anywhere in `src/`. All user-supplied text
  (cat name, subject names, session labels) goes through JSX text nodes.
- **No secrets in the repository.** Only `.env.example` is tracked; `.env.local`
  is gitignored. The CI workflows read Supabase config from repository
  *variables*, not secrets, which is correct — both values are public, and they
  live in repo config only to keep them out of committed source.
- **`localStorage` holds nothing earned.** Its only use is the sound preference,
  wrapped in try/catch for private-browsing mode. Wallet, streak, and inventory
  are never cached there.
- **OAuth flow.** The client uses PKCE, so tokens arrive as `?code=` on the path
  rather than in the URL fragment, which both avoids leaking them in history and
  keeps them away from `HashRouter`. `authRedirectTo()` is derived from
  `window.location.origin`, never from user input, and Supabase validates it
  against the dashboard allow-list regardless.
- **Session forgery.** `end_session` measures duration from the database clock
  and ignores `p_client_seconds`, which is stored only for auditing. The
  180-minute clamp and the one-active-session-per-user unique index hold.
- **Account deletion** is scoped to `auth.uid()` and cascades. It cannot be
  pointed at another account.

### Accepted risks

- **The anon key is public.** By design; see the top of this file.
- **Timezone-boundary manipulation is bounded, not eliminated.** See finding 4.
- **`onboarded_at` is client-writable.** A user can mark themselves onboarded
  without going through `complete_onboarding`, which skips the free starter
  items. It costs them, not us. The trigger prevents *clearing* it, which is the
  direction that could be farmed.
- **GitHub Actions are pinned to major tags** (`actions/checkout@v4`) rather
  than commit SHAs. Pinning to SHAs would be stricter; for a personal project
  using only first-party Actions, the maintenance cost is not worth it.

---

## Dependencies

`npm audit` as of this pass reports eight advisories. None is exploitable in
this application, and all but two are development tooling that never reaches a
user:

| Package | Severity | Assessment |
|---|---|---|
| `vitest` (via UI server) | critical | **Not exploitable** — the Vitest UI server is never started. `npm test` runs `vitest run`. |
| `vite` (`server.fs.deny` bypass on Windows) | high | **Dev-only.** Affects the local dev server on the maintainer's machine, not the built static site. |
| `vite` / `esbuild` (dev-server request forgery, path traversal) | moderate | **Dev-only**, same reasoning. |
| `react-router` (open redirect via backslash) | moderate | **Not exploitable** — every `to` value in the app is a constant from `src/lib/paths.ts`; no route target is ever user-supplied. |
| `react-router` (constructor injection in `deserializeErrors`) | moderate | **Not applicable** — SSR hydration only, and this app has no SSR. |

Every available fix is a semver-major bump (`vite` 8, `vitest` 5,
`react-router-dom` 7). Those upgrades are worth doing on their own schedule, but
none is urgent, and doing them as part of a security pass would mean shipping a
large untested tooling change on a false premise.

CI gates on `npm audit --audit-level=high --omit=dev`, which fails the build on
a *high or critical advisory in a shipped dependency* while ignoring dev-tooling
noise.

---

## Reporting

This is a personal project with no production deployment and no other users. If
you find something, open an issue.
