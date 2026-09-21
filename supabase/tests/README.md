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

## Against your Supabase project (no extra tooling)

1. Open the project's **SQL Editor**.
2. Run the migrations in `../migrations/` once, in filename order.
3. Paste `00_shim.sql`… actually *skip* it — Supabase already provides the
   `auth` schema, the `anon`/`authenticated` roles, and the default grants it
   recreates. Run `01_helpers.sql`, then `rls_and_rpc.sql`.

The helpers in `01_helpers.sql` are `SECURITY DEFINER` fixtures for the test
suite. Drop them when you are done:

```sql
drop schema tst cascade;
```

## Against a throwaway Postgres (needs Docker)

```bash
./run.sh
```

This starts `postgres:16-alpine`, applies `00_shim.sql` (which fakes the parts
of Supabase the migrations touch), runs every migration, and then the
assertions. Nothing leaves the container, and it is removed on exit.
