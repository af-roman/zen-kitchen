# Zen Kitchen — agent notes

Personal, local-first PWA for batch-cooking a Japanese-style diet. **Only the owner uses it** (laptop plan → phone cook/shop). Prefer small, focused changes; do not turn this into a multi-tenant product.

## Product loop

Ingredients → recipes → pantry → cook sessions → ready batches → serve into meal slots → macros vs goals. Shopping/restock is a side loop. Data lives in IndexedDB (Dexie) on each device.

## Cloud sync (solo snapshot)

Cross-device sync is **full-kitchen JSON snapshots** (same shape as Backup export), not per-row CRDT sync.

| Piece | Location |
|---|---|
| Export / import | `src/db/backup.ts` |
| Dirty tracking (Dexie hooks) | `src/sync/dirtyTracking.ts` |
| Local revision meta | `src/sync/syncMeta.ts` (`localStorage`) |
| Push / pull / LWW conflict | `src/sync/cloudSync.ts` |
| Auth + auto sync | `src/sync/SyncProvider.tsx` |
| UI | More → Backup & sync (`CloudSyncPanel`) |
| SQL | `supabase/schema.sql` |

**Behavior:** after local writes (debounced), on tab focus, and when coming online — push if dirty, pull if cloud revision is ahead. If both changed since last sync → confirm dialog (keep device or use cloud). Requires `VITE_SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_KEY` (or legacy `VITE_SUPABASE_ANON_KEY`). Hosted at GitHub Pages `/zen-kitchen/`; CI injects those via repo secrets.

**Do not** add multi-user sharing, realtime collaborative editing, or a second sync protocol without an explicit ask. Manual JSON backup must keep working offline.

## Stack

- Vite + React 19 + React Router + Tailwind 4 + Dexie
- PWA via `vite-plugin-pwa`
- Optional Supabase Auth (magic link) + `kitchen_snapshots` table

## Conventions

- Path alias `@/` → `src/`
- Domain types in `src/domain/types.ts`; keep stock/nutrition math in `src/domain/`
- UI primitives in `src/shared/ui.tsx` and `dialog.tsx` — match existing patterns
- Avoid drive-by refactors and new markdown files unless requested

## UX priorities (when improving the app)

Primary nav: **Plan · Ready · Shop · Recipes · More** (Pantry lives under More). Plan is the autopilot hub (**Plan my week** → composed meals / shop / cook). Surface Serve from Plan/Ready/day. Prefer week-fill after sessions and shopping from shortfalls before AI features. Meal patterns (一汁三菜 / bento) use recipe `mealRoles` (inferred from category when unset).

## Commands

```bash
npm install
npm run dev
npm run build
npm run lint
```

Subpath deploy: `npm run build:pages` (sets `VITE_BASE_PATH=/zen-kitchen/`).
