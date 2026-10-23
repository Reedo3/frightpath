/* test-optimizer.js — quick sanity tests for the route optimizer. Run: node test-optimizer.js */
'use strict';
const fs = require('fs');
const path = require('path');
const Optimizer = require('./optimizer.js');

const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'parks', 'hhn35.json'), 'utf8'));
const houses = config.houses;

let failures = 0;
function check(name, cond, detail) {
  if (cond) { console.log(`ok   ${name}`); }
  else { failures++; console.log(`FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

// 1. Full route: all 10 houses exactly once
let t0 = Date.now();
const full = Optimizer.buildRoute(houses, config, { hasExpress: false });
const ms = Date.now() - t0;
check('full route has 10 stops', full.stops.length === 10, `got ${full.stops.length}`);
const ids = full.stops.map(s => s.house.id);
check('all houses unique', new Set(ids).size === 10);
check('runs fast (<100ms)', ms < 100, `${ms}ms`);
check('total time positive', full.totalMin > 0, `${full.totalMin}`);
check('every stop has explanation', full.stops.every(s => typeof s.why === 'string' && s.why.length > 10));

// 2. Express pass reduces waits
const expr = Optimizer.buildRoute(houses, config, { hasExpress: true });
check('express reduces total wait', expr.totalWaitMin < full.totalWaitMin,
  `express=${expr.totalWaitMin} vs standby=${full.totalWaitMin}`);

// 3. Subset selection works
const three = Optimizer.buildRoute(houses.slice(0, 3), config, {});
check('subset of 3 works', three.stops.length === 3);

// 4. Empty selection
const empty = Optimizer.buildRoute([], config, {});
check('empty selection returns zeroed route', empty.stops.length === 0 && empty.totalMin === 0);

// 5. Walk times sane (1..20 min on this grid)
const w = Optimizer.walkMinutes({ x: 0, y: 0 }, { x: 100, y: 100 }, config);
check('max walk sane', w >= 1 && w <= 20, `${w} min`);

// 6. Expected wait within configured ranges (standby, mid-evening)
const h = houses[0];
const ew = Optimizer.expectedWait(h, 120, false);
check('expected wait within range', ew >= h.typicalWaitMin * 0.6 && ew <= h.typicalWaitMax * 1.05, `${ew} min`);

// 7. Determinism: same input -> same order
const a = Optimizer.buildRoute(houses, config, {}).stops.map(s => s.house.id).join(',');
const b = Optimizer.buildRoute(houses, config, {}).stops.map(s => s.house.id).join(',');
check('deterministic', a === b);

console.log(full.stops.map((s, i) => `${i + 1}. ${s.house.name} — wait ${s.waitMin}m, walk ${s.walkMin}m`).join('\n'));
console.log(`\nTotal: ~${Math.round(full.totalMin / 60 * 10) / 10}h (${full.totalWaitMin}m waits + ${full.totalWalkMin}m walking)`);
console.log(failures === 0 ? '\nALL TESTS PASSED' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
