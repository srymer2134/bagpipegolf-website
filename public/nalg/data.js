// NALG Denver Invitational — Bagpipe Golf scoreboard demo
// ────────────────────────────────────────────────────────────
// Real course data (City Park + Walnut Creek) pulled from the
// Bagpipe curated_courses.dart library. 72 fabricated left-handed
// players across 4 flights. Deterministic RNG so demo renders
// identically every load.

function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = makeRng(1936); // NALG founded 1936 — nice seed
const rand = (min, max) => min + rng() * (max - min);
const randInt = (min, max) => Math.floor(rand(min, max + 1));
const pick = (arr) => arr[Math.floor(rng() * arr.length)];

// ── Real curated course data from curated_courses.dart ─────────────
const COURSE_CITY_PARK = {
  name: 'City Park GC',
  city: 'Denver, CO',
  parMen: 70,
  parWomen: 72,
  // Bronze/Gold long-tee par 70 layout (men)
  menPars:   [4, 3, 4, 4, 3, 4, 4, 3, 5, 4, 4, 3, 5, 4, 4, 5, 3, 4],
  menSIs:    [4, 8, 14, 6, 12, 16, 10, 18, 2, 13, 5, 17, 3, 7, 9, 1, 15, 11],
  tees: {
    championship: { name: 'Bronze',   rating: 70.2, slope: 120, par: 70 },
    first:        { name: 'Gold',     rating: 67.0, slope: 114, par: 70 },
    second:       { name: 'Gold/Black', rating: 65.9, slope: 113, par: 70 },
    senior:       { name: 'Black',    rating: 64.5, slope: 108, par: 72 },
  },
};

const COURSE_WALNUT_CREEK = {
  name: 'Walnut Creek Golf Preserve',
  city: 'Westminster, CO',
  parMen: 72,
  parWomen: 72,
  menPars:   [4, 4, 5, 3, 4, 5, 3, 4, 4, 4, 4, 4, 5, 3, 4, 4, 3, 5],
  menSIs:    [11, 7, 1, 5, 3, 9, 17, 13, 15, 12, 16, 8, 2, 18, 6, 10, 14, 4],
  tees: {
    championship: { name: 'Tee 1',   rating: 75.2, slope: 137, par: 72 },
    first:        { name: 'Tee 2',   rating: 72.0, slope: 135, par: 72 },
    second:       { name: 'Tee 2/3', rating: 70.6, slope: 132, par: 72 },
    senior:       { name: 'Tee 3',   rating: 69.9, slope: 125, par: 72 },
  },
};

// ── Flight definitions
const FLIGHTS = [
  { id: 'championship', name: 'Championship', hcpMin: 0.0,  hcpMax: 5.4,  size: 16, color: '#0B4E30' },
  { id: 'first',        name: 'First Flight', hcpMin: 5.5,  hcpMax: 12.4, size: 20, color: '#2E7D32' },
  { id: 'second',       name: 'Second Flight',hcpMin: 12.5, hcpMax: 20.0, size: 20, color: '#5D8C41' },
  { id: 'senior',       name: 'Senior',       hcpMin: 6.0,  hcpMax: 22.0, size: 16, color: '#8B5A2B' },
];

// ── Name pools (mixed diverse first names + last names)
const FIRST_NAMES = [
  'Michael','James','Robert','John','David','Richard','Thomas','Charles','Christopher','Daniel',
  'Matthew','Anthony','Mark','Donald','Steven','Paul','Andrew','Kenneth','Joshua','Kevin',
  'Brian','George','Timothy','Ronald','Jason','Edward','Jeffrey','Ryan','Jacob','Gary',
  'Nicholas','Eric','Jonathan','Stephen','Larry','Justin','Scott','Brandon','Benjamin','Samuel',
  'Frank','Gregory','Raymond','Alexander','Patrick','Jack','Dennis','Jerry','Tyler','Aaron',
  'Jose','Adam','Nathan','Henry','Douglas','Zachary','Peter','Kyle','Ethan','Walter',
  'Noah','Jeremy','Christian','Keith','Roger','Terry','Gerald','Harold','Sean','Austin',
  'Carl','Arthur','Lawrence','Dylan','Jesse','Jordan','Bryan','Billy','Joe','Bruce',
];
const LAST_NAMES = [
  'Anderson','Bailey','Brooks','Carter','Chen','Cooper','Davis','Foster','Garcia','Hall',
  'Henderson','Hughes','Jackson','Jenkins','Jimenez','Johnson','Jones','Kim','Lee','Lopez',
  'Martin','Martinez','Miller','Mitchell','Moore','Morgan','Morris','Murphy','Nakamura','Nguyen',
  'Ortiz','Parker','Patel','Peterson','Phillips','Reed','Reyes','Rivera','Robinson','Rodriguez',
  'Rogers','Russell','Sanchez','Scott','Simmons','Smith','Stewart','Sullivan','Taylor','Thompson',
  'Torres','Turner','Vasquez','Walker','Wang','Ward','Watson','White','Williams','Wilson',
  'Wright','Young','Baker','Bell','Bennett','Butler','Campbell','Collins','Diaz','Edwards',
  'Evans','Fisher','Ford','Gray','Green','Griffin','Gutierrez','Hayes','Howard','James',
];

// Denver-area cities so it feels regionally authentic
const CITIES = [
  'Denver','Boulder','Aurora','Lakewood','Arvada','Westminster','Centennial','Thornton',
  'Fort Collins','Colorado Springs','Highlands Ranch','Littleton','Golden','Broomfield',
  'Loveland','Parker','Wheat Ridge','Englewood','Longmont','Castle Rock',
  'Cheyenne, WY','Albuquerque, NM','Salt Lake City, UT','Phoenix, AZ',
];

// ── Generate players (72 total across 4 flights)
function makePlayer(id, flight) {
  const first = pick(FIRST_NAMES);
  const last = pick(LAST_NAMES);
  const city = pick(CITIES);
  const hcp = Math.round(rand(flight.hcpMin, flight.hcpMax) * 10) / 10;
  const age = flight.id === 'senior' ? randInt(55, 78) : randInt(24, 62);
  return { id, first, last, city, hcp, flight: flight.id, flightName: flight.name, age };
}

const PLAYERS = [];
let idCounter = 1;
for (const f of FLIGHTS) {
  for (let i = 0; i < f.size; i++) {
    PLAYERS.push(makePlayer(idCounter++, f));
  }
}

// ── Simulate rounds
// R1 = City Park (par varies by tee), R2 = Walnut Creek (par 72)
// For simplicity: use each flight's tee to pick par + rating for scoring bias
function simulateRound(player, course) {
  const tee = course.tees[player.flight];
  const par = tee.par;
  // Expected round score = par + hcp * courseSlopeFactor + noise
  const slopeFactor = tee.slope / 113;
  const expectedOverPar = player.hcp * 0.90 * slopeFactor;
  const noise = (rng() + rng() + rng() - 1.5) * 3.5; // roughly normal
  const gross = Math.max(par - 5, Math.round(par + expectedOverPar + noise));
  // Course handicap = HCP × slope / 113 + (rating - par)
  const courseHcp = Math.round(player.hcp * (tee.slope / 113) + (tee.rating - par));
  const net = gross - courseHcp;
  return { gross, net, courseHcp, teeName: tee.name, par };
}

// Generate Round 1 (complete) and Round 2 (in progress — ~70% finished)
for (const p of PLAYERS) {
  p.r1 = simulateRound(p, COURSE_CITY_PARK);
  const r2 = simulateRound(p, COURSE_WALNUT_CREEK);
  // R2 status — 70% finished, 25% mid-round, 5% not yet started
  const rnd = rng();
  if (rnd < 0.70) {
    p.r2 = r2;
    p.r2.thru = 18;
    p.r2Status = 'F';
  } else if (rnd < 0.95) {
    const thru = randInt(9, 17);
    p.r2 = {
      ...r2,
      gross: Math.round(r2.gross * thru / 18),
      net: Math.round(r2.net * thru / 18),
      thru,
    };
    p.r2Status = `Thru ${thru}`;
  } else {
    p.r2 = null;
    p.r2Status = '—';
  }
  // Overall total = r1 + (r2 completed only)
  p.totalGross = p.r1.gross + (p.r2 ? p.r2.gross : 0);
  p.totalNet = p.r1.net + (p.r2 ? p.r2.net : 0);
  p.totalVsPar = p.totalGross - (COURSE_CITY_PARK.parMen + (p.r2 ? COURSE_WALNUT_CREEK.parMen : 0));
}

// ── Renderers

const vsParStr = (n) => n > 0 ? `+${n}` : (n < 0 ? `${n}` : 'E');
const vsParClass = (n) => n < 0 ? 'cell--num-good' : (n > 8 ? 'cell--num-bad' : '');

const rankMedal = (rank) => {
  if (rank === 1) return '<span class="rank-medal rank-medal--1">1</span>';
  if (rank === 2) return '<span class="rank-medal rank-medal--2">2</span>';
  if (rank === 3) return '<span class="rank-medal rank-medal--3">3</span>';
  return `<span class="cell cell--rank">${rank}</span>`;
};

// Overall (2-day cumulative, filterable by flight)
let currentFlightFilter = 'all';
function renderOverall() {
  let list = [...PLAYERS];
  if (currentFlightFilter !== 'all') {
    list = list.filter(p => p.flight === currentFlightFilter);
  }
  list.sort((a, b) => a.totalGross - b.totalGross);

  const rows = list.map((p, i) => {
    const rank = i + 1;
    const r2Str = p.r2 ? p.r2.gross : '—';
    const thruStr = p.r2Status;
    const flightLabel = FLIGHTS.find(f => f.id === p.flight).name;
    return `
      <div class="row">
        <div class="cell cell--rank ${rank <= 3 ? 'cell--rank-top' : ''}">${rank <= 3 ? rankMedal(rank) : rank}</div>
        <div class="cell cell--player">${p.first} ${p.last}</div>
        <div class="cell cell--school">${p.city} <span class="flight-badge flight-badge--${p.flight}">${flightLabel}</span></div>
        <div class="cell cell--num">${p.hcp.toFixed(1)}</div>
        <div class="cell cell--num cell--num-strong">${p.r1.gross}</div>
        <div class="cell cell--num cell--num-strong">${r2Str}</div>
        <div class="cell cell--num">${thruStr}</div>
        <div class="cell cell--num cell--num-strong">${p.totalGross}</div>
        <div class="cell cell--num ${vsParClass(p.totalVsPar)}">${vsParStr(p.totalVsPar)}</div>
      </div>
    `;
  }).join('');

  const el = document.getElementById('overall-rows');
  if (el) el.innerHTML = rows;
  const c = document.getElementById('overall-count');
  if (c) c.textContent = `${list.length} player${list.length === 1 ? '' : 's'}`;
}

function renderDay1() {
  const list = [...PLAYERS].sort((a, b) => a.r1.gross - b.r1.gross);
  const rows = list.map((p, i) => {
    const rank = i + 1;
    const parForFlight = COURSE_CITY_PARK.tees[p.flight].par;
    const vsPar = p.r1.gross - parForFlight;
    const flightLabel = FLIGHTS.find(f => f.id === p.flight).name;
    return `
      <div class="row">
        <div class="cell cell--rank ${rank <= 3 ? 'cell--rank-top' : ''}">${rank <= 3 ? rankMedal(rank) : rank}</div>
        <div class="cell cell--player">${p.first} ${p.last}</div>
        <div class="cell cell--school"><span class="flight-badge flight-badge--${p.flight}">${flightLabel}</span> <span style="color:var(--nalg-muted);font-size:12px;">· ${p.r1.teeName}</span></div>
        <div class="cell cell--num cell--num-strong">${p.r1.gross}</div>
        <div class="cell cell--num">${p.r1.net}</div>
        <div class="cell cell--num ${vsParClass(vsPar)}">${vsParStr(vsPar)}</div>
      </div>
    `;
  }).join('');
  const el = document.getElementById('day1-rows');
  if (el) el.innerHTML = rows;
}

function renderDay2() {
  // Only include players who have started R2
  const list = PLAYERS.filter(p => p.r2 || p.r2Status !== '—')
    .sort((a, b) => {
      if (!a.r2 && !b.r2) return 0;
      if (!a.r2) return 1;
      if (!b.r2) return -1;
      return a.r2.gross - b.r2.gross;
    });
  const rows = list.map((p, i) => {
    const rank = i + 1;
    const parForFlight = COURSE_WALNUT_CREEK.tees[p.flight].par;
    const grossStr = p.r2 ? p.r2.gross : '—';
    const netStr = p.r2 ? p.r2.net : '—';
    const flightLabel = FLIGHTS.find(f => f.id === p.flight).name;
    return `
      <div class="row">
        <div class="cell cell--rank ${rank <= 3 ? 'cell--rank-top' : ''}">${rank <= 3 ? rankMedal(rank) : rank}</div>
        <div class="cell cell--player">${p.first} ${p.last}</div>
        <div class="cell cell--school"><span class="flight-badge flight-badge--${p.flight}">${flightLabel}</span> <span style="color:var(--nalg-muted);font-size:12px;">· ${COURSE_WALNUT_CREEK.tees[p.flight].name}</span></div>
        <div class="cell cell--num cell--num-strong">${grossStr}</div>
        <div class="cell cell--num">${netStr}</div>
        <div class="cell cell--num">${p.r2Status}</div>
      </div>
    `;
  }).join('');
  const el = document.getElementById('day2-rows');
  if (el) el.innerHTML = rows;
}

function renderFlights() {
  const html = FLIGHTS.map(f => {
    const roster = PLAYERS
      .filter(p => p.flight === f.id)
      .sort((a, b) => a.totalGross - b.totalGross)
      .slice(0, 5); // top 5 per flight
    const rows = roster.map((p, i) => {
      const rank = i + 1;
      return `
        <div class="flight-row">
          <div class="flight-row__rank">${rank}</div>
          <div class="flight-row__name">${p.first} ${p.last}</div>
          <div class="flight-row__hcp">${p.hcp.toFixed(1)}</div>
          <div class="flight-row__total">${p.totalGross}</div>
          <div class="flight-row__vspar ${vsParClass(p.totalVsPar)}">${vsParStr(p.totalVsPar)}</div>
        </div>
      `;
    }).join('');
    return `
      <div class="flight-card" style="border-top-color:${f.color};">
        <div class="flight-card__head">
          <div class="flight-card__name">${f.name}</div>
          <div class="flight-card__meta">HCP ${f.hcpMin.toFixed(1)}–${f.hcpMax.toFixed(1)} · ${f.size} players</div>
        </div>
        <div class="flight-row flight-row--head">
          <div class="flight-row__rank">#</div>
          <div class="flight-row__name">Player</div>
          <div class="flight-row__hcp">HCP</div>
          <div class="flight-row__total">Total</div>
          <div class="flight-row__vspar">vs Par</div>
        </div>
        ${rows}
        <div class="flight-card__foot">Top 5 shown · full flight in Overall Leaderboard</div>
      </div>
    `;
  }).join('');
  const el = document.getElementById('flights-grid');
  if (el) el.innerHTML = html;
}

function renderPars(elId, pars, par, courseLabel) {
  const front = pars.slice(0, 9);
  const back = pars.slice(9);
  const frontTotal = front.reduce((s, p) => s + p, 0);
  const backTotal = back.reduce((s, p) => s + p, 0);
  const html = `
    <div class="parcard">
      <div class="parcard__head">HOLE-BY-HOLE PAR · ${courseLabel} · Total ${par}</div>
      <div class="parcard__row">
        <div class="parcard__label">Hole</div>
        ${front.map((_, i) => `<div class="parcard__cell parcard__cell--head">${i + 1}</div>`).join('')}
        <div class="parcard__cell parcard__cell--total">OUT</div>
        ${back.map((_, i) => `<div class="parcard__cell parcard__cell--head">${i + 10}</div>`).join('')}
        <div class="parcard__cell parcard__cell--total">IN</div>
        <div class="parcard__cell parcard__cell--total">TOT</div>
      </div>
      <div class="parcard__row">
        <div class="parcard__label">Par</div>
        ${front.map(p => `<div class="parcard__cell">${p}</div>`).join('')}
        <div class="parcard__cell parcard__cell--total">${frontTotal}</div>
        ${back.map(p => `<div class="parcard__cell">${p}</div>`).join('')}
        <div class="parcard__cell parcard__cell--total">${backTotal}</div>
        <div class="parcard__cell parcard__cell--total">${par}</div>
      </div>
    </div>
  `;
  const el = document.getElementById(elId);
  if (el) el.innerHTML = html;
}

// ── Tabs + filters
function initTabs() {
  document.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.tab;
      document.querySelectorAll('.tab').forEach(t => t.classList.toggle('tab--active', t === btn));
      document.querySelectorAll('.view').forEach(v => {
        v.classList.toggle('view--active', v.id === `view-${target}`);
      });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });
}

function initFilters() {
  document.querySelectorAll('#view-overall .filter').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#view-overall .filter').forEach(b => b.classList.toggle('filter--active', b === btn));
      currentFlightFilter = btn.dataset.filter || 'all';
      renderOverall();
    });
  });
}

// ── Boot with safe wrapper
function safe(fn, name) {
  try { fn(); } catch (e) { console.warn(`[boot] ${name} skipped:`, e.message); }
}
safe(renderOverall, 'overall');
safe(renderDay1,    'day1');
safe(renderDay2,    'day2');
safe(renderFlights, 'flights');
safe(() => renderPars('city-park-pars', COURSE_CITY_PARK.menPars, COURSE_CITY_PARK.parMen, 'City Park (Bronze tees · par 70)'), 'city-park-pars');
safe(() => renderPars('walnut-creek-pars', COURSE_WALNUT_CREEK.menPars, COURSE_WALNUT_CREEK.parMen, 'Walnut Creek (Tee 1 · par 72)'), 'walnut-creek-pars');
safe(initTabs,      'tabs');
safe(initFilters,   'filters');
