# Setup

One-time configuration. Phase 1 only needs part 1 (GitHub Pages); parts 2 and 3
(Supabase and Google OAuth) are needed from Phase 2 onward, and are written out
here now so the deploy and the auth redirect URLs stay consistent.

Throughout, replace:

- `<user>` — your GitHub username
- `<repo>` — the repository name (e.g. `studycat`)
- `<project-ref>` — your Supabase project ref, the subdomain in its API URL

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

### 2.3 Auth URLs

**Authentication → URL Configuration**:

- **Site URL**: `https://<user>.github.io/<repo>/`
- **Redirect URLs** — add both, exactly:
  - `http://localhost:5173`
  - `http://localhost:5173/**`
  - `https://<user>.github.io/<repo>/`
  - `https://<user>.github.io/<repo>/**`

The `/**` entries matter: the app uses `HashRouter`, and Supabase returns the
session in the URL fragment, so the browser lands on a URL like
`https://<user>.github.io/<repo>/#access_token=...`. The redirect allow-list has
to tolerate anything after the base path.

### 2.4 Email

**Authentication → Providers → Email**: enable it, and leave **Confirm email**
on. The built-in mailer is rate-limited on the free plan — that is fine for
personal use; the app surfaces a "check your inbox" state rather than assuming
instant delivery.

---

## 3. Google OAuth (needed from Phase 2)

The authorized redirect URI goes to **Supabase**, not to this site. This is the
step people most often get wrong.

### 3.1 Google Cloud Console

1. Open <https://console.cloud.google.com> and create a project (e.g.
   `studycat`).
2. **APIs & Services → OAuth consent screen**:
   - User type: **External**
   - App name: `StudyCat`, plus your support and developer email
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
     https://<project-ref>.supabase.co/auth/v1/callback
     ```

     Google redirects to Supabase; Supabase then redirects to this site. Putting
     the GitHub Pages URL here instead is the classic `redirect_uri_mismatch`.
4. Copy the **Client ID** and **Client secret**.

### 3.2 Supabase

**Authentication → Providers → Google**: enable, paste the Client ID and Client
secret, save. The callback URL shown on that page must match what you entered in
step 3.1 above.

---

## 4. Verifying

- Local: `npm run dev`, open <http://localhost:5173>, click through the screens.
- Deployed: open `https://<user>.github.io/<repo>/`. It should land on the
  landing screen with the URL becoming `.../#/`. Navigating to
  `https://<user>.github.io/<repo>/#/stats` directly must load Stats, not a 404.
- From Phase 2: sign in with Google and confirm you land on `#/home` rather than
  a blank page.
