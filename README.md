# FrightPath

Free installable Halloween Horror Nights route optimizer and night tracker. Offline-first static PWA — zero backend, zero hosting cost.

## What it does

- **Plan:** pick your must-do houses, toggle Express, set a start time
- **Optimize:** explainable route (greedy construction + 2-opt) with per-stop wait/walk estimates and one-line "why" explanations
- **Track:** big In line / Done buttons through the night, running tally, next-up list
- **Summarize:** houses done, total line time, logged vs estimated waits

## Run it

Hosted: https://reedo3.github.io/frightpath/

Or open `index.html` directly — everything runs on-device.

## Park configs

All park data lives in `parks/hhn35.json` (HHN 35, 10 houses). Adding a park = writing one JSON file.

House locations, wait ranges, demand tiers, Express assumptions, and walkthrough durations are explicitly labeled estimates/approximations.

## Tests

```bash
node test-optimizer.js   # 11 optimizer assertions
```

## Tech

Pure static HTML/CSS/JS, `localStorage` persistence (`frightpath_night_v1`), service worker for offline use, iOS Add-to-Home-Screen support. No analytics, no accounts, no network requests.
