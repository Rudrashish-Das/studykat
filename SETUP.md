# Setup

One-time configuration. Phase 1 only needs part 1 (GitHub Pages); parts 2 and 3
(Supabase and Google OAuth) are needed from Phase 2 onward, and are written out
here now so the deploy and the auth redirect URLs stay consistent.

Throughout, replace:

- `<user>` — your GitHub username
- `<repo>` — the repository name (e.g. `studykat`)
- `<project-ref>` — your Supabase project ref, the subdomain in its API URL
  (this project's is `hkvshuugunmqlezbrrpc`)

---

## 1. GitHub Pages

1. Create the repository on GitHub and push this project to `main`:

   ```bash
   git remote add origin https://github.com/<user>/<repo>.git
   git push -u origin main
   ```

2. In the repository: **Settings → Pages → Build and deployment → Source**, pick
   **GitHub Actions**. Do *not* pick "Deploy from a branch".

3. Push to `main` (or run the workflow manually from the **Actions** tab). The
   `Deploy to GitHub Pages` workflow typechecks, tests, builds, and publishes.
   The deployed URL appears on the `deploy` job and in **Settings → Pages**:

   ```
   https://<user>.github.io/<repo>/
   ```

   `vite.config.ts` reads `GITHUB_REPOSITORY` in CI to set the asset base path,
   so the site works under that subpath without any further configuration. If
   you later attach a custom domain, set a repository variable
   `VITE_BASE_PATH` to `/`.

---

## 2. Supabase (needed from Phase 2)

> **This project already has one.** The Supabase project is
> `hkvshuugunmqlezbrrpc`, so its API URL is
> `https://hkvshuugunmqlezbrrpc.supabase.co`. Sections 2.1 and 2.2 below are
> written for creating a fresh project; if you are using the existing one, skip
> to **2.3 Run the migrations**.

### 2.1 Create the project

1. Sign in at <https://supabase.com> and create a new project on the **Free**
   plan. Pick a region near you. No card is required.
2. Save the database password somewhere — you need it to run migrations.

### 2.2 Copy the API credentials

**Project Settings → API**:

- **Project URL** → `VITE_SUPABASE_URL`
- **anon / public** key → `VITE_SUPABASE_ANON_KEY`

Do **not** copy the `service_role` key. It must never reach the client.

Locally:

```bash
cp .env.example .env.local
# then fill in the two values
```

In CI, set them as repository **variables** (not secrets):
**Settings → Secrets and variables → Actions → Variables → New repository
variable**, once for `VITE_SUPABASE_URL` and once for `VITE_SUPABASE_ANON_KEY`.

> They are variables rather than secrets on purpose: both values are public —
> they ship inside the JavaScript bundle regardless. They live in repository
> config only to keep them out of committed source. What actually protects the
> data is row-level security plus `SECURITY DEFINER` functions, not secrecy of
> this key.

### 2.3 Run the migrations

The schema, the row-level security policies, the economy functions, and the
53-item catalog all live in `supabase/migrations/`. Apply them **in filename
order**. Any of these works:

**A. SQL Editor (no tooling).** Open the project's **SQL Editor**, then for each
file in `supabase/migrations/`, in order, paste the contents and run it. Each
file is written to be safely re-runnable, so a repeat does no harm.

**B. Supabase MCP server.** `.mcp.json` in this repo already points at the
project. Authenticate it once:

```bash
claude /mcp
```

Pick `supabase`, choose **Authenticate**, and complete the browser flow. Run
that in a real terminal — the desktop app cannot show the `/mcp` dialog. Once
it connects, the migrations can be applied for you.

**C. Supabase CLI.**

```bash
npx supabase link --project-ref hkvshuugunmqlezbrrpc
npx supabase db push
```

Afterwards, confirm it took:

```sql
select count(*) from public.catalog_items;  -- expect 53
```

### 2.4 When new migrations land

`art_key` says which shape the renderer draws, so a migration that changes one
only takes effect once it has run against the database — the site can deploy
first and keep showing the old art. To check what the database currently
believes:

```sql
select slug, art_key from public.catalog_items order by slug;
```

Anything still reading `plant-small/*`, `plant-tall/*`, or `tallbox/walnut` for
the grandfather clock means `0008` and `0009` have not been applied yet.

Then optionally run the assertions in `supabase/tests/` — see the README there.

### 2.5 Auth URLs

**Authentication → URL Configuration**:

- **Site URL**: wherever the site is actually served — `https://<user>.github.io/<repo>/`,
  or your custom domain if you have one (see §5).
- **Redirect URLs** — add every origin the app runs on, exactly:
  - `http://localhost:5173`
  - `http://localhost:5173/**`
  - `https://<user>.github.io/<repo>/`
  - `https://<user>.github.io/<repo>/**`
  - and, with a custom domain, `https://<domain>/` and `https://<domain>/**`

A missing entry here is the usual cause of "login worked yesterday": the app
asks Supabase to return the user to `window.location.origin`, and Supabase
silently falls back to the Site URL for any origin not on this list.

The `/**` entries matter: the app uses `HashRouter`, and Supabase returns the
session in the URL fragment, so the browser lands on a URL like
`https://<user>.github.io/<repo>/#access_token=...`. The redirect allow-list has
to tolerate anything after the base path.

### 2.6 Email

**Authentication → Sign In / Providers → Email**: enable it, and leave **Confirm email**
on. The built-in mailer is rate-limited on the free plan — that is fine for
personal use; the app surfaces a "check your inbox" state rather than assuming
instant delivery.

---

## 3. Google OAuth (needed from Phase 2)

The authorized redirect URI goes to **Supabase**, not to this site. This is the
step people most often get wrong.

### 3.1 Google Cloud Console

1. Open <https://console.cloud.google.com> and create a project (e.g.
   `studykat`).
2. **APIs & Services → OAuth consent screen**:
   - User type: **External**
   - App name: `StudyKat`, plus your support and developer email
   - Scopes: the defaults (`email`, `profile`, `openid`) are enough
   - Leave it in **Testing** and add your own Google account under **Test
     users**, unless you intend to publish it
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type: **Web application**
   - **Authorized JavaScript origins**:
     - `http://localhost:5173`
     - `https://<user>.github.io`
   - **Authorized redirect URIs** — this one value, and nothing else:

     ```
     https://hkvshuugunmqlezbrrpc.supabase.co/auth/v1/callback
     ```

     Google redirects to Supabase; Supabase then redirects to this site. Putting
     the GitHub Pages URL here instead is the classic `redirect_uri_mismatch`.
4. Copy the **Client ID** and **Client secret**.

### 3.2 Supabase

> Not to be confused with **Authentication → OAuth Server**, which is the
> opposite feature: it makes *your* project an identity provider so other apps
> can offer "Sign in with StudyKat". Leave that one off.

**Authentication → Sign In / Providers → Google**: enable, paste the Client ID and Client
secret, save. The callback URL shown on that page must match what you entered in
step 3.1 above.

---

## 4. Verifying

- Local: `npm run dev`, open <http://localhost:5173>, click through the screens.
- Deployed: open the site at whichever URL serves it — the Pages URL, or your
  custom domain (§5). It should land on the landing screen with the URL becoming
  `.../#/`, and going straight to `.../#/stats` must load Stats, not a 404.
- Deployed, if the page is blank: open the console. Asset 404s mean the build's
  `base` does not match the path the site is served from — see §5.3.
- From Phase 2: sign in with Google and confirm you land on `#/home` rather than
  a blank page.

---

## 5. A custom domain (optional)

Currently configured: **studykat.rudrashishdas.com** (`public/CNAME`).

### 5.1 DNS

At the registrar for the parent domain, add one record:

| Type | Host | Value |
| --- | --- | --- |
| `CNAME` | `studykat` | `<user>.github.io` |

The value is the **user** site, with no repo path on the end. Verify it before
touching anything in GitHub:

```bash
nslookup studykat.rudrashishdas.com
```

It should end at four addresses in `185.199.108-111.153`.

### 5.2 GitHub

**Settings → Pages → Custom domain**: enter the domain and save.

Tick **Enforce HTTPS** once it stops being greyed out. GitHub issues a Let's
Encrypt certificate only after DNS validates, so for the first few minutes the
domain answers on `http` and fails TLS with a name-mismatch error. That is the
expected sequence, not a misconfiguration.

### 5.3 The part that is easy to miss

A custom domain serves the site from `/`, not from `/<repo>/`. Two consequences:

- **`public/CNAME` must exist**, and must contain the domain and nothing else.
  A Pages deploy replaces the whole site, so the file has to ship in the build
  output or the domain setting can be dropped on the next deploy.
- **The build's `base` must be `/`.** `vite.config.ts` derives it from that same
  CNAME file, so the two cannot disagree. Get this wrong and the symptom is a
  blank page: the HTML loads fine and every asset URL 404s.

`npm run build` asserts both (`scripts/check-dist-base.mjs`).

To change the domain, edit `public/CNAME`, update the Pages setting, and add the
new origin to Supabase's redirect list (§2.5). To drop it, delete the file — the
build falls back to `/<repo>/` on its own.
