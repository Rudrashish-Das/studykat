# StudyCat — Build Prompt

> Paste this whole file as the opening message to an AI coding agent (Claude Code, Cursor, etc.)
> in an empty repo. It is written to be built in phases — do not let the agent attempt all of it
> in one shot.

---

## 1. Role and goal

You are building **StudyCat**, a cozy web app that motivates people to study. Users run a study
timer, earn in-game currency for focused time, keep a daily streak, and spend the currency
decorating an isometric room for a pet cat that is visually unique to their account.

Build it as a **production-quality small app**, not a prototype: real auth, real persistence,
real deployment. Prefer boring, well-supported libraries over clever ones. Write TypeScript with
strict mode on.

---

## 2. Hard constraints (do not violate these)

1. **Hosting:** GitHub Pages (static files only). No custom server, no serverless functions I own.
2. **Cost:** everything must stay within permanent free tiers. No credit card required.
3. **Auth:** email/password registration *and* "Continue with Google" OAuth.
4. **Database:** free hosted Postgres with row-level security.
5. The app must work when deployed under a subpath like `https://<user>.github.io/studycat/`.

---

## 3. Stack (use this unless you hit a blocker — then stop and tell me)

| Layer | Choice | Why |
|---|---|---|
| Build | Vite + React 18 + TypeScript | Static output, trivial GH Pages deploy |
| Styling | Tailwind CSS | Fast iteration on a custom cozy palette |
| Routing | `react-router-dom` with **HashRouter** | Avoids GH Pages 404 rewrites entirely |
| State | TanStack Query for server state, small Zustand store for the live timer | |
| Backend | **Supabase** free tier | Postgres + Auth (email + Google) + RLS + RPC, no server needed |
| Animation | CSS transitions, plus `framer-motion` for a few accents | Keep it light |
| Deploy | GitHub Actions → GitHub Pages | |

**Important architectural consequence:** the Supabase anon key ships in the client bundle. That is
expected and safe *only if* row-level security is enabled on every table and all economy logic
(awarding coins, validating session length, advancing streaks, purchases) lives in
`SECURITY DEFINER` Postgres functions. The client may never write to wallet, streak, or inventory
tables directly. See §6.

Do not use `localStorage` as the source of truth for anything the user earns. It may cache UI
preferences only.

---

## 4. Screens

1. **Landing** — one-screen pitch, art of a cat in a room, `Sign up` / `Log in`.
2. **Auth** — email+password register, login, Google OAuth button, password reset, verify-email
   handling. Friendly error states.
3. **Onboarding (first login only)** — name your cat, pick a starting coat from 3 procedurally
   generated options (all derived from the user's seed, see §7), pick a daily study goal in minutes.
4. **Home / Room** — the main screen. The isometric room fills most of the viewport with the cat
   in it. A compact HUD shows coins, streak flame, today's minutes vs goal. A prominent
   **Start studying** button.
5. **Focus mode** — takes over the screen while a session runs. Big timer, optional subject label,
   the cat visible and animated as "studying alongside you". Minimal chrome, dimmed palette, no
   notifications. Pause and Stop controls.
6. **Session complete** — coins earned, streak status, a one-line reaction from the cat.
7. **Shop** — grid of furniture/decor/toys/wallpaper/flooring, categorized, with prices and lock
   conditions (some items unlock at streak or total-hours milestones).
8. **Room editor** — place, move, rotate, and store owned items on the isometric grid.
9. **Stats** — calendar heatmap of study days, weekly bar chart, per-subject totals, streak
   history, lifetime hours.
10. **Settings** — cat name, daily goal, timezone, sound on/off, delete account, log out.

---

## 5. Data model

Postgres, all tables in `public`, all with RLS enabled and `user_id uuid references auth.users`.

```
profiles            id(uuid, pk = auth.uid), display_name, cat_name, cat_seed text,
                    daily_goal_minutes int default 60, timezone text, created_at

subjects            id, user_id, name, color, archived bool

study_sessions      id, user_id, subject_id nullable, started_at timestamptz,
                    ended_at timestamptz nullable, awarded_seconds int default 0,
                    coins_awarded int default 0, status enum('active','completed','abandoned'),
                    client_reported_seconds int   -- stored for auditing only, never trusted

wallet              user_id pk, coins bigint default 0, lifetime_coins bigint default 0

transactions        id, user_id, delta int, reason enum('session','streak_bonus','purchase',
                    'milestone','refund'), ref_id uuid, created_at

streaks             user_id pk, current_streak int, longest_streak int,
                    last_credited_day date, freeze_tokens int default 0

catalog_items       id, slug, name, category enum('floor','wall','rug','furniture','plant',
                    'toy','light','wallcolor','decor'), price int, unlock_rule jsonb,
                    footprint_w int, footprint_h int, layer int, art_key text
                    -- public read, no user_id

inventory           id, user_id, item_id, acquired_at, unique(user_id, item_id)

room_layout         id, user_id, item_id, grid_x int, grid_y int, rotation smallint, z_index int
```

Seed `catalog_items` with **at least 40 items** across categories, priced on a curve so the first
purchase is reachable after roughly two sessions and the most expensive item takes weeks.

Write the entire schema as versioned SQL migration files in `/supabase/migrations/` so I can
re-run it on a fresh project. Include the RLS policies in the same files.

---

## 6. Core mechanics (the part that must be correct)

### 6.1 The timer must be server-anchored

- Starting a session calls RPC `start_session(subject_id)`, which inserts a row with
  `started_at = now()` (database clock) and returns it. Only one `active` session per user;
  starting a new one abandons any stale active session older than 8 hours.
- The client renders the elapsed time from `started_at`, recomputed from wall-clock on every tick —
  never by incrementing a counter. This keeps it correct across tab sleep, refresh, and device
  lock. Closing the tab and reopening resumes the live session.
- Ending calls RPC `end_session(session_id)`. The function computes `duration = now() - started_at`
  **itself**, ignores anything the client claims, clamps to a sane max (e.g. 180 min per session),
  awards coins, and writes the transaction — all in one database transaction.
- Pause: record pause intervals in a `jsonb` column and subtract them server-side.

### 6.2 Coin formula

Implement exactly this, in SQL, as a single function so it can be tuned in one place:

```
base        = floor(focused_minutes)                    -- 1 coin per minute
tier_bonus  = +25% of base for the portion of a session beyond 25 min
              (rewards sustained focus; cap bonus-eligible time at 90 min)
streak_mult = 1 + min(current_streak, 30) * 0.02        -- up to 1.6x at 30 days
goal_bonus  = +30 coins, once per day, when the daily goal is first met
daily_cap   = 400 coins/day from sessions

coins = min(round((base + tier_bonus) * streak_mult), remaining_daily_cap) + goal_bonus?
```

Sessions under 5 minutes award 0 coins and do not count toward the streak. State this in the UI
*before* the user starts, so it never reads as a bug.

### 6.3 Streaks

- A day counts when total credited focused time that day ≥ **max(15 min, 50% of daily goal)**.
- "Day" is computed in the user's stored IANA timezone — not UTC, and not the browser's guess at
  read time. Store the timezone at onboarding; let them change it in settings.
- The streak advances inside `end_session`, comparing against `last_credited_day`. Missing a day
  resets to 0 unless a **freeze token** is spent; users earn 1 freeze token per 7-day streak, max
  2 held.
- Show the streak as a flame in the HUD, and show "X minutes left to keep your streak" when the
  day is incomplete and it is after 6pm local.

### 6.4 Purchases

RPC `purchase_item(item_id)` checks price against wallet, checks `unlock_rule`, then debits and
inserts inventory + transaction atomically. Reject duplicates. The client never computes a new
balance — it refetches.

---

## 7. The unique cat

Each account gets a cat that is deterministically generated and stable forever.

- On first login, generate `cat_seed` (a random 16-char string) and store it on `profiles`.
- Feed the seed into a small seeded PRNG (mulberry32) to pick: **base coat color** (from a curated
  cozy palette of ~14 swatches — no neon, no pure black or white), **pattern** (solid, tabby,
  tuxedo, calico, colorpoint, bicolor, van), **pattern accent color**, **eye color** (8 options,
  with heterochromia at ~3%), **ear shape** (3), **tail length/curl** (3), **face marking** (5),
  **sock count** (0–4), **nose color**, plus a rare `sparkle` variant at ~1%.
- **Render the cat as a composed inline SVG React component**, not as image assets: a
  `<Cat appearance={...} pose="idle|studying|sleeping|happy" />` that layers body, head, markings,
  eyes, and tail paths and fills them from the palette. This is what makes every cat unique
  without commissioning hundreds of sprites.
- Give it four idle animations driven by CSS: tail flick, blink, ear twitch, slow breathing.
  During a focus session the cat sits at the desk; between sessions it wanders slowly around the
  room; after 10pm local it curls up and sleeps.
- At onboarding, offer 3 candidate appearances derived from the seed with different offsets and let
  the user pick one — it feels chosen, but stays deterministic and unique.

---

## 8. Isometric room — rendering spec

This is the visual centerpiece. Be precise:

- **Projection:** 2:1 isometric. Tile size 64×32 px at 1× (support 2× for retina). Grid is
  **10×10 tiles**, expandable later.
- Screen position: `sx = (gx - gy) * (TILE_W / 2)`, `sy = (gx + gy) * (TILE_H / 2)`.
- **Depth sorting:** sort all drawables by `(gx + gy)`, then `layer`, then `z_index`. The cat is a
  drawable sorted by its own tile, so it walks behind and in front of furniture correctly.
- **Rendering approach:** absolutely-positioned DOM nodes inside a transformed container, each
  holding an inline SVG. Do *not* reach for a canvas/WebGL engine — at this scale, DOM + SVG stays
  debuggable, accessible, crisp at any zoom, and recolorable per user. If frame rate suffers with
  many items, memoize aggressively before changing approach.
- **Art, since we have no artist:** draw each furniture piece as hand-authored SVG following a
  strict shared recipe so everything looks like one set — top face lightest, left face mid, right
  face darkest (fixed light from upper-left), 2px soft outline in warm dark brown (`#4a3b34`), no
  pure black, rounded corners, one soft contact-shadow ellipse under each object. Define these as
  CSS custom properties per material so a whole item recolors from one variable.
- **Interaction:** hover highlights the tile under the cursor (draw the diamond outline), click
  selects, drag moves with a ghost preview and a red tint on invalid placement. Collision =
  footprint overlap on the grid. Rotation cycles the footprint.
- Include a subtle parallax (the room tilts ~2° toward the cursor) and a day/night tint overlay
  driven by the user's local time.

### Art direction

Cozy, warm, low-contrast — "Animal Crossing meets a Stardew Valley interior". Palette anchors:
cream `#f6ead8`, warm wood `#c99a6b`, sage `#a7b89b`, dusty rose `#d9a5a0`, muted teal `#7fa8a4`,
ink `#4a3b34`. Rounded shapes, no hard geometry, generous whitespace in the UI chrome.
Typography: one rounded sans (Nunito or Quicksand) throughout, with weight contrast instead of
font contrast. Animations slow and soft — 250–400ms, `ease-out`. **No loud red badges, no confetti
explosions, no aggressive sounds.** The reward for studying should feel like coming home, not like
winning a slot machine.

### Sense of progress

Progress must be legible *without reading numbers*:

- the room visibly fills up over weeks,
- the streak flame grows in size and detail at 3 / 7 / 14 / 30 / 100 days,
- a shelf in the room displays milestone trophies automatically,
- the calendar heatmap on Stats is the "receipts" view.

---

## 9. Accessibility and quality bar

- Keyboard-operable: starting/stopping a session, navigating the shop, placing items via arrow keys.
- Respect `prefers-reduced-motion` — disable wander, parallax, and idle loops.
- All interactive SVG elements get `role` and `aria-label`.
- Text contrast ≥ 4.5:1 against the cozy backgrounds — test this, the palette is light.
- Responsive: the isometric room scales down and becomes pannable/pinchable on mobile; the HUD
  moves to the bottom. Test at 375px wide.
- Loading and empty states for every async view. Optimistic UI only for room-layout edits.

---

## 10. Deployment

1. `vite.config.ts` with `base: '/<repo-name>/'`.
2. `.github/workflows/deploy.yml`: on push to `main` — install, typecheck, build, upload `dist/`
   via `actions/upload-pages-artifact`, deploy with `actions/deploy-pages`. Use the `pages`
   environment and the correct `permissions:` block.
3. Supabase config comes from `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`, injected in the
   workflow from **repository variables** (not secrets — they are public anyway, but keep them out
   of committed source).
4. Commit `.env.example`; gitignore `.env.local`.
5. In Supabase Auth settings, Site URL and Redirect URLs must include both
   `http://localhost:5173` and `https://<user>.github.io/<repo>/`. **Write these exact steps into
   `SETUP.md`**, along with how to create the Google OAuth client in Google Cloud Console (the
   authorized redirect URI is Supabase's `/auth/v1/callback`, not my site).
6. Handle the OAuth return correctly under HashRouter — verify the session is picked up and the
   user lands on `/#/home`, not a blank page.

---

## 11. Build order — work in these phases, and stop after each one

**Phase 1 — skeleton.** Vite + TS + Tailwind + router, palette and typography tokens, static
placeholder screens, GH Actions deploy working end to end. I should see a deployed URL before any
features exist.

**Phase 2 — auth.** Supabase wiring, email+password, Google OAuth, protected routes, `profiles`
row creation on signup via trigger, `SETUP.md`.

**Phase 3 — timer and economy.** Schema + RLS + the three RPCs, server-anchored timer, focus mode,
coins, streaks, session history. Verify by manipulating the clock that streak rollover is correct
across a timezone boundary.

**Phase 4 — the cat.** Seeded generator, SVG cat component, poses, idle animations, onboarding
picker.

**Phase 5 — the room.** Isometric renderer, depth sorting, catalog, shop, purchases, room editor,
cat pathing around furniture.

**Phase 6 — stats, polish, accessibility pass, mobile pass.**

After each phase: run typecheck, run the build, and give me a short list of what to click to
verify it, plus anything you had to assume.

---

## 12. Testing

- Vitest unit tests for: the coin formula (table-driven, including the daily cap and sub-5-minute
  cases), streak advancement across timezones and DST, the seeded cat generator's determinism, and
  the isometric projection + depth sort.
- pgTAP or plain SQL assertions for the RPCs, including "client cannot write to wallet directly"
  as an explicit negative test against RLS.
- No E2E framework unless it stays free in CI.

---

## 13. Ask me before assuming

Stop and ask if you need a decision on: monetization or ads (there are none — this is personal),
social or leaderboard features (out of scope for v1), multiple cats per account (no, one), or
anything that would require a paid service or a server I have to run.

Do not add features I did not ask for. If you think something is missing, list it at the end of a
phase instead of building it.
