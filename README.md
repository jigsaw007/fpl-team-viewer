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

Unofficial tool - not affiliated with the Premier League.

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
