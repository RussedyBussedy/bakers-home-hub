# The Home Hub

A shared home-improvement app for a household: projects ("quests") with photos, budgets, real quotes and contractor contacts, an inspiration pin board per project, live sync between phones, nudges between the two of you (in-app, with a WhatsApp hand-off), a bit of XP-and-badges gamification, and an Insights page for costs and timelines.

Built with Vite + React + TypeScript, Tailwind v4, Framer Motion, TanStack Query and Supabase (Postgres, Storage, Realtime, Auth). Installs to the phone home screen as a PWA.

## One-time setup

### 1. Supabase (database, photos, sync)
1. Create a project at supabase.com.
2. Open **SQL Editor → New query**, paste the whole of `supabase/schema.sql`, click **Run**. This creates every table, the row-level security that locks data to your household, the private `media` bucket, and the live-sync publication.
   Then run each file in `supabase/migrations/` in order the same way (they're additive — `002` nudges and WhatsApp numbers, `003` deposits on quotes, `004` site days and blockers, `005` a new account gets its own household, `006` invites).
3. **Authentication → Users → Add user → Create new user** for each of you (tick *Auto Confirm User*). A profile is created automatically for every user, in a household of its own.

   Sign-ups are open by default on a Supabase project and the anon key ships in the browser bundle, so **anyone can create an account**. Before `005` that put them straight into the one hard-coded household with full access; now a new account only ever gets an empty home of its own, and a profile can't be moved between households (`profiles_no_household_hop`). Until there's an invite flow there is no way for a second person to join an existing home except by an admin editing `profiles.household_id` in the dashboard. If you don't want strangers creating accounts at all, turn off *Authentication → Sign In / Providers → Allow new users to sign up*.
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
npm run overflow     # layout check at phone, landscape, tablet and desktop sizes: anything wider than the screen, clipped text, sideways scroll, buttons covered by other elements
npm run scrollcheck  # desktop + landscape: pages open at the top, back restores scroll, no blank frames or splash between sections
npm test             # build + flows in one go
```

Set `VITE_DEMO_ONLY=true` to force the built-in demo mode (sample data in localStorage, no backend). The login page also has an "Explore the demo" link.

## How it fits together

- `src/data/db.ts` – the single interface the UI talks to. `supabaseDb.ts` implements it for real; `demoDb.ts` is the in-memory version.
- `src/data/hooks.ts` – TanStack Query hooks plus `useActions()`, the one place every write goes through so XP, badges and optimistic cache updates happen consistently. `useRealtimeSync()` listens to Supabase Realtime and invalidates queries.
- `src/lib/xp.ts` – XP rules, levels, streaks, achievements and cost maths.
- `src/components/nudges/` – the Nudge sheet (`useNudge()` opens it from anywhere) and the Hub inbox. Assigning a task to the other person nudges them automatically.
- `src/components/project/SiteVisits.tsx` / `Blocker.tsx` – the site-day log (who was due, who came; a no-show nudges the other person) and the “blocked on” flag that sits on top of a project's status. Quote expiry is computed from `valid_until` (`quoteExpiry` in `src/lib/xp.ts`), never stored.
- `src/lib/contacts.ts` – ways to get a contact in without typing: the phone's contact picker (Android Chrome; iPhone Safari behind *Settings → Safari → Advanced → Feature Flags → Contact Picker API*), `.vcf` contact cards, pasted text (WhatsApp messages, signatures, Maps listings) and a Google Maps search hand-off.
- `src/lib/colorNames.ts` – real names for sampled colours: the nearest of ~5 000 hand-picked names (from [meodai/color-names](https://github.com/meodai/color-names), MIT, bundled as `src/data/colornames.txt` and lazy-loaded) and the nearest RAL Classic paint code (`src/data/ral.ts`, from the MIT `ral-colors` package), both matched with CIEDE2000 in Lab space.
- `src/components/board/` – the pin board: `Board.tsx` (pan/zoom/drag/resize/rotate), `Pins.tsx` (how each pin type looks), `Eyedropper.tsx` (sample colours from a photo, auto-palette), `PinEditor.tsx` (add/edit sheets). Link and product pins open their web page from the ↗ on the pin, an **Open link** button under the pin when it's selected, or the selected-pin toolbar (`pinUrl()` in `Pins.tsx` says which pins have somewhere to go) — they're deliberately not `<a>` tags, so a tap still selects and drags them.
- `src/components/project/PricesPanel.tsx` – the Prices tab: what things cost, gathered from links, deliberately outside every budget figure. Priced items and the board's product pins are one list (`src/lib/board.ts`); `off_board` keeps a shopping-list item from cluttering the board.
- `supabase/functions/unfurl/` – reads a pasted product page and returns its title, price and picture (a browser can't fetch another site itself). Deploy it from the Supabase dashboard: **Edge Functions → Deploy a new function**, name it `unfurl`, paste `index.ts`, Deploy. Without it the Prices tab still works, you just type the details in. `npm run unfurl-test` checks its parsing.
- `src/pages/Join.tsx` / `src/components/auth/RegisterForm.tsx` / `src/components/settings/People.tsx` – registering, and the invite flow. A member makes an invite in Settings and sends the link on WhatsApp; `/join/:code` names the home (through `invite_preview`, the only thing readable while signed out) and registers them into it. One home per person, one use per link, seven days. Removing somebody, or leaving, moves them to an empty home of their own rather than deleting anything.
- `supabase/schema.sql` – the whole backend.

## Notes on motion
Everything animated goes through `<MotionConfig>` in `App.tsx`. Settings → Appearance → **Movement → Calm** turns the fades and slides off entirely (`useCalm()` in `src/store/ui.ts`, also true when the device asks for reduced motion). Framer's own `reducedMotion` only suppresses transforms, so entrance animations pass `initial={calm ? false : …}` to skip the opacity fade as well — a fade from transparent is what reads as a flicker on some browsers. For the same reason the app uses no `backdrop-filter` or `mix-blend-mode` anywhere: one of either makes WebKit re-composite the whole window whenever anything moves.

## Notes
- Photos are compressed on the phone before upload (max 1800px, ~0.9MB) and stored in a private bucket; the app fetches signed URLs and caches them.
- A Supabase free-tier project pauses after 7 idle days; unpause it from the dashboard if the app suddenly can't sign in.
