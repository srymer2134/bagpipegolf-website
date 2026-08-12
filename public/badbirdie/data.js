// Bad Birdie High × Bagpipe Golf — beta scoreboard demo data
// ────────────────────────────────────────────────────────────────
// 100 fabricated players across 12 real Bad Birdie High schools.
// Deterministic RNG so demo renders identically every load.

// ── Deterministic RNG (mulberry32)
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
const rng = makeRng(42);
const rand = (min, max) => min + rng() * (max - min);
const randInt = (min, max) => Math.floor(rand(min, max + 1));
const pick = (arr) => arr[Math.floor(rng() * arr.length)];

// ── The 12 real Bad Birdie High schools
const SCHOOLS = [
  { id: 'ponte-vedra',   name: 'Ponte Vedra',        state: 'FL', region: 'East',    roster: 9,  bias: -1.8, coach: "James O'Neill" },
  { id: 'corona-del-sol',name: 'Corona del Sol',     state: 'AZ', region: 'West',    roster: 10, bias: -1.5, coach: 'Ryan Terrell' },
  { id: 'hargrave',      name: 'Hargrave Military',  state: 'VA', region: 'East',    roster: 8,  bias: -0.8, coach: 'Mark Sanders' },
  { id: 'marietta',      name: 'Marietta',           state: 'OH', region: 'Central', roster: 9,  bias: -0.4, coach: 'Ellen Barr' },
  { id: 'prospect-ridge',name: 'Prospect Ridge',     state: 'CO', region: 'Central', roster: 8,  bias: 0.0,  coach: 'Diego Alvarez' },
  { id: 'ridgeview',     name: 'Ridgeview',          state: 'ID', region: 'West',    roster: 8,  bias: 0.3,  coach: 'Sam Kirkpatrick' },
  { id: 'north-bend',    name: 'North Bend',         state: 'OR', region: 'West',    roster: 8,  bias: 0.6,  coach: 'Kevin Yuan' },
  { id: 'richfield',     name: 'Richfield',          state: 'UT', region: 'West',    roster: 8,  bias: 0.8,  coach: 'Nate Wescott' },
  { id: 'st-pat',        name: 'St. Patrick',        state: 'MS', region: 'Central', roster: 8,  bias: 1.1,  coach: 'Beth Jimenez' },
  { id: 'skyline',       name: 'Skyline',            state: 'ID', region: 'West',    roster: 8,  bias: 1.4,  coach: 'Justin McKay' },
  { id: 'constitution',  name: 'Constitution',       state: 'PA', region: 'East',    roster: 8,  bias: 2.0,  coach: 'Lauren Chen' },
  { id: 'guthrie',       name: 'Guthrie',            state: 'OK', region: 'Central', roster: 8,  bias: 2.4,  coach: 'Wes Padilla' },
];
// roster sum = 100

// ── Name pools tagged by gender for real filter behavior
const FIRST_BOYS = [
  'Jordan','Miles','Cole','Wyatt','Mason','Elijah','Isaiah','Noah','Ethan','Owen',
  'Lucas','Liam','Aiden','Julian','Xavier','Diego','Mateo','Rafael','Malik','Jayden',
  'Terrell','Zion','Devin','Marcus','DeShawn','Andre','Trevon','Jamal','Micah','Rylan',
  'Bryce','Tanner','Landon','Grayson','Bennett','Sawyer','Colton','Weston','Kai','Ashton',
];
const FIRST_GIRLS = [
  'Emma','Ava','Olivia','Sophia','Isabella','Mia','Amelia','Charlotte','Harper','Evelyn',
  'Abigail','Ella','Ellie','Grace','Chloe','Zoey','Lily','Aria','Aubrey','Layla',
  'Nora','Camila','Aaliyah','Zara','Naomi','Anika','Priya','Leilani','Mei','Sienna',
  'Rowan','Emerson','Sloane','Harlow','Blakely','Kennedy','Sutton','Presley','Everly','Hazel',
];
const LAST = [
  'Anderson','Bailey','Brooks','Carter','Chen','Cooper','Davis','Foster','Garcia','Hall',
  'Henderson','Hughes','Jackson','Jenkins','Jimenez','Johnson','Jones','Kim','Lee','Lopez',
  'Martin','Martinez','Miller','Mitchell','Moore','Morgan','Morris','Murphy','Nakamura','Nguyen',
  'Ortiz','Parker','Patel','Peterson','Phillips','Reed','Reyes','Rivera','Robinson','Rodriguez',
  'Rogers','Russell','Sanchez','Scott','Simmons','Smith','Stewart','Sullivan','Taylor','Thompson',
  'Torres','Turner','Vasquez','Walker','Wang','Ward','Watson','White','Williams','Wilson',
];
const YEARS = ['Fr','So','Jr','Sr','Fr','So','Jr','Sr','Jr','Sr'];

// ── Generate players (100 total)
function makePlayer(id, school) {
  const gender = rng() < 0.55 ? 'B' : 'G'; // slight boy skew mirroring most HS golf rosters
  const first = pick(gender === 'B' ? FIRST_BOYS : FIRST_GIRLS);
  const last = pick(LAST);
  const hcpRaw = 8 + school.bias + (rng() + rng() + rng() - 1.5) * 8;
  const hcp = Math.max(0, Math.min(30, Math.round(hcpRaw * 10) / 10));
  const rounds = randInt(6, 14);
  const noiseSd = 2 + hcp * 0.08;
  const avg = Math.round((72 + hcp * 0.92 + rand(-noiseSd, noiseSd)) * 10) / 10;
  const vsPar = Math.round((avg - 72) * 10) / 10;
  const best = Math.round(avg - rand(2.5, 6));
  const form = Array.from({length: 5}, () => {
    const r = rng();
    const winRate = 0.45 - school.bias * 0.06;
    if (r < winRate) return 'w';
    if (r < winRate + 0.10) return 't';
    return 'l';
  });
  // Cup points: FedEx/PGA-style season race. Lower avg = higher points.
  // Roughly 500-3200 range with the top ~10 clustered high.
  const rawPts = Math.max(0, 3400 - (avg - 66) * 130 - randInt(0, 250));
  const cupPoints = Math.max(0, Math.round(rawPts));
  return {
    id, first, last, gender,
    school: school.name,
    schoolId: school.id,
    state: school.state,
    year: pick(YEARS),
    hcp, rounds, avg, vsPar, best, form, cupPoints,
    firPct: Math.round((62 - hcp * 1.2 + rand(-8, 8))),
    girPct: Math.round((52 - hcp * 1.3 + rand(-8, 8))),
    putts: Math.round((30 + hcp * 0.15 + rand(-2, 3)) * 10) / 10,
  };
}

const PLAYERS = [];
let idCounter = 1;
for (const school of SCHOOLS) {
  for (let i = 0; i < school.roster; i++) {
    PLAYERS.push(makePlayer(idCounter++, school));
  }
}

// ── Team standings
const TEAMS = SCHOOLS.map(s => {
  const roster = PLAYERS.filter(p => p.schoolId === s.id);
  const avg = roster.reduce((sum, p) => sum + p.avg, 0) / roster.length;
  const matches = 7;
  const winRateBase = Math.max(0.05, Math.min(0.90, 0.55 - s.bias * 0.13));
  let w = 0, l = 0, t = 0;
  for (let i = 0; i < matches; i++) {
    const r = rng();
    if (r < winRateBase) w++;
    else if (r < winRateBase + 0.08) t++;
    else l++;
  }
  const points = w * 3 + t * 1;
  const trend = Array.from({length: 3}, () => {
    const r = rng();
    if (r < winRateBase) return 'w';
    if (r < winRateBase + 0.10) return 't';
    return 'l';
  });
  return {
    id: s.id, name: s.name, state: s.state, region: s.region,
    players: roster.length,
    matches, w, l, t, points,
    avg: Math.round(avg * 10) / 10,
    trend, coach: s.coach,
  };
}).sort((a, b) => b.points - a.points || a.avg - b.avg);

// ── Hypothetical tournament: "Bad Birdie High Regional Championship"
// 54-hole stroke play across 3 days. Best 4 of 5 team score counts per round.
// Currently in Round 2 (36 holes complete).
function makeTournamentField() {
  return PLAYERS.map(p => {
    // R1 + R2 played, R3 upcoming
    const r1 = Math.round((72 + p.hcp * 0.5 + rand(-3, 5)));
    const r2 = Math.round((72 + p.hcp * 0.5 + rand(-3, 5)));
    const thruR2 = Math.random() > 0.15 ? 18 : randInt(7, 17); // ~85% finished R2, rest in-progress
    const r2Adj = thruR2 === 18 ? r2 : Math.round((72 + p.hcp * 0.5 + rand(-2, 4)) * thruR2 / 18);
    const total = r1 + r2Adj;
    const par = 72 * 2;
    const vsPar = total - par;
    return {
      ...p,
      tR1: r1,
      tR2: thruR2 === 18 ? r2Adj : null,
      tR2Thru: thruR2,
      tTotal: total,
      tVsPar: vsPar,
      tStatus: thruR2 === 18 ? 'F' : `Thru ${thruR2}`,
    };
  }).sort((a, b) => a.tVsPar - b.tVsPar);
}
const TOURNEY = makeTournamentField();

// Team tournament scoring: best 4 of 5 gross totals per school
function makeTeamTournament() {
  const teamRows = SCHOOLS.map(s => {
    const roster = TOURNEY.filter(p => p.schoolId === s.id)
      .sort((a, b) => a.tTotal - b.tTotal)
      .slice(0, 5); // top 5 posters
    const counting = roster.slice(0, 4);
    const total = counting.reduce((sum, p) => sum + p.tTotal, 0);
    const par = 72 * 2 * 4;
    return {
      id: s.id, name: s.name, state: s.state,
      players: TOURNEY.filter(p => p.schoolId === s.id).length,
      counting: counting.length,
      total,
      vsPar: total - par,
    };
  }).sort((a, b) => a.vsPar - b.vsPar);
  return teamRows;
}
const TOURNEY_TEAMS = makeTeamTournament();

// ── Season timeline for team-standings tab (Ponte Vedra as example)
const SEASON_TIMELINE = [
  { week: 1, opp: 'Constitution', result: 'W', score: '405-431', pts: 3 },
  { week: 2, opp: 'Hargrave',     result: 'L', score: '412-402', pts: 0 },
  { week: 3, opp: 'Guthrie',      result: 'W', score: '398-445', pts: 3 },
  { week: 4, opp: 'St. Patrick',  result: 'W', score: '401-419', pts: 3 },
  { week: 5, opp: 'North Bend',   result: 'W', score: '389-408', pts: 3 },
  { week: 6, opp: 'Marietta',     result: 'W', score: '395-401', pts: 3 },
  { week: 7, opp: 'Skyline',      result: 'W', score: '392-416', pts: 3 },
  { week: 8, opp: 'Corona del Sol', result: '·', score: 'Fri 8/15', pts: null },
];

// ── Sample social captions Bad Birdie could post (Alex's territory)
const SAMPLE_CAPTIONS = [
  {
    kind: 'weekly-recap',
    text: '"WEEK 7 IS IN THE BOOKS. Corona del Sol keeps the crown. Ponte Vedra with the biggest jump. Full standings 👇 [link] #BadBirdieHigh"',
  },
  {
    kind: 'player-spotlight',
    text: '"@ellie.torres (Ponte Vedra) just posted a 68 for the Cup lead. First-year varsity. Never lay up. #BadBirdieHigh"',
  },
  {
    kind: 'match-preview',
    text: '"FRIDAY LIGHTS ⛳ Ponte Vedra @ Corona del Sol. #1 vs #2 in the East. Live scoring 3:30 PM ET. Powered by @bagpipegolf. #BadBirdieHigh"',
  },
];

// ── Renderers ──────────────────────────────────────────────────────────

const rankMedal = (rank) => {
  if (rank === 1) return '<span class="rank-medal rank-medal--1">1</span>';
  if (rank === 2) return '<span class="rank-medal rank-medal--2">2</span>';
  if (rank === 3) return '<span class="rank-medal rank-medal--3">3</span>';
  return `<span class="cell cell--rank">${rank}</span>`;
};

const formDots = (form) => {
  return `<div class="form-dots">${form.map(f => `<span class="form-dot form-dot--${f}"></span>`).join('')}</div>`;
};

// Individual: sortable by column, filterable by gender/year
let currentIndFilter = 'all';
function renderIndividual() {
  let sorted = [...PLAYERS];
  if (currentIndFilter === 'boys') sorted = sorted.filter(p => p.gender === 'B');
  if (currentIndFilter === 'girls') sorted = sorted.filter(p => p.gender === 'G');
  if (currentIndFilter === 'seniors') sorted = sorted.filter(p => p.year === 'Sr');
  sorted.sort((a, b) => a.avg - b.avg);

  const rows = sorted.map((p, i) => {
    const rank = i + 1;
    const vsParStr = p.vsPar > 0 ? `+${p.vsPar}` : (p.vsPar < 0 ? `${p.vsPar}` : 'E');
    const vsParClass = p.vsPar < 0 ? 'cell--num-good' : (p.vsPar > 4 ? 'cell--num-bad' : '');
    return `
      <div class="row" title="Click for player profile (coming soon)">
        <div class="cell cell--rank ${rank <= 3 ? 'cell--rank-top' : ''}">${rank <= 3 ? rankMedal(rank) : rank}</div>
        <div class="cell cell--player">${p.first} ${p.last} <span class="gender-tag gender-tag--${p.gender.toLowerCase()}">${p.gender}</span></div>
        <div class="cell cell--school">${p.school} <span style="color:var(--bb-muted);font-size:12px;">· ${p.state}</span></div>
        <div class="cell cell--num">${p.hcp.toFixed(1)}</div>
        <div class="cell cell--num">${p.rounds}</div>
        <div class="cell cell--num cell--num-strong">${p.avg.toFixed(1)}</div>
        <div class="cell cell--num ${vsParClass}">${vsParStr}</div>
        <div class="cell cell--num">${p.best}</div>
        <div class="cell cell--num cell--num-cup">${p.cupPoints.toLocaleString()}</div>
        <div class="cell cell--form">${formDots(p.form)}</div>
      </div>
    `;
  }).join('');
  const rowsEl = document.getElementById('individual-rows');
  if (rowsEl) rowsEl.innerHTML = rows;
  const countEl = document.getElementById('individual-count');
  if (countEl) countEl.textContent = `${sorted.length} players`;
}

// Teams
let currentTeamFilter = 'overall';
function renderTeams() {
  let filtered = [...TEAMS];
  if (currentTeamFilter !== 'overall') {
    filtered = filtered.filter(t => t.region.toLowerCase() === currentTeamFilter);
  }
  const rows = filtered.map((t, i) => {
    const rank = i + 1;
    return `
      <div class="row" title="Click for team detail (coming soon)">
        <div class="cell cell--rank ${rank <= 3 ? 'cell--rank-top' : ''}">${rank <= 3 ? rankMedal(rank) : rank}</div>
        <div class="cell cell--player">${t.name} High</div>
        <div class="cell cell--school">${t.state} · ${t.region}</div>
        <div class="cell cell--num">${t.players}</div>
        <div class="cell cell--num">${t.matches}</div>
        <div class="cell cell--num cell--num-strong">${t.w}-${t.l}-${t.t}</div>
        <div class="cell cell--num cell--num-strong">${t.points}</div>
        <div class="cell cell--num">${t.avg.toFixed(1)}</div>
        <div class="cell cell--form">${formDots(t.trend)}</div>
      </div>
    `;
  }).join('');
  const rowsEl = document.getElementById('teams-rows');
  if (rowsEl) rowsEl.innerHTML = rows;
  const countEl = document.getElementById('teams-count');
  if (countEl) countEl.textContent = `${filtered.length} school${filtered.length === 1 ? '' : 's'}`;
}

// Tournament view
function renderTournament() {
  const rows = TOURNEY.slice(0, 60).map((p, i) => {
    const rank = i + 1;
    const vsParStr = p.tVsPar > 0 ? `+${p.tVsPar}` : (p.tVsPar < 0 ? `${p.tVsPar}` : 'E');
    const vsParClass = p.tVsPar < 0 ? 'cell--num-good' : (p.tVsPar > 8 ? 'cell--num-bad' : '');
    return `
      <div class="row">
        <div class="cell cell--rank ${rank <= 3 ? 'cell--rank-top' : ''}">${rank <= 3 ? rankMedal(rank) : rank}</div>
        <div class="cell cell--player">${p.first} ${p.last} <span class="gender-tag gender-tag--${p.gender.toLowerCase()}">${p.gender}</span></div>
        <div class="cell cell--school">${p.school} <span style="color:var(--bb-muted);font-size:12px;">· ${p.state}</span></div>
        <div class="cell cell--num cell--num-strong">${p.tR1}</div>
        <div class="cell cell--num cell--num-strong">${p.tR2 !== null ? p.tR2 : '—'}</div>
        <div class="cell cell--num">${p.tR2 !== null ? 'F' : p.tStatus}</div>
        <div class="cell cell--num cell--num-strong">${p.tTotal}</div>
        <div class="cell cell--num ${vsParClass}">${vsParStr}</div>
      </div>
    `;
  }).join('');
  const trEl = document.getElementById('tournament-rows');
  if (trEl) trEl.innerHTML = rows;

  // Team-scoring alongside
  const teamRows = TOURNEY_TEAMS.map((t, i) => {
    const rank = i + 1;
    const vsParStr = t.vsPar > 0 ? `+${t.vsPar}` : (t.vsPar < 0 ? `${t.vsPar}` : 'E');
    const vsParClass = t.vsPar < 0 ? 'cell--num-good' : (t.vsPar > 20 ? 'cell--num-bad' : '');
    return `
      <div class="row row--team-tourney">
        <div class="cell cell--rank ${rank <= 3 ? 'cell--rank-top' : ''}">${rank <= 3 ? rankMedal(rank) : rank}</div>
        <div class="cell cell--player">${t.name}</div>
        <div class="cell cell--num">${t.counting}/4</div>
        <div class="cell cell--num cell--num-strong">${t.total}</div>
        <div class="cell cell--num ${vsParClass}">${vsParStr}</div>
      </div>
    `;
  }).join('');
  const ttEl = document.getElementById('tourney-teams-rows');
  if (ttEl) ttEl.innerHTML = teamRows;
}

function renderRoster() {
  const roster = PLAYERS
    .filter(p => p.schoolId === 'ponte-vedra')
    .sort((a, b) => a.avg - b.avg);
  const rows = roster.map((p, i) => {
    const rank = i + 1;
    return `
      <div class="row">
        <div class="cell cell--rank ${rank <= 3 ? 'cell--rank-top' : ''}">${rank}</div>
        <div class="cell cell--player">${p.first} ${p.last}</div>
        <div class="cell cell--num" style="text-align:center;">${p.year}</div>
        <div class="cell cell--num">${p.hcp.toFixed(1)}</div>
        <div class="cell cell--num">${p.rounds}</div>
        <div class="cell cell--num cell--num-strong">${p.avg.toFixed(1)}</div>
        <div class="cell cell--num">${p.best}</div>
        <div class="cell cell--num">${p.firPct}%</div>
        <div class="cell cell--num">${p.girPct}%</div>
        <div class="cell cell--num">${p.putts.toFixed(1)}</div>
        <div class="cell cell--form">${formDots(p.form)}</div>
      </div>
    `;
  }).join('');
  document.getElementById('roster-rows').innerHTML = rows;
}

// Season timeline
function renderTimeline() {
  const cells = SEASON_TIMELINE.map(w => {
    const cls = w.result === 'W' ? 'timeline__cell--w'
              : w.result === 'L' ? 'timeline__cell--l'
              : 'timeline__cell--pending';
    return `
      <div class="timeline__cell ${cls}">
        <div class="timeline__week">W${w.week}</div>
        <div class="timeline__opp">${w.opp}</div>
        <div class="timeline__result">${w.result}</div>
        <div class="timeline__score">${w.score}</div>
      </div>
    `;
  }).join('');
  document.getElementById('season-timeline').innerHTML = cells;
}

// Sample captions
function renderCaptions() {
  const html = SAMPLE_CAPTIONS.map(c => `
    <div class="caption">
      <div class="caption__label">${c.kind.toUpperCase().replace('-', ' ')}</div>
      <div class="caption__text">${c.text}</div>
    </div>
  `).join('');
  const el = document.getElementById('captions');
  if (el) el.innerHTML = html;
}

// ── Tab + filter interactions ─────────────────────────────────────────
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
  // Individual filters
  document.querySelectorAll('#view-individual .filter').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#view-individual .filter').forEach(b => b.classList.toggle('filter--active', b === btn));
      currentIndFilter = btn.dataset.filter || 'all';
      renderIndividual();
    });
  });
  // Team filters
  document.querySelectorAll('#view-teams .filter').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#view-teams .filter').forEach(b => b.classList.toggle('filter--active', b === btn));
      currentTeamFilter = btn.dataset.filter || 'overall';
      renderTeams();
    });
  });
}

// ── Boot ──────────────────────────────────────────────────────────────
// Each render wrapped in a safe() call — a missing DOM element (e.g.
// from a stale browser cache) shouldn't kill the whole boot sequence.
function safe(fn, name) {
  try { fn(); } catch (e) { console.warn(`[boot] ${name} skipped:`, e.message); }
}
safe(renderIndividual, 'individual');
safe(renderTeams,      'teams');
safe(renderTournament, 'tournament');
safe(renderRoster,     'roster');
safe(renderTimeline,   'timeline');
safe(renderCaptions,   'captions');
safe(initTabs,         'tabs');
safe(initFilters,      'filters');
