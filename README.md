# FPL Peek

Framework-free Fantasy Premier League workspace. The frontend is plain HTML, CSS and JavaScript, deployed on Netlify and backed by small Netlify functions for public FPL API access.

## Current product direction

FPL Peek uses a clean light workspace UI rather than a decorative dashboard theme:

- desktop left sidebar grouped by Overview, Planning, Gameweek, Analysis and Live
- compact mobile bottom navigation with a More tools sheet
- off-white background, white data surfaces, subtle borders and one restrained green accent
- no decorative gradients in the website UI
- club kit thumbnails used as functional team identifiers
- live gameweek deadline countdown including seconds

## Main features

- Home - deadline, saved-team shortcut, market snapshot, fixture radar and tool hub
- My Team - manager overview, squad, fixtures, season charts, history, chips, mini-leagues and recap
- Team Builder - build and rate a legal 15-player squad
- Scout - who to buy, transfer trends, template team and best value
- Transfer Analyzer - compare two players across price, form, ownership, availability and next-five fixtures
- Fixtures - fixture-difficulty matrix
- Players - sortable player explorer and local watchlist
- Pre-season - opening fixture runs and last-season leaders
- Captain Picks - post-deadline sample of captain choices from leading Overall managers
- Injuries - availability and flags
- Set Pieces - penalties, free-kicks and corners
- Price Watch - price changes
- Team Analyzer - squad health, fixture quality, captain shortlist and approximate upgrade radar
- Manager Compare - compare two managers, history and public squads
- Live Center - in-play points and BPS

Gameweek-dependent tools show a clear waiting state before public squad or live data is available.

## Frontend structure

- `index.html` - application markup
- `css/app.css` - all styles
- `js/core.js` - FPL API client, shared data, helpers and local storage
- `js/home.js` - Home workspace
- `js/team.js` - My Team
- `js/leagues.js` - mini-league standings and analysis
- `js/player.js` - player detail modal
- `js/tabs.js` - desktop/mobile navigation and lazy feature initialization
- `js/builder.js` - Team Builder
- `js/scout.js` - Scout
- `js/analyzer.js` - Team Analyzer
- `js/transfer-analyzer.js` - Transfer Analyzer
- `js/compare.js` - Manager Compare
- `js/captains.js` - top-manager captain sample
- `js/preseason.js` - pre-season planner
- `js/fixtures.js` - fixtures
- `js/players.js` - player explorer
- `js/injuries.js` - injuries
- `js/setpieces.js` - set pieces
- `js/prices.js` - price watch
- `js/live.js` - live gameweek
- `js/app.js` - startup wiring

No npm install, framework, bundler or build command is required.

## Netlify

`netlify/functions/fpl.js` is an allow-listed proxy for the public FPL API. It only accepts the API path shapes used by the app and applies short cache windows appropriate to each endpoint.

`netlify/functions/captains.js` samples captain choices from a small set of leading Overall managers after a deadline. It intentionally does not crawl all FPL managers.

`netlify.toml` also sets basic response security headers. A strict Content Security Policy is intentionally not enabled yet because some existing UI fallbacks still use inline handlers and should be cleaned up first.

The unused email-subscription prototype remains under `future/subscriptions/` and is not deployed.

## Deploy

Push the project to GitHub and connect the repository to Netlify.

- Build command: leave empty
- Publish directory: `.`
- Functions directory: `netlify/functions`

Every push can deploy directly. Node 20 is selected in `netlify.toml` for the functions runtime.

Data is provided via the official Fantasy Premier League API. FPL Peek operates independently and is not affiliated with or endorsed by the Premier League.

## SEO and site identity

Production metadata is configured for `https://fplpeek.com/`:

- favicon.ico plus 16x16, 32x32, Apple Touch and Android icons
- named web app manifest
- canonical URL and English hreflang metadata
- search description and crawler directives
- Open Graph and Twitter sharing metadata
- Schema.org `WebApplication` structured data
- `robots.txt`
- `sitemap.xml`

The social metadata currently uses the supplied 512x512 FPL Peek app icon. A dedicated 1200x630 social preview image can be added later without changing the rest of the SEO setup.

## Gameweek Planner

The Planner is intentionally a **simulation only**. It never logs in to Fantasy Premier League and never submits transfers, captain changes, chips or squad changes to the official game.

Planner drafts are saved automatically in browser `localStorage` under `fplpeek_plans_v1`. Users can:

- start from an empty squad
- copy a completed Team Builder draft
- import the latest squad that the public FPL API exposes for a Team ID
- plan transfers across the next 8 gameweeks
- view the squad on an FPL-style pitch with kits, fixtures, captain/vice markers and a bench row
- manually substitute players between the starting XI and bench while enforcing valid FPL formations
- choose captain / vice-captain from dedicated lineup selectors; only the selected players display C/VC badges
- clear the base squad or reset an individual gameweek
- set planned chips per gameweek
- create, duplicate, rename and delete multiple plans

The Planner uses current public player prices. Exact FPL selling values can differ after price changes; imported public squads use the selling prices exposed by the public picks endpoint when available.

## Optional Supabase accounts / cross-device sync

Accounts are optional. FPL Peek remains fully usable without registration; Supabase is only used to sync Planner drafts across devices.

### Supabase setup

1. Create a Supabase project.
2. Open **SQL Editor** and run `supabase/setup.sql` from this repository.
3. In **Authentication > URL Configuration**, set:
   - Site URL: `https://fplpeek.com/`
   - Additional redirect URL for local development: `http://localhost:8888/`
4. Keep the Email auth provider enabled. The app uses passwordless email Magic Links.
5. Open **Project Settings > API** and copy:
   - Project URL
   - **Publishable key** (`sb_publishable_...`; a legacy anon key also works if your project still uses it)
6. Put them in `js/supabase-config.js`:

```js
window.FPLPeekConfig = {
  SUPABASE_URL: "https://prilfnfijgxzohbynogc.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_eIGtwV3_Ql8NPXtw3Yy3jw_I4ykeQYt"
};
```

7. Deploy the site. The Sign in / Cloud sync UI appears automatically once both values are configured.

### Security

`supabase/setup.sql` enables Row Level Security on `profiles` and `plans`. Every read/write policy checks the authenticated user's `auth.uid()`, so one account cannot read or modify another account's plans.

**Never** put a Supabase `service_role` or secret key in frontend code. FPL Peek only needs the browser-safe publishable key.

Before opening email sign-in to the public, configure custom SMTP in Supabase Auth and use the branded templates in `supabase/email-templates/`. A suitable sender identity is `FPL Peek <account@fplpeek.com>`.

## V10 interface update

- Clearer desktop sidebar section hierarchy and active-section highlighting.
- Fixtures & Results match centre with Gameweek navigation, scheduled fixtures and completed scores.
- FDR planner retained as a dedicated view.
- Premier League standings calculated from completed FPL fixture results.
- Mobile table safeguards, compact standings columns, and a smaller player-history table in the player modal.


## Card Creator
FPL Peek includes shareable Gameweek, Career and Rivalry manager cards. Cards are rendered locally in the browser as PNG images using public FPL manager data.

## V18.1 Live Insights

FPL Peek now includes a lightweight, zero-maintenance **Insights** briefing powered directly by the public Fantasy Premier League data feed.

- no OpenAI API key
- no scheduled functions
- no editorial database
- no manual publishing
- no repeated article template
- past completed Gameweeks available at `/insights/gw/<number>/`

`/insights/` is server-rendered by `netlify/functions/insights.js` for a crawlable public page. The in-app Insights tab reads the same structured briefing from `netlify/functions/insights-data.js`. Both use `netlify/lib/live-insights.js` to choose useful sections from current Gameweek points, ownership, transfers, form, availability and official fixture difficulty.

The briefing changes with the state of the season. After a completed Gameweek it can highlight top returns and popular blanks; before the next deadline it can surface players on the radar, differentials, captain watch, fixture runs and transfer movement. Sections with no useful signal are omitted.

The short editorial-style notes use transparent rules and never claim to have watched matches or to know statistics that are not present in the public FPL feed. Past Gameweek archive pages are rebuilt on demand from final FPL event data, so no separate article database is needed. Historical transfer and ownership snapshots are intentionally omitted because the public feed does not preserve every past market value.

## V18.2 Insights presentation
- Longer editorial-style lead copy for previews, live rounds, completed reviews and archived Gameweeks.
- Club kits appear beside club/player rows using the existing lightweight official FPL shirt assets.
- A single featured player headshot is used in the main Insights story when available; it is lazy-loaded through the existing cached same-origin player-photo function to avoid loading a wall of portraits.
- Home and public Insights layouts now use a more distinctive editorial treatment with a featured story, numbered story cards, accent rails and a clearer Gameweek archive.


## V18.4
- Removed the explanatory Current / Selective / Transparent cards from the in-app Insights page.
- Mixed-topic preview leads intentionally use a neutral Gameweek visual. Player portraits remain reserved for player-led stories, while club-led stories use club visuals.


## V20 decision tools
Added Team Rating, Rotation Planner, Captaincy Matrix, optional 3-player comparison, Minutes Tracker, and FPL Peek projected points. Projections are transparent rule-based estimates from public FPL data, not betting or guaranteed predictions.

## V21 clarity and captaincy corrections
- Corrected the pre-season Captaincy Matrix so low-cost players cannot rise to the top from fixture difficulty alone.
- Removed unrealistic early-season double-digit projected points caused by tiny starts samples.
- Renamed Team Rating 2.0 to Team Rating.
- Added plain-language guides for Team Rating, Player Comparison, Captaincy Matrix, Rotation Planner, projected points and Minutes Tracker.
- Clarified Rotation Planner as a goalkeeper/defender start-rotation tool between two owned clubs.
- Updated Home Insights link styling so editorial headlines use the normal FPL Peek text palette rather than browser link purple.

## V22 updates
- Planner now has separate **Clear this GW changes** and **Clear all GWs** actions.
- Player Explorer rows use a pointer cursor and keyboard focus treatment to make player profiles feel clickable.
- Insights moved from the Overview group to Planning in the desktop sidebar.
- Added persistent light/dark appearance mode. It follows the device preference on first visit and remembers the user's choice locally.

## V24 dark-mode completeness pass
Dark mode now covers nested comparison cards, manager comparison tables, Planner toolbar/player rows, Home career stat tiles, Insights lead stories, standalone Insights pages, and Team Builder player labels while preserving the green football pitch and exported share-card artwork.

## V27 - FPL Peek Team
Adds a public-data-only FPL Peek Team challenge. The page builds one valid 15-player squad for the active/upcoming Gameweek, selects a legal starting XI plus ordered bench, captain and vice-captain, and shows live/final points with valid autosubs. Completed Gameweeks are available in the on-page record and are reconstructed from earlier-round public FPL data where possible. No real FPL account is used or changed.
