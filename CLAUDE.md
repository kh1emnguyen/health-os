# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # local dev server (hot reload)
npm run build    # production build → dist/
npm run preview  # preview the production build locally
```

No test runner or linter is configured. Build success (`npm run build`) is the primary verification step before every commit.

## Deployment

Deployed to **GitHub Pages** at `https://kh1emnguyen.github.io/health-os/` via `.github/workflows/deploy.yml`.

- The workflow triggers on push to `main` using `actions/upload-pages-artifact` + `actions/deploy-pages`
- GitHub Pages must be configured to source from **GitHub Actions** (not a branch) in repo settings
- `vite.config.js` sets `base: '/health-os/'` — all asset paths are relative to this prefix; removing it breaks the deployed site
- `dist/` is gitignored; the CI builds it fresh each run using `npm ci`
- Supabase credentials are injected as GitHub Actions secrets: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`

## Architecture

Single-file React app: **`src/App.jsx`** contains all data constants, all components, and all page layout. There are no routes, no state management library, and no separate component files.

### UI model — plain-language nodes that drill down (2026-05-31 redesign)

The dashboard is two layers:

1. **Top layer (always visible):** each health domain is one `HealthNode` — a card showing an emoji, plain-English title, a one-line **verdict** (no jargon), a colour-coded **status** badge (`good` / `watch` / `act` / `info` / `neutral`, see the `STATUS` map), and a single friendly **metric**.
2. **Drill-down (on click):** clicking a node opens a drawer (`children`, conditionally rendered — so collapsed drawer text is NOT in the DOM) with the full-sentence explanation and the peer-reviewed citations.

**All health commentary must be layperson-readable on the surface and research-cited in the drawer.** Keep jargon (RMSSD, PhenoAge, VFA, eGFR) out of titles/verdicts; explain it in plain words inside the drawer.

A **latest-wins snapshot strip** sits at the top of `<main>`. `buildSnapshot(live)` collects a candidate `{ when: Date, source, line }` from every source (Garmin sleep / run / gym + live Supabase pings, check-ins, meals) and renders the single most-recent one. Use `localDateStr(dt)` (local calendar fields) for any date label — never `Date.toISOString()`, which shifts a day in UTC+10 (Melbourne).

### Data layer (top of App.jsx)

All health data lives as plain JS constants — no API calls except one optional Supabase fetch:

| Constant | Contents |
|---|---|
| `STATUS` | Status→colour/word map driving every `HealthNode` badge |
| `GARMIN` | Sleep **daily** (`recentDays`, with `outlier` flag) + weekly rollup, HRV, VO₂ max, half-marathon, running |
| `INBODY` | InBody 580 BIA scan — body fat %, SMM, VFA, segmental lean, BMR |
| `BLOOD` | Full blood count, iron, thyroid, chemistry (all with `{ name, value, unit, range, st }`) |
| `GYM` | Hevy workout sessions (`sessions[]`, most-recent first) |
| `MACRO_TARGETS` | Research-based macro/energy targets (Morton 2018, IOM AMDR). **No calorie/macro counting** — targets only |
| `MICRONUTRIENTS` | Qualitative micronutrient panel (`status`: good/watch/unknown) — DGA + Linus Pauling + Reynolds 2019 |
| `DIET_ASSESSMENT` | Qualitative diet strengths/shortcomings; `hasMealData` flips it from "awaiting" to a real read |
| `FITNESS_BIO_AGE` | 5-factor bio age estimate with weights, component ages, and citation sources |
| `INPUTS` | Registry of all trackable inputs — `present: true/false` drives coverage % |
| `CURRENT_SIGNAL` | Journal-derived mental state flags |

**Sleep is daily, not weekly.** `GARMIN.sleep.recentDays` is one row per night; nights with `outlier: true` (e.g. the May 31 Champions League all-nighter) are excluded from `weekAvgScore` / `weekAvgDurMin` and drawn in red on the mini-trend.

**Critical naming rule:** blood marker objects use `range` (not `ref`) for the reference interval string. `ref` is a reserved React prop — spreading an object with `ref` onto a JSX element causes a runtime crash and blank page. The `MRow` component destructures `range` explicitly for this reason.

### Supabase live fetch

`src/lib/supabase.js` creates a client only when both env vars are present; otherwise exports `null`. The `useEffect` in `App` checks for `null` and short-circuits — the dashboard falls back to static constants gracefully.

Live data reads from three tables: `weekly_checkins` (latest row), `habit_pings` (last 14 days), and `meals` (latest row — Phase 2; the query swallows a missing-table error so it degrades gracefully). These feed the snapshot strip, the habit adherence node, and the diet adequacy node. Nothing writes to Supabase from this app.

### Component conventions

All components are `function` declarations (hoisted) in a single file:

- `HealthNode` — **the core pattern.** Props `{ emoji, title, verdict, status, metric, metricLabel, children, defaultOpen }`. Owns its own open/closed `useState`. Children are the drill-down drawer.
- `P` — plain paragraph for drawer prose
- `Card` — themed container (used for the coverage section)
- `SectionTitle` — uppercase section label with optional hint
- `MRow` — single blood marker row; props `{ name, value, unit, range, st }`, `st` is `'ok' | 'low' | 'high'`
- `SegBar` — InBody segmental lean bar (green ≥100%, amber 90–99%, red <90%)
- `Cite` — muted italic citation span

**Critical naming rule:** blood marker objects use `range` (not `ref`). `ref` is a reserved React prop — spreading an object with `ref` onto a JSX element crashes to a blank page. `MRow` destructures `range` explicitly.

### Adding new health data

1. Add/update a constant at the top of `App.jsx` with the raw values
2. Mark the relevant `INPUTS` entry `present: true` with a `value` string
3. Add a `<HealthNode>` (with a plain verdict + status + metric, detail in `children`) under the right `<SectionTitle>`
4. If it affects the bio age model, update `FITNESS_BIO_AGE.domains` and recompute the composite in the comment block above it
5. Keep the surface jargon-free; put science + `<Cite>` citations in the drawer

### Nutrition — no calorie/macro counting (by design)

`MACRO_TARGETS` shows research-based **targets** and `MICRONUTRIENTS` / `DIET_ASSESSMENT` give a **qualitative** read. Do NOT translate logged meals into exact macros — the product intent is an *intuition* of adequacy (on track / short / unknown), because portion-level macro maths is false precision. When Phase 2 Pulse meal logging lands, set `DIET_ASSESSMENT.hasMealData = true` and derive the read from the `meals` table.

### Bio age model

Weighted composite of 5 factors (weights sum to 1.0). Documented inline above the `FITNESS_BIO_AGE` constant with per-factor citations. The confidence interval narrows as more inputs are added. Two Levine PhenoAge inputs are still missing (fasting glucose, hs-CRP) — once present, the model can switch to the full formula.
