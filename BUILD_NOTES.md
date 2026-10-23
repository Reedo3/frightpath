# FrightPath v1 — Build Notes

Built 2026-10-05. Static PWA, zero backend, zero hosting cost, zero runtime
external requests. Deploy: copy the folder to GitHub Pages / Cloudflare Pages
(or any static host) and open `index.html`.

## What's done

- **4 screens, mobile-first:** home (pick must-do houses, Express toggle, start
  time) → optimized route (ordered stops, per-stop wait/walk, one-line "why"
  explanations, totals) → night tracker (big In line / Done buttons, running
  tally, next-up list) → summary (houses done, total line time, logged vs
  estimated waits).
- **Park config system:** all park data lives in `parks/hhn35.json`. Adding a
  park = writing one JSON file; the app loads whichever config is selected.
  Currently HHN 35 only (10 verified houses).
- **Optimizer** (`optimizer.js`): greedy construction on (expected wait at
  projected arrival + walk time), then 2-opt local improvement. Pure JS, no
  DOM, runs in <100ms. **No ML — deliberate.** Comments in the code say why:
  routing is a scheduling problem; the honest ML slot is v2 wait-time
  prediction once real logs exist.
- **PWA:** `manifest.json`, service worker (`sw.js`) caching all assets for
  offline use, iOS Add-to-Home-Screen meta tags, theme color, generated icons.
- **Persistence:** active night in `localStorage` (`frightpath_night_v1`) —
  survives refresh/dead battery. "Resume tonight's tracking" on home.
- **Tests:** `test-optimizer.js` — 11 assertions, all passing
  (`node test-optimizer.js`). Headless smoke test of the full UI flow
  (build → track → end → summary) passed.
- Dark spooky theme, 56px+ touch targets, readable in a dark park.

## What's placeholder

- **Affiliate cards:** two styled placeholder cards on the route screen ("Get
  HHN tickets", "Express Pass") with TODO comments. No real links — wire them
  once an affiliate program approves the site. Note: Express Pass availability
  through third-party affiliates is unverified; check before promising it.
- **Single park:** config architecture supports more, but only `hhn35.json`
  ships. No park-switcher UI yet (trivial to add when a second config exists).

## Known approximations (flagged in-app and in config)

- **House locations are approximate** (author-estimated on a 0–100 grid from
  public park maps). Walk times derived from them are rough. Visible "beta"
  note in the app; trivially editable in the JSON.
- **Wait ranges & demand tiers are estimates** from published house rankings
  (AllEars HHN35 ranking, TouringPlans impressions) and IP-vs-original crowd
  patterns — not measured data.
- **Time-of-night wait curve** (ramps up, peaks mid-evening, eases late) is a
  heuristic shaped like reality, not a fitted model.
- **Express = 15 min/house** and **house walkthrough = 12 min** are fixed
  estimates.
- Event hours ("typically 6:30 PM – 2:00 AM") vary by night — verify on
  Universal's site.

## Not built (v2, deliberately)

- Crowdsourced wait times (needs a backend; cold-start risk documented).
- Wait-time prediction model (needs real logs first).
- Push notifications, analytics, accounts — none, by design.

## Files

```
park-planner/
├── index.html          # app shell, 4 screens
├── styles.css          # dark spooky theme
├── app.js              # UI + tracker + localStorage
├── optimizer.js        # greedy + 2-opt route optimizer (node-testable)
├── test-optimizer.js   # 11 optimizer tests
├── manifest.json       # PWA manifest
├── sw.js               # offline service worker
├── icons/              # icon-192.png, icon-512.png (generated)
├── parks/hhn35.json    # HHN 35 config (houses, waits, map, meta)
└── BUILD_NOTES.md      # this file
```
