# The Bakers' Home Hub

A shared home-improvement app for two people: projects ("quests") with photos, budgets, real quotes and contractor contacts, an inspiration pin board per project, live sync between phones, nudges between the two of you (in-app, with a WhatsApp hand-off), a bit of XP-and-badges gamification, and an Insights page for costs and timelines.

Built with Vite + React + TypeScript, Tailwind v4, Framer Motion, TanStack Query and Supabase (Postgres, Storage, Realtime, Auth). Installs to the phone home screen as a PWA.

## One-time setup

### 1. Supabase (database, photos, sync)
1. Create a project at supabase.com.
2. Open **SQL Editor → New query**, paste the whole of `supabase/schema.sql`, click **Run**. This creates every table, the row-level security that locks data to your household, the private `media` bucket, and the live-sync publication.
   Then run each file in `supabase/migrations/` in order the same way (they're additive — `002` adds nudges and WhatsApp numbers).
3. **Authentication → Users → Add user → Create new user** for each of you (tick *Auto Confirm User*). A profile is created automatically for every user.
4. Copy **Project URL** and the **anon public key** from *Project Settings → API*.

The app ships with the Bakers' project baked in as the default (`src/data/config.ts`). To point it somewhere else, create `.env.local`:

```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

### 2. Hosting (Vercel)
Import the GitHub repo into Vercel. The framework preset is Vite, build command `npm run build`, output `dist`. `vercel.json` already rewrites all routes to `index.html`. Every push to `main` deploys.

### 3. Phones
Open the Vercel URL in Safari (iPhone) → Share → **Add to Home Screen**. Android: Chrome menu → **Install app**.

## Developing

```
npm install
npm run dev          # http://localhost:5173
npm run build        # type-check + production build
npm run qa           # screenshots of every screen (phone + desktop, light + dark) into qa-shots/
npm run flows        # click-through smoke test of the main flows
```

Set `VITE_DEMO_ONLY=true` to force the built-in demo mode (sample data in localStorage, no backend). The login page also has an "Explore the demo" link.

## How it fits together

- `src/data/db.ts` – the single interface the UI talks to. `supabaseDb.ts` implements it for real; `demoDb.ts` is the in-memory version.
- `src/data/hooks.ts` – TanStack Query hooks plus `useActions()`, the one place every write goes through so XP, badges and optimistic cache updates happen consistently. `useRealtimeSync()` listens to Supabase Realtime and invalidates queries.
- `src/lib/xp.ts` – XP rules, levels, streaks, achievements and cost maths.
- `src/components/nudges/` – the Nudge sheet (`useNudge()` opens it from anywhere) and the Hub inbox. Assigning a task to the other person nudges them automatically.
- `src/lib/contacts.ts` – ways to get a contact in without typing: the phone's contact picker (Android Chrome; iPhone Safari behind *Settings → Safari → Advanced → Feature Flags → Contact Picker API*), `.vcf` contact cards, pasted text (WhatsApp messages, signatures, Maps listings) and a Google Maps search hand-off.
- `src/components/board/` – the pin board: `Board.tsx` (pan/zoom/drag/resize/rotate), `Pins.tsx` (how each pin type looks), `Eyedropper.tsx` (sample colours from a photo, auto-palette), `PinEditor.tsx` (add/edit sheets).
- `supabase/schema.sql` – the whole backend.

## Notes
- Photos are compressed on the phone before upload (max 1800px, ~0.9MB) and stored in a private bucket; the app fetches signed URLs and caches them.
- A Supabase free-tier project pauses after 7 idle days; unpause it from the dashboard if the app suddenly can't sign in.
