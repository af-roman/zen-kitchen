# Zen Kitchen

A calm, local-first PWA for batch cooking a Japanese diet — pantry, recipes, cooking sessions, ready food, week plan, shopping, and backup.

Optional **cloud snapshot sync** (Supabase) keeps the same kitchen on your laptop and phone. See [AGENTS.md](./AGENTS.md) and the steps below.

## Develop

```bash
npm install
cp .env.example .env.local   # optional — fill in Supabase keys for sync
npm run dev
```

Data lives in IndexedDB on your device. Use **More → Backup & sync** to sync, or export/import a full JSON snapshot.

## Build

```bash
npm run build
npm run preview
```

## Host + sync (solo, all your devices)

### 1. Create a Supabase project

1. Sign up at [supabase.com](https://supabase.com) and create a project.
2. Open **SQL → New query**, paste [`supabase/schema.sql`](./supabase/schema.sql), run it.
3. **Authentication → Providers**: enable Email (magic link). Then open **Authentication → Email Templates → Magic Link** and paste [`supabase/templates/magic_link.html`](./supabase/templates/magic_link.html). The `{{ .Token }}` line is the 6-digit code the home screen app asks for. The link still works in the browser.
4. **Authentication → URL configuration**:
   - **Site URL**: your production URL (e.g. `https://zen-kitchen.pages.dev`)
   - **Redirect URLs**: add the same origin, plus `http://localhost:5173/**` for local dev (and your Pages URL `https://….pages.dev/**`).
5. **Project Settings → API Keys**: copy **Project URL** and **publishable** key into `.env.local`:

```bash
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

6. **Authentication → URL configuration**:
   - **Site URL**: `https://af-roman.github.io/zen-kitchen/`
   - **Redirect URLs**: `https://af-roman.github.io/zen-kitchen/**` and `http://localhost:5173/**`
     The `**` matters. The sign-in link adds a `?handoff=` query, and an exact URL (no wildcard) will not match.
7. Re-run [`supabase/schema.sql`](./supabase/schema.sql) if this project was created before the auth handoff table. That lets the home screen app pick up a sign-in that opened in Safari.
8. Deploy the recipe fetch function once (the publishable key is not a user JWT):

```bash
supabase functions deploy recipe-fetch --no-verify-jwt
```

Until that function is deployed, URL import uses a public reader proxy.

### 2. Deploy (GitHub Pages)

This repo already deploys via `.github/workflows/deploy.yml` to  
`https://af-roman.github.io/zen-kitchen/`.

1. Set repository secrets (Settings → Secrets and variables → Actions):
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
2. Push to `main` (or run the **Deploy to GitHub Pages** workflow).
3. Wait for the Actions run to finish, then open the Pages URL.

### 3. First sync

1. On the laptop: open `https://af-roman.github.io/zen-kitchen/` → **More → Backup & sync** → enter your email → open the magic link.
2. Tap **Sync now** (or wait a couple of seconds after edits).
3. On the phone: open the **home screen app** → More → Backup & sync → same email → send the sign-in email **from that app**, then open the link. Safari and the home screen app do not share a sign-in. The app picks the session up after the link opens. If the email shows a 6-digit code, enter it in the app instead. If the phone still has the starter catalog and the laptop has real data, choose **Use cloud** when asked.

### 4. Day-to-day

- Prefer finishing on one device, then opening the other (sync runs on focus / online / a few seconds after edits).
- Offline cook or shop still works on the last local copy; changes upload when you’re back online.
- JSON download backup remains available as a safety net.

## Agent / contributor notes

See [AGENTS.md](./AGENTS.md).
