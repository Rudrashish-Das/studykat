# SQL tests

`rls_and_rpc.sql` asserts the things that must not break:

- the client cannot write to `wallet`, `transactions`, `streaks`,
  `study_sessions`, or `inventory` — the explicit negative test §12 asks for
- a user cannot see another user's rows
- the cat seed cannot be rerolled, and a bogus timezone is rejected
- the coin formula, case for case, matching `src/lib/economy/coins.test.ts`
- `end_session` measures its own duration and ignores what the client claims
- streak advancement, freeze tokens, the daily cap, and the once-a-day goal bonus
- purchases: price, unlock rule, duplicates
- `room_layout` can only reference items the user owns

Everything runs in one transaction and rolls back, so it is safe to run more
than once — including against a real project.

## Do not run these against your real project

`01_helpers.sql` installs `SECURITY DEFINER` fixtures that the `authenticated`
role must be able to call, because the tests run as that role in order to prove
what row-level security blocks. While those fixtures exist, **any signed-in user
can call `tst.set_coins()` and mint themselves unlimited currency.**

The file now refuses to install unless the session opts in *and* the database
has almost no accounts, so pasting it into a live project's SQL editor fails
closed. Use a throwaway database instead.

If you ever do install them somewhere, tear them down afterwards:

```sql
drop schema tst cascade;
```

## Against a scratch Supabase project

Create a second, empty Supabase project, run the migrations there, then run
`01_helpers.sql` and `rls_and_rpc.sql`. You do not need `00_shim.sql` —
Supabase already provides the `auth` schema, the `anon`/`authenticated` roles,
and the default grants it recreates.

## Against a throwaway Postgres (needs Docker)

```bash
./run.sh
```

This starts `postgres:16-alpine`, applies `00_shim.sql` (which fakes the parts
of Supabase the migrations touch), runs every migration, and then the
assertions. Nothing leaves the container, and it is removed on exit.
