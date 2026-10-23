/* app.js — FrightPath UI. Vanilla JS, no frameworks.
 * All state that must survive a dead battery lives in localStorage.
 */
'use strict';

const NIGHT_KEY = 'frightpath_night_v1';
const LAST_KEY = 'frightpath_last_v1';

let config = null;
let selected = new Set();
let hasExpress = false;
let currentRoute = null;
let refreshTimer = null;

/* ---------- helpers ---------- */

function $(id) { return document.getElementById(id); }

function show(screenId) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  $('screen-' + screenId).classList.add('active');
  window.scrollTo(0, 0);
  if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
  if (screenId === 'tracker') {
    refreshTimer = setInterval(() => renderTracker(), 30000); // refresh timers
  }
}

function fmtDur(min) {
  min = Math.round(min);
  if (min < 60) return min + 'm';
  const h = Math.floor(min / 60);
  return h + 'h ' + (min % 60) + 'm';
}

function houseById(id) { return config.houses.find(h => h.id === id); }

function saveNight(night) {
  if (night) localStorage.setItem(NIGHT_KEY, JSON.stringify(night));
  else localStorage.removeItem(NIGHT_KEY);
}
function loadNight() {
  try { return JSON.parse(localStorage.getItem(NIGHT_KEY)); } catch (e) { return null; }
}

/* ---------- home ---------- */

async function init() {
  try {
    const res = await fetch('parks/hhn35.json');
    config = await res.json();
  } catch (e) {
    $('park-tagline').textContent = 'Could not load park data. Serve over http(s), not file://.';
    return;
  }
  $('park-tagline').textContent =
    `${config.parkName} · ${config.venue} · ${config.eventDates}`;

  // Default: all houses selected (a first-timer wants the full night).
  config.houses.forEach(h => selected.add(h.id));
  renderHouseList();

  // Resume an interrupted night?
  if (loadNight()) $('resume-box').style.display = 'block';

  $('express-toggle').addEventListener('click', toggleExpress);
  $('express-toggle').addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleExpress(); }
  });
  $('btn-build').addEventListener('click', buildRouteUI);
  $('btn-resume').addEventListener('click', () => { renderTracker(); show('tracker'); });
  $('btn-start-night').addEventListener('click', startNight);
  $('btn-back-home').addEventListener('click', () => show('home'));
  $('btn-end-night').addEventListener('click', endNight);
  $('btn-new-night').addEventListener('click', () => { show('home'); });
}

function renderHouseList() {
  const el = $('house-list');
  el.innerHTML = '';
  config.houses.forEach(h => {
    const b = document.createElement('button');
    b.className = 'house-pick' + (selected.has(h.id) ? ' selected' : '');
    b.setAttribute('aria-pressed', selected.has(h.id) ? 'true' : 'false');
    b.innerHTML =
      '<span class="check">✓</span>' +
      '<span class="info"><span class="name"></span><br><span class="zone"></span></span>' +
      '<span class="demand ' + h.demand + '">' + h.demand + ' demand</span>';
    b.querySelector('.name').textContent = h.name;
    b.querySelector('.zone').textContent = h.zone + ' · ~' +
      h.typicalWaitMin + '–' + h.typicalWaitMax + ' min';
    b.addEventListener('click', () => {
      if (selected.has(h.id)) selected.delete(h.id);
      else selected.add(h.id);
      renderHouseList();
    });
    el.appendChild(b);
  });
}

function toggleExpress() {
  hasExpress = !hasExpress;
  const t = $('express-toggle');
  t.classList.toggle('on', hasExpress);
  t.setAttribute('aria-checked', hasExpress ? 'true' : 'false');
}

/* ---------- route ---------- */

function buildRouteUI() {
  const houses = config.houses.filter(h => selected.has(h.id));
  if (!houses.length) { alert('Pick at least one house first.'); return; }
  currentRoute = Optimizer.buildRoute(houses, config, { hasExpress });
  renderRoute();
  show('route');
}

function renderRoute() {
  const r = currentRoute;
  $('route-total').innerHTML =
    '<strong>' + r.stops.length + ' houses</strong> · ~' + fmtDur(r.totalMin) + ' total<br>' +
    '<span style="color:var(--muted);font-size:14px">~' + fmtDur(r.totalWaitMin) +
    ' in lines · ~' + fmtDur(r.totalWalkMin) + ' walking · estimates, not promises</span>';

  const el = $('route-stops');
  el.innerHTML = '';
  r.stops.forEach((s, i) => {
    const d = document.createElement('div');
    d.className = 'stop';
    const num = document.createElement('span'); num.className = 'stop-num'; num.textContent = i + 1;
    const name = document.createElement('span'); name.className = 'stop-name'; name.textContent = s.house.name;
    const meta = document.createElement('div'); meta.className = 'stop-meta';
    meta.textContent = '≈' + s.waitMin + ' min wait · ' + s.walkMin + ' min walk';
    const why = document.createElement('div'); why.className = 'stop-why'; why.textContent = s.why;
    d.appendChild(num); d.appendChild(name); d.appendChild(meta); d.appendChild(why);
    el.appendChild(d);
  });
}

/* ---------- tracker ---------- */

function startNight() {
  const night = {
    parkId: config.parkId,
    startedAt: Date.now(),
    route: currentRoute.stops.map(s => ({ houseId: s.house.id, estWait: s.waitMin })),
    events: []
  };
  saveNight(night);
  $('resume-box').style.display = 'block';
  renderTracker();
  show('tracker');
}

function nightEvents(night, houseId, type) {
  return night.events.filter(e => e.houseId === houseId && e.type === type);
}

function currentHouse(night) {
  // First route house without a 'done' event.
  return night.route.find(r => !nightEvents(night, r.houseId, 'done').length) || null;
}

function actualWaitMin(night, houseId) {
  const inl = nightEvents(night, houseId, 'inline')[0];
  const don = nightEvents(night, houseId, 'done')[0];
  if (!inl || !don) return null;
  return Math.max(0, Math.round((don.at - inl.at) / 60000));
}

function renderTracker() {
  const night = loadNight();
  if (!night) { show('home'); return; }
  const cur = currentHouse(night);

  // Tally
  const doneIds = night.route.filter(r => nightEvents(night, r.houseId, 'done').length);
  let lineMin = 0;
  doneIds.forEach(r => { const w = actualWaitMin(night, r.houseId); if (w != null) lineMin += w; });
  $('tally-done').textContent = doneIds.length;
  $('tally-lines').textContent = fmtDur(lineMin);
  $('tally-left').textContent = night.route.length - doneIds.length;

  // Current house card
  const tc = $('tracker-current');
  tc.innerHTML = '';
  if (!cur) {
    tc.innerHTML = '<div class="tc-label">All done</div>' +
      '<div class="tc-name">Night complete 🎉</div>' +
      '<div class="tc-timer">Hit "End night" for your summary.</div>';
  } else {
    const h = houseById(cur.houseId);
    const inl = nightEvents(night, cur.houseId, 'inline')[0];
    const label = document.createElement('div'); label.className = 'tc-label'; label.textContent = 'Now';
    const name = document.createElement('div'); name.className = 'tc-name'; name.textContent = h.name;
    tc.appendChild(label); tc.appendChild(name);
    if (!inl) {
      const btn = document.createElement('button');
      btn.className = 'btn'; btn.textContent = 'In line — start timer';
      btn.addEventListener('click', () => {
        const n = loadNight();
        n.events.push({ houseId: cur.houseId, type: 'inline', at: Date.now() });
        saveNight(n); renderTracker();
      });
      tc.appendChild(btn);
      const hint = document.createElement('div'); hint.className = 'tc-timer';
      hint.textContent = 'Est. wait ≈' + cur.estWait + ' min';
      tc.appendChild(hint);
    } else {
      const mins = Math.round((Date.now() - inl.at) / 60000);
      const timer = document.createElement('div'); timer.className = 'tc-timer';
      timer.textContent = 'In line for ' + fmtDur(mins) + ' (est. ≈' + cur.estWait + ' min)';
      const btn = document.createElement('button');
      btn.className = 'btn'; btn.textContent = 'Done — went through ✓';
      btn.addEventListener('click', () => {
        const n = loadNight();
        n.events.push({ houseId: cur.houseId, type: 'done', at: Date.now() });
        saveNight(n); renderTracker();
      });
      tc.appendChild(timer); tc.appendChild(btn);
    }
  }

  // Next-up list
  const nu = $('next-up');
  nu.innerHTML = '';
  night.route.forEach(r => {
    const h = houseById(r.houseId);
    const done = nightEvents(night, r.houseId, 'done').length > 0;
    const row = document.createElement('div');
    row.className = 'nu-row' + (done ? ' done' : '');
    const left = document.createElement('span'); left.textContent = (done ? '✓ ' : '') + h.name;
    const right = document.createElement('span'); right.className = 'nu-wait';
    if (done) {
      const w = actualWaitMin(night, r.houseId);
      right.textContent = w != null ? 'you waited ' + fmtDur(w) : 'done';
    } else {
      right.textContent = '≈' + r.estWait + ' min';
    }
    row.appendChild(left); row.appendChild(right);
    nu.appendChild(row);
  });
}

/* ---------- summary ---------- */

function endNight() {
  const night = loadNight();
  if (!night) { show('home'); return; }
  const log = night.route.map(r => {
    const h = houseById(r.houseId);
    const done = nightEvents(night, r.houseId, 'done').length > 0;
    return {
      name: h ? h.name : r.houseId,
      done,
      actual: done ? actualWaitMin(night, r.houseId) : null,
      est: r.estWait
    };
  }).filter(e => e.done);
  const totalActual = log.reduce((a, e) => a + (e.actual || 0), 0);
  const summary = {
    endedAt: Date.now(),
    count: log.length,
    totalActual,
    log
  };
  localStorage.setItem(LAST_KEY, JSON.stringify(summary));
  saveNight(null);
  $('resume-box').style.display = 'none';
  renderSummary(summary);
  show('summary');
}

function renderSummary(s) {
  if (!s) {
    try { s = JSON.parse(localStorage.getItem(LAST_KEY)); } catch (e) { s = null; }
  }
  if (!s) { show('home'); return; }
  $('sum-count').textContent = s.count;
  $('sum-totals').innerHTML =
    '<strong>' + fmtDur(s.totalActual) + '</strong> total time in lines<br>' +
    '<span style="color:var(--muted);font-size:14px">' + s.count + ' houses completed</span>';
  const el = $('sum-log');
  el.innerHTML = '';
  if (!s.log.length) {
    el.innerHTML = '<div class="beta-note">No houses were logged as done this night.</div>';
    return;
  }
  s.log.forEach(e => {
    const row = document.createElement('div');
    row.className = 'log-row';
    const left = document.createElement('span'); left.textContent = e.name;
    const right = document.createElement('span');
    const act = document.createElement('span'); act.className = 'actual';
    act.textContent = e.actual != null ? fmtDur(e.actual) : '—';
    const est = document.createElement('span'); est.className = 'est';
    est.textContent = ' (est. ≈' + fmtDur(e.est) + ')';
    right.appendChild(act); right.appendChild(est);
    row.appendChild(left); row.appendChild(right);
    el.appendChild(row);
  });
}

document.addEventListener('DOMContentLoaded', init);
