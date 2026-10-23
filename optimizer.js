/* optimizer.js — route optimization for FrightPath.
 *
 * Pure logic, no DOM. Loaded by index.html AND testable via node:
 *   node test-optimizer.js
 *
 * HONESTY NOTES (read before "improving" this with ML):
 * - There is no machine learning here, deliberately. Route ordering is a
 *   scheduling problem: classical greedy + 2-opt local search beats a neural
 *   net on speed, explainability, and reliability — and runs instantly on a
 *   phone with no server.
 * - Wait times are ESTIMATES from the park config (typicalWaitMin/Max), not
 *   measured data. The time-of-night curve below is a heuristic, not a model
 *   fit to real logs. If crowdsourced wait logs ever exist (v2), THAT is where
 *   a small regression model would earn its place — predicting wait given
 *   (house, hour, day of week). Not here.
 * - House map coordinates are approximate (flagged in the config). Walk times
 *   derived from them are rough.
 */

'use strict';

// Export for node; in browser this attaches to window.
const Optimizer = (() => {
  // Fixed estimates — flagged, not measured.
  const HOUSE_DURATION_MIN = 12; // walkthrough time per house (estimate)
  const EXPRESS_WAIT_MIN = 15;   // express line still waits (estimate)

  // Time-of-night multiplier on base wait. Heuristic curve:
  // lines build over the first ~hour, peak mid-evening, ease late.
  // This is a guess shaped like reality, not a fitted model.
  function timeOfNightFactor(minutesSinceStart) {
    if (minutesSinceStart < 30) return 0.7;
    if (minutesSinceStart < 60) return 0.85;
    if (minutesSinceStart < 300) return 1.0;
    return 0.75;
  }

  function baseWait(house) {
    return (house.typicalWaitMin + house.typicalWaitMax) / 2;
  }

  function expectedWait(house, minutesSinceStart, hasExpress) {
    if (hasExpress) return EXPRESS_WAIT_MIN;
    return Math.round(baseWait(house) * timeOfNightFactor(minutesSinceStart));
  }

  function walkMinutes(a, b, config) {
    // a, b: {x, y} on the 0–100 grid. Euclidean, scaled by config.
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    return Math.max(1, Math.round((dist / 100) * config.walkMinutesPer100Units));
  }

  const ENTRANCE = { x: 50, y: 95 };

  // Simulate a full route: returns per-stop timing + totals.
  // route: array of house objects in visit order.
  function simulate(route, config, opts) {
    const stops = [];
    let t = 0; // minutes since start
    let prev = ENTRANCE;
    let totalWait = 0;
    let totalWalk = 0;
    for (const house of route) {
      const walk = walkMinutes(prev, house.map, config);
      t += walk;
      const wait = expectedWait(house, t, opts.hasExpress);
      stops.push({ house, walkMin: walk, waitMin: wait, arriveMin: t });
      t += wait + HOUSE_DURATION_MIN;
      totalWait += wait;
      totalWalk += walk;
      prev = house.map;
    }
    return { stops, totalWaitMin: totalWait, totalWalkMin: totalWalk, totalMin: t };
  }

  function routeCost(route, config, opts) {
    const s = simulate(route, config, opts);
    return s.totalWaitMin + s.totalWalkMin; // house durations are constant, skip them
  }

  // Greedy construction: from current position, pick the remaining house with
  // the lowest (projected wait at arrival + walk). Explainable by construction.
  function greedyOrder(houses, config, opts) {
    const remaining = houses.slice();
    const order = [];
    let prev = ENTRANCE;
    let t = 0;
    while (remaining.length) {
      let bestIdx = 0;
      let bestScore = Infinity;
      for (let i = 0; i < remaining.length; i++) {
        const h = remaining[i];
        const walk = walkMinutes(prev, h.map, config);
        const wait = expectedWait(h, t + walk, opts.hasExpress);
        const score = wait + walk;
        if (score < bestScore) {
          bestScore = score;
          bestIdx = i;
        }
      }
      const next = remaining.splice(bestIdx, 1)[0];
      const walk = walkMinutes(prev, next.map, config);
      t += walk + expectedWait(next, t + walk, opts.hasExpress) + HOUSE_DURATION_MIN;
      prev = next.map;
      order.push(next);
    }
    return order;
  }

  // 2-opt local improvement: try swapping every pair; keep improvements.
  // n <= ~10 houses, so O(n^2) sims per pass is trivial on a phone.
  function twoOpt(order, config, opts) {
    let best = order.slice();
    let bestCost = routeCost(best, config, opts);
    let improved = true;
    while (improved) {
      improved = false;
      for (let i = 0; i < best.length - 1; i++) {
        for (let j = i + 1; j < best.length; j++) {
          const cand = best.slice();
          const tmp = cand[i];
          cand[i] = cand[j];
          cand[j] = tmp;
          const c = routeCost(cand, config, opts);
          if (c < bestCost) {
            best = cand;
            bestCost = c;
            improved = true;
          }
        }
      }
    }
    return best;
  }

  // One-line, truthful explanation per stop, generated from the FINAL order.
  function explainStop(stop, idx, sim, opts) {
    const parts = [];
    if (idx === 0) {
      parts.push(`First stop: ${stop.waitMin} min expected wait, ${stop.walkMin} min walk from the entrance.`);
    } else {
      const prevName = sim.stops[idx - 1].house.name;
      parts.push(`${stop.waitMin} min expected wait, ${stop.walkMin} min walk from ${prevName}.`);
    }
    if (stop.house.demand === 'highest' && stop.arriveMin < 90 && !opts.hasExpress) {
      parts.push('High-demand house placed early, before its line peaks.');
    }
    if (opts.hasExpress) {
      parts.push('Express Pass: waits estimated at express-line levels.');
    }
    return parts.join(' ');
  }

  // Main entry: houses = selected house objects, config = park config,
  // opts = { hasExpress: bool }.
  function buildRoute(houses, config, opts) {
    opts = opts || {};
    if (!houses.length) return { stops: [], totalWaitMin: 0, totalWalkMin: 0, totalMin: 0 };
    const greedy = greedyOrder(houses, config, opts);
    const improved = twoOpt(greedy, config, opts);
    const sim = simulate(improved, config, opts);
    sim.stops.forEach((s, i) => { s.why = explainStop(s, i, sim, opts); });
    return sim;
  }

  return { buildRoute, expectedWait, walkMinutes, simulate, HOUSE_DURATION_MIN, EXPRESS_WAIT_MIN };
})();

// node export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Optimizer;
}
