// Builds public/data/world.json from the raw NHL snapshot in data/raw/.
// Ratings are derived from 3 seasons of real stats; see docs/PLAN.md §4.
import fs from 'node:fs';
import path from 'node:path';
import { CONTRACTS } from './contracts-overrides.mjs';

const RAW = path.resolve('data/raw');
const OUT = path.resolve('public/data/world.json');
const SEASONS = [20232024, 20242025, 20252026];
const SEASON_W = { 20232024: 0.2, 20242025: 0.3, 20252026: 0.5 };
const CAP = 104_000_000;
const MIN_SALARY = 850_000;
const MAX_SALARY = 20_800_000;
const SNAPSHOT = '2026-10-03';
const REF_DATE = new Date('2026-10-01');

const read = (p) => JSON.parse(fs.readFileSync(path.join(RAW, p), 'utf8'));
const readOpt = (p) => (fs.existsSync(path.join(RAW, p)) ? read(p) : null);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const round = (x) => Math.round(x);

// Deterministic per-player noise so rebuilds are stable.
function hashRand(seed) {
  let h = 2166136261 ^ seed;
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

const ageOn = (birth, d = REF_DATE) => {
  const b = new Date(birth);
  let a = d.getFullYear() - b.getFullYear();
  if (d.getMonth() < b.getMonth() || (d.getMonth() === b.getMonth() && d.getDate() < b.getDate())) a--;
  return a;
};

// ---------- Teams ----------
const TEAM_STYLE = {
  ANA: ['#F47A38', '#B9975B', '#F47A38'], BOS: ['#FFB81C', '#111111', '#FFB81C'],
  BUF: ['#003087', '#FFB81C', '#FFB81C'], CAR: ['#CE1126', '#111111', '#E8293A'],
  CBJ: ['#002654', '#CE1126', '#E03A3E'], CGY: ['#C8102E', '#F1BE48', '#E4002B'],
  CHI: ['#CF0A2C', '#111111', '#E31837'], COL: ['#6F263D', '#236192', '#5BA4E6'],
  DAL: ['#006847', '#8F8F8C', '#22B573'], DET: ['#CE1126', '#FFFFFF', '#E41B23'],
  EDM: ['#041E42', '#FF4C00', '#FF6A13'], FLA: ['#C8102E', '#041E42', '#E4002B'],
  LAK: ['#111111', '#A2AAAD', '#C7CCD1'], MIN: ['#154734', '#A6192E', '#3AAA6F'],
  MTL: ['#AF1E2D', '#192168', '#E03A3E'], NJD: ['#CE1126', '#111111', '#E41B23'],
  NSH: ['#FFB81C', '#041E42', '#FFB81C'], NYI: ['#00539B', '#F47D30', '#F47D30'],
  NYR: ['#0038A8', '#CE1126', '#3B6FE0'], OTT: ['#C52032', '#C2912C', '#E31837'],
  PHI: ['#F74902', '#111111', '#F74902'], PIT: ['#FCB514', '#111111', '#FCB514'],
  SEA: ['#001628', '#99D9D9', '#99D9D9'], SJS: ['#006D75', '#EA7200', '#00A3AD'],
  STL: ['#002F87', '#FCB514', '#2F6BFF'], TBL: ['#002868', '#FFFFFF', '#3D7EFF'],
  TOR: ['#00205B', '#FFFFFF', '#3F7CFF'], UTA: ['#6CACE4', '#010101', '#6CACE4'],
  VAN: ['#00205B', '#00843D', '#4A90FF'], VGK: ['#B4975A', '#333F42', '#B4975A'],
  WPG: ['#041E42', '#AC162C', '#5C9BE6'], WSH: ['#C8102E', '#041E42', '#E4002B'],
};
const NO_STATE_TAX = new Set(['FLA', 'TBL', 'DAL', 'VGK', 'NSH', 'SEA']);
const CANADA = new Set(['CGY', 'EDM', 'MTL', 'OTT', 'TOR', 'VAN', 'WPG']);
const BIG_MARKET = new Set(['TOR', 'MTL', 'NYR', 'BOS', 'PHI', 'CHI', 'EDM', 'VAN', 'DET']);
const RIVALS = [
  ['BOS', 'MTL'], ['TOR', 'MTL'], ['TOR', 'BOS'], ['TOR', 'OTT'], ['EDM', 'CGY'], ['NYR', 'NYI'],
  ['NYR', 'NJD'], ['PHI', 'PIT'], ['PIT', 'WSH'], ['CHI', 'STL'], ['CHI', 'DET'], ['COL', 'DET'],
  ['LAK', 'ANA'], ['LAK', 'SJS'], ['FLA', 'TBL'], ['VAN', 'SEA'], ['DAL', 'STL'], ['MIN', 'WPG'],
  ['CAR', 'WSH'], ['VGK', 'LAK'], ['NYR', 'PHI'], ['EDM', 'VAN'], ['MTL', 'OTT'], ['COL', 'DAL'],
];

const standNow = read('standings-now.json').standings;
const standLast = readOpt('standings-2025-26.json')?.standings ?? [];
const lastByTeam = Object.fromEntries(standLast.map((t) => [t.teamAbbrev.default, t]));
const teams = standNow
  .map((t) => {
    const id = t.teamAbbrev.default;
    const l = lastByTeam[id];
    const [primary, secondary, accent] = TEAM_STYLE[id];
    return {
      id,
      name: t.teamName.default,
      city: t.placeName.default,
      short: t.teamCommonName.default,
      conf: t.conferenceAbbrev,
      div: t.divisionAbbrev,
      primary, secondary, accent,
      taxFree: NO_STATE_TAX.has(id),
      canada: CANADA.has(id),
      bigMarket: BIG_MARKET.has(id),
      last: l ? { w: l.wins, l: l.losses, otl: l.otLosses, pts: l.points, gf: l.goalFor, ga: l.goalAgainst } : null,
    };
  })
  .sort((a, b) => a.id.localeCompare(b.id));
const teamIndex = Object.fromEntries(teams.map((t, i) => [t.id, i]));

// ---------- Schedule (real 2026-27) ----------
const games = new Map();
for (const t of teams) {
  for (const g of read(`schedules/${t.id}.json`).games) {
    if (g.gameType === 2) games.set(g.id, g);
  }
}
const sortedGames = [...games.values()].sort((a, b) => a.gameDate.localeCompare(b.gameDate) || a.id - b.id);
const seasonStart = sortedGames[0].gameDate;
const dayOf = (d) => Math.round((new Date(d) - new Date(seasonStart)) / 86400000);
const schedule = sortedGames.map((g) => [dayOf(g.gameDate), teamIndex[g.homeTeam.abbrev], teamIndex[g.awayTeam.abbrev]]);

// ---------- Stats tables ----------
function byPlayer(kind, report) {
  const out = {};
  for (const s of SEASONS) {
    const r = readOpt(`stats/${kind}-${report}-${s}.json`);
    if (!r) continue;
    for (const row of r.data) {
      // Players traded mid-season appear once with combined teams.
      (out[row.playerId] ??= {})[s] = row;
    }
  }
  return out;
}
const SK = {
  summary: byPlayer('skater', 'summary'),
  realtime: byPlayer('skater', 'realtime'),
  toi: byPlayer('skater', 'timeonice'),
  pct: byPlayer('skater', 'percentages'),
  gfa: byPlayer('skater', 'goalsForAgainst'),
};
const GO = { summary: byPlayer('goalie', 'summary'), advanced: byPlayer('goalie', 'advanced') };

// ---------- People ----------
const rosterIds = new Map(); // id -> team
const prospectIds = new Map();
const rosterEntry = {};
for (const t of teams) {
  for (const [file, map] of [['rosters', rosterIds], ['prospects', prospectIds]]) {
    const r = read(`${file}/${t.id}.json`);
    for (const k of ['forwards', 'defensemen', 'goalies']) {
      for (const p of r[k] || []) {
        map.set(p.id, t.id);
        if (file === 'rosters') rosterEntry[p.id] = p;
      }
    }
  }
}
const landing = {};
for (const f of fs.readdirSync(path.join(RAW, 'players'))) {
  const d = read(`players/${f}`);
  landing[d.playerId] = d;
}
const edge = {};
if (fs.existsSync(path.join(RAW, 'edge'))) {
  for (const f of fs.readdirSync(path.join(RAW, 'edge'))) {
    const d = read(`edge/${f}`);
    if (d?.player?.id) edge[d.player.id] = d;
  }
}

const TOURNAMENTS = new Set(['WJC-20', 'WJC-18', 'OG', 'Spengler Cup', 'Champions HL', 'WC', 'WCup', '4 Nations', 'U18', 'WJAC-19', 'Hlinka Gretzky', 'IIHF', 'NHL-4N', 'EHT', 'Olympics']);
const NHLE = {
  NHL: 1, KHL: 0.77, SHL: 0.57, NL: 0.46, Liiga: 0.44, AHL: 0.39, Czechia: 0.4, DEL: 0.37, 'Czech': 0.4,
  HockeyAllsvenskan: 0.25, VHL: 0.27, Slovakia: 0.25, ICEHL: 0.22, NCAA: 0.2, OHL: 0.14, WHL: 0.14,
  QMJHL: 0.11, USHL: 0.12, ECHL: 0.13, MHL: 0.1, Mestis: 0.15, 'U20 Nationell': 0.08, 'J20 Nationell': 0.08,
  'U20 SM-sarja': 0.08, 'U20 SM-liiga': 0.08, BCHL: 0.06, HockeyEttan: 0.08, 'USNTDP': 0.12, 'NTDP': 0.12,
};
const statusFromLeague = (lg) => {
  if (!lg) return 'FA';
  if (['NHL', 'AHL', 'ECHL'].includes(lg)) return 'AHL';
  if (['OHL', 'WHL', 'QMJHL', 'USHL', 'BCHL', 'USNTDP', 'NTDP', 'MHL', 'U20 Nationell', 'J20 Nationell', 'U20 SM-sarja', 'U20 SM-liiga'].includes(lg)) return 'JR';
  if (lg === 'NCAA') return 'NCAA';
  return 'EUR';
};

function clubSeasons(d) {
  return (d.seasonTotals || []).filter((s) => s.gameTypeId === 2 && !TOURNAMENTS.has(s.leagueAbbrev) && !/^(WC|WJC|U18|U17|OG|Olympics)\b/.test(s.leagueAbbrev));
}

// ---------- Skater metrics ----------
function skaterMetrics(id) {
  const sum = SK.summary[id];
  if (!sum) return null;
  let wsum = 0, gp = 0;
  const acc = { toi: 0, p60: 0, g60: 0, a60: 0, ppToi: 0, shToi: 0, hits60: 0, blk60: 0, tk60: 0, gv60: 0, pim60: 0, satRel: 0, gfPct: 0, fo: 0, foW: 0, shp: 0, shpW: 0 };
  const games = [];
  for (const s of SEASONS) {
    const r = sum[s];
    if (!r || !r.gamesPlayed) continue;
    const w = SEASON_W[s] * Math.min(1, r.gamesPlayed / 82) ** 0.5 * r.gamesPlayed;
    const toiMin = (r.timeOnIcePerGame || 0) / 60;
    const tot = Math.max(1, toiMin * r.gamesPlayed);
    const rt = SK.realtime[id]?.[s];
    const ti = SK.toi[id]?.[s];
    const pc = SK.pct[id]?.[s];
    acc.toi += w * toiMin;
    acc.p60 += (w * r.points * 60) / tot;
    acc.g60 += (w * r.goals * 60) / tot;
    acc.a60 += (w * r.assists * 60) / tot;
    acc.ppToi += (w * (ti?.ppTimeOnIcePerGame || 0)) / 60;
    acc.shToi += (w * (ti?.shTimeOnIcePerGame || 0)) / 60;
    acc.hits60 += (w * ((rt?.hits || 0) * 60)) / tot;
    acc.blk60 += (w * ((rt?.blockedShots || 0) * 60)) / tot;
    acc.tk60 += (w * ((rt?.takeaways || 0) * 60)) / tot;
    acc.gv60 += (w * ((rt?.giveaways || 0) * 60)) / tot;
    acc.pim60 += (w * (r.penaltyMinutes * 60)) / tot;
    acc.satRel += w * (pc?.satRelative ?? 0);
    const gf = SK.gfa[id]?.[s];
    acc.gfPct += w * (gf && gf.evenStrengthGoalsFor + gf.evenStrengthGoalsAgainst > 0 ? gf.evenStrengthGoalsForPct ?? 0.5 : 0.5);
    if (r.faceoffWinPct != null) { acc.fo += w * r.faceoffWinPct; acc.foW += w; }
    if (r.shots > 0) { acc.shp += SEASON_W[s] * r.goals; acc.shpW += SEASON_W[s] * r.shots; }
    wsum += w;
    gp += r.gamesPlayed;
    games.push(r.gamesPlayed);
  }
  if (!wsum) return null;
  const m = {};
  for (const k of ['toi', 'p60', 'g60', 'a60', 'ppToi', 'shToi', 'hits60', 'blk60', 'tk60', 'gv60', 'pim60', 'satRel', 'gfPct']) m[k] = acc[k] / wsum;
  m.fo = acc.foW ? acc.fo / acc.foW : null;
  m.shPct = acc.shpW ? (acc.shp + 0.1 * 60) / (acc.shpW + 60) : 0.1;
  m.gp = gp;
  m.avail = games.length ? games.reduce((a, b) => a + b, 0) / (games.length * 82) : 0.5;
  m.effGp = SEASONS.reduce((a, s) => a + (sum[s]?.gamesPlayed || 0) * SEASON_W[s], 0) / 0.5; // in "last-season" units
  return m;
}

function goalieMetrics(id) {
  const sum = GO.summary[id];
  if (!sum) return null;
  let saves = 0, shots = 0, gp = 0, gsW = 0, wsum = 0, qs = 0, qsW = 0;
  for (const s of SEASONS) {
    const r = sum[s];
    if (!r || !r.gamesPlayed) continue;
    const w = SEASON_W[s];
    saves += w * r.saves;
    shots += w * r.shotsAgainst;
    gp += r.gamesPlayed;
    gsW += w * (r.gamesStarted || 0);
    wsum += w;
    const adv = GO.advanced[id]?.[s];
    if (adv?.qualityStartsPct != null && adv.gamesStarted) { qs += w * adv.gamesStarted * adv.qualityStartsPct; qsW += w * adv.gamesStarted; }
  }
  if (!shots) return null;
  const K = 1800;
  return {
    sv: (saves + K * 0.893) / (shots + K),
    starts: gsW / wsum, // weighted starts per season
    gp,
    qs: qsW ? qs / qsW : 0.5,
  };
}

// ---------- Population stats ----------
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const sd = (a) => { const m = mean(a); return Math.sqrt(mean(a.map((x) => (x - m) ** 2))) || 1; };
const zf = (arr) => { const m = mean(arr), s = sd(arr); return (x) => (x - m) / s; };

const skMetrics = {};
for (const id of Object.keys(SK.summary)) {
  const m = skaterMetrics(id);
  if (m) skMetrics[id] = m;
}
const posOf = (id) => {
  const any = Object.values(SK.summary[id] || {})[0];
  return any?.positionCode;
};
const groups = { F: [], D: [] };
for (const [id, m] of Object.entries(skMetrics)) {
  const p = posOf(id);
  if (!p) continue;
  if (m.effGp < 8) continue; // population reference uses real samples only
  (p === 'D' ? groups.D : groups.F).push(m);
}
const Z = {};
for (const g of ['F', 'D']) {
  const arr = groups[g];
  Z[g] = {};
  for (const k of ['toi', 'p60', 'g60', 'a60', 'ppToi', 'shToi', 'hits60', 'blk60', 'tk60', 'gv60', 'pim60', 'satRel', 'gfPct']) Z[g][k] = zf(arr.map((m) => m[k]));
  Z[g].shPct = zf(arr.map((m) => m.shPct));
}
const foZ = zf(groups.F.filter((m) => m.fo != null).map((m) => m.fo));

function impact(m, g) {
  const z = Z[g];
  let v;
  const c = (x) => clamp(x, -3, 3);
  if (g === 'F') v = 0.36 * c(z.toi(m.toi)) + 0.36 * c(z.p60(m.p60)) + 0.07 * c(z.ppToi(m.ppToi)) + 0.05 * c(z.shToi(m.shToi)) + 0.06 * c(z.satRel(m.satRel)) + 0.1 * c(z.gfPct(m.gfPct));
  else v = 0.42 * c(z.toi(m.toi)) + 0.18 * c(z.p60(m.p60)) + 0.08 * c(z.shToi(m.shToi)) + 0.06 * c(z.ppToi(m.ppToi)) + 0.12 * c(z.satRel(m.satRel)) + 0.14 * c(z.gfPct(m.gfPct));
  const k = 22; // games of regression toward replacement level
  return (m.effGp * v + k * -1.25) / (m.effGp + k);
}

// Percentile → OVR curve for real NHL populations.
const OVR_CURVE = [[0, 97], [0.006, 93], [0.016, 90], [0.05, 86], [0.12, 82], [0.25, 78], [0.42, 74], [0.6, 70], [0.8, 66], [1, 58]];
const curve = (pts, x) => {
  for (let i = 1; i < pts.length; i++) {
    if (x <= pts[i][0]) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
      return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
    }
  }
  return pts[pts.length - 1][1];
};
function rankMap(entries, curvePts) {
  const sorted = [...entries].sort((a, b) => b.v - a.v);
  const out = {};
  sorted.forEach((e, i) => { out[e.id] = curve(curvePts, i / Math.max(1, sorted.length - 1)); });
  return out;
}

const skImpact = { F: [], D: [] };
for (const [id, m] of Object.entries(skMetrics)) {
  const p = posOf(id);
  const g = p === 'D' ? 'D' : 'F';
  skImpact[g].push({ id, v: impact(m, g) });
}
const skOvr = { ...rankMap(skImpact.F, OVR_CURVE), ...rankMap(skImpact.D, OVR_CURVE) };

const goMetrics = {};
for (const id of Object.keys(GO.summary)) {
  const m = goalieMetrics(id);
  if (m) goMetrics[id] = m;
}
const gArr = Object.values(goMetrics);
const svZ = zf(gArr.map((m) => m.sv));
const stZ = zf(gArr.map((m) => m.starts));
const G_CURVE = [[0, 93], [0.03, 90], [0.12, 86], [0.3, 82], [0.5, 78], [0.75, 73], [1, 64]];
const goOvr = rankMap(
  Object.entries(goMetrics).map(([id, m]) => ({ id, v: 0.62 * svZ(m.sv) + 0.38 * stZ(m.starts) - (m.gp < 20 ? 0.6 : 0) })),
  G_CURVE,
);

// ---------- Build players ----------
const players = [];
const used = new Set();
const allIds = new Set([...rosterIds.keys(), ...prospectIds.keys(), ...Object.keys(landing).map(Number)]);

function prospectOvr(d, pos) {
  const seasons = clubSeasons(d).filter((s) => s.season >= 20242025);
  if (!seasons.length) return { ovr: 52, league: null };
  // best recent sample by games
  const latest = seasons[seasons.length - 1];
  const sample = seasons.filter((s) => s.season >= latest.season - 10001 && (s.gamesPlayed || 0) >= 8);
  let nhle = 0, w = 0;
  for (const s of sample) {
    const f = NHLE[s.leagueAbbrev] ?? 0.1;
    const ppg = (s.points || 0) / Math.max(1, s.gamesPlayed);
    const ww = (s.season === latest.season ? 0.65 : 0.35) * Math.min(1, s.gamesPlayed / 40);
    nhle += ww * ppg * f * 82;
    w += ww;
  }
  nhle = w ? nhle / w : 0;
  if (pos === 'D') nhle *= 1.7;
  const lgW = NHLE[latest.leagueAbbrev] ?? 0.1;
  let ovr;
  if (pos === 'G') {
    const sv = latest.savePctg ?? 0.9;
    ovr = 55 + clamp(lgW * 25, 0, 14) + clamp((sv - 0.905) * 220, -6, 6);
  } else {
    ovr = 51 + 9 * Math.log(1 + nhle / 6) + clamp(lgW * 6, 0, 4);
  }
  return { ovr: clamp(ovr, 45, 76), league: latest.leagueAbbrev };
}

const W_POS = {
  C: { sk: 0.15, sh: 0.15, pa: 0.17, ha: 0.14, oi: 0.17, di: 0.12, ph: 0.05, fo: 0.05 },
  W: { sk: 0.16, sh: 0.19, pa: 0.14, ha: 0.15, oi: 0.18, di: 0.1, ph: 0.08, fo: 0 },
  D: { sk: 0.15, sh: 0.07, pa: 0.14, ha: 0.09, oi: 0.12, di: 0.3, ph: 0.13, fo: 0 },
};
const ATTR = ['sk', 'sh', 'pa', 'ha', 'oi', 'di', 'ph', 'fo', 'dc', 'du'];

function calcOvrFrom(pos, a) {
  if (pos === 'G') return Math.round(0.3 * a.po + 0.3 * a.rf + 0.15 * a.rb + 0.05 * a.pk + 0.12 * a.cs + 0.08 * a.mn);
  const w = W_POS[pos === 'C' ? 'C' : pos === 'D' ? 'D' : 'W'];
  let v = 0;
  for (const [k, wt] of Object.entries(w)) v += wt * a[k];
  return Math.round(v);
}

function skaterAttrs(id, pos, ovr, m, ed, rnd, weightKg, age, dev = null) {
  const g = pos === 'D' ? 'D' : 'F';
  const z = Z[g];
  const n = (s) => (rnd() - 0.5) * s;
  const d = {};
  const speedPct = ed?.skatingSpeed?.speedMax?.percentile;
  const burstPct = ed?.skatingSpeed?.burstsOver20?.percentile;
  const shotPct = ed?.topShotSpeed?.percentile;
  d.sk = speedPct != null ? ((speedPct + (burstPct ?? speedPct)) / 2 - 0.5) * 18 : (25 - age) * 0.6 + n(6);
  if (dev) {
    // Skill shape from another league's stats (KHL), already in rating points.
    Object.assign(d, dev);
  } else if (m) {
    const c = (x) => clamp(x, -2.5, 2.5);
    d.sh = c(z.g60(m.g60)) * 3.2 + c(z.shPct(m.shPct)) * 1.6 + (shotPct != null ? (shotPct - 0.5) * 6 : 0);
    d.pa = c(z.a60(m.a60)) * 3.6 + c(z.ppToi(m.ppToi)) * 1.2;
    d.ha = (d.sh + d.pa) / 2 + c(-z.gv60(m.gv60)) * 0.8 + n(3);
    d.oi = c(z.p60(m.p60)) * 3.6 + c(z.ppToi(m.ppToi)) * 1.6;
    d.di = c(z.shToi(m.shToi)) * 2.6 + c(z.satRel(m.satRel)) * 1.6 + c(z.tk60(m.tk60)) * 1.0 + (g === 'D' ? c(z.blk60(m.blk60)) * 0.8 : 0) - c(z.p60(m.p60)) * 0.6;
    d.ph = c(z.hits60(m.hits60)) * 3.2 + (weightKg - 92) * 0.25;
    d.dc = -c(z.pim60(m.pim60)) * 4;
    d.du = (m.avail - 0.8) * 30;
  } else {
    for (const k of ['sh', 'pa', 'ha', 'oi', 'di']) d[k] = n(8);
    d.ph = (weightKg - 88) * 0.35 + n(6);
    d.dc = n(8);
    d.du = n(10);
  }
  if (pos === 'C') d.fo = dev?.fo ?? (m?.fo != null ? clamp(foZ(m.fo), -2.5, 2.5) * 6 + 4 : n(8));
  else d.fo = -14 + n(10);
  // Position flavour
  if (g === 'D') { d.di += 4; d.sh -= 4; d.ph += 2; }
  const attrs = {};
  for (const k of ATTR) attrs[k] = ovr + (d[k] || 0);
  // Re-center so the weighted formula equals the target OVR; softly compress the top end
  // so elite players don't saturate at 99 in every skill.
  const w = W_POS[pos === 'C' ? 'C' : g === 'D' ? 'D' : 'W'];
  const keys = Object.keys(w).filter((k) => w[k] > 0);
  for (let it = 0; it < 8; it++) {
    let calc = 0;
    for (const [k, v] of Object.entries(w)) calc += v * attrs[k];
    const shift = ovr - calc;
    for (const k of Object.keys(w)) attrs[k] += shift;
    // Shrink positive deviations if any skill would exceed 99 (keeps the player's shape).
    const maxA = Math.max(...keys.map((k) => attrs[k]));
    if (maxA > 99 && maxA > ovr) {
      const f = (99 - ovr) / (maxA - ovr);
      for (const k of keys) if (attrs[k] > ovr) attrs[k] = ovr + (attrs[k] - ovr) * f;
    }
  }
  for (const k of ATTR) attrs[k] = clamp(round(attrs[k]), 25, 99);
  attrs.dc = clamp(round(70 + (d.dc || 0) + n(8)), 30, 99);
  attrs.du = clamp(round(78 + (d.du || 0) + n(10)), 40, 99);
  return attrs;
}

function goalieAttrs(ovr, m, rnd) {
  const n = (s) => (rnd() - 0.5) * s;
  const a = {
    po: ovr + n(6), rf: ovr + n(6), rb: ovr + n(8), pk: ovr - 6 + n(16), cs: ovr + (m ? (m.qs - 0.55) * 30 : 0) + n(6), mn: ovr + n(10),
  };
  const calc = 0.3 * a.po + 0.3 * a.rf + 0.15 * a.rb + 0.05 * a.pk + 0.12 * a.cs + 0.08 * a.mn;
  const shift = ovr - calc;
  for (const k of Object.keys(a)) a[k] = clamp(round(a[k] + shift), 30, 99);
  a.du = clamp(round(80 + n(16)), 45, 99);
  return a;
}

function potential(ovr, age, draft, rnd) {
  let add;
  if (age <= 19) add = 9 + rnd() * 9;
  else if (age <= 21) add = 5 + rnd() * 8;
  else if (age <= 23) add = 1.5 + rnd() * 5;
  else if (age <= 25) add = rnd() * 3;
  else add = 0;
  if (draft && draft.round === 1 && age <= 23) add += ((33 - draft.overallPick) / 32) * 4;
  else if (draft && draft.round === 2 && age <= 22) add += 1;
  // Already-elite young players have less headroom.
  if (ovr >= 85) add *= 0.5;
  return clamp(round(ovr + add), ovr, ovr >= 90 ? 98 : 95);
}

function contractFor(p, rnd) {
  const key = `${p.fn} ${p.ln}`;
  const ov = CONTRACTS[`${key}|${p.pos}`] || CONTRACTS[key];
  if (ov) {
    used.add(CONTRACTS[`${key}|${p.pos}`] ? `${key}|${p.pos}` : key);
    const [aav, last, clause] = ov;
    return { aav: round(aav * 1e6), last, type: clause === 'ELC' ? 'ELC' : 'STD', clause: clause === 'ELC' ? null : clause, real: true };
  }
  return null;
}

const SHARE_CURVE = [[55, 0.0082], [68, 0.0082], [70, 0.0105], [72, 0.0135], [74, 0.019], [76, 0.026], [78, 0.035], [80, 0.045], [82, 0.057], [85, 0.077], [87, 0.092], [90, 0.115], [93, 0.14], [97, 0.17]];
function marketAav(ovr, age, pos) {
  let share = curve(SHARE_CURVE.map(([o, s]) => [o, s]), ovr);
  if (age >= 33) share *= 0.8;
  else if (age >= 31) share *= 0.92;
  if (pos === 'G') share *= 0.88;
  return Math.max(MIN_SALARY, Math.min(MAX_SALARY, share * CAP));
}

function estimateContract(p, rnd) {
  const age = ageOn(p.bd);
  const draftYr = p.dr?.y;
  const prog = p.st === 'NHL' || p.st === 'AHL';
  if (!prog) return null;
  const nhlGp = p.car?.gp ?? 0;
  // Entry-level deals
  if (age <= 22 && (draftYr ? draftYr >= 2022 : age <= 21) && nhlGp < 200) {
    const signed = Math.max(draftYr ? draftYr + (age >= 21 ? 1 : 2) - 1 : 2025, 2023);
    const last = clamp(signed + 2, 2026, 2028);
    const aav = p.ovr >= 80 ? 950_000 + round(rnd() * 25) * 1000 : 860_000 + round(rnd() * 90) * 1000;
    return { aav, last, type: 'ELC', clause: null, real: false };
  }
  if (p.st === 'AHL') {
    return { aav: 850_000 + round(rnd() * 30) * 10_000, last: 2026 + (rnd() < 0.4 ? 1 : 0), type: 'STD', clause: null, real: false, twoWay: true };
  }
  let aav = marketAav(p.ovr, age, p.pos);
  // Contracts were signed on past performance and market — add noise.
  aav *= 0.88 + rnd() * 0.24;
  if (age <= 24) aav *= 0.85;
  aav = clamp(round(aav / 5000) * 5000, MIN_SALARY, MAX_SALARY);
  const maxYrs = age >= 35 ? 1 : age >= 32 ? 3 : 6;
  const r = rnd();
  const yrs = clamp(1 + Math.floor(r * r * maxYrs * 1.4), 1, maxYrs);
  let clause = null;
  if (aav >= 5_500_000 && age >= 27) clause = rnd() < 0.55 ? 'NMC' : rnd() < 0.6 ? 'NTC' : null;
  return { aav, last: 2026 + yrs - 1, type: 'STD', clause, real: false };
}

function traitsFor(p, m, ed, gm) {
  const t = [];
  if (p.pos === 'G') {
    if (gm && gm.sv >= 0.906 && gm.gp >= 60) t.push('wall');
    if (p.r.mn >= 90) t.push('clutch');
    return t;
  }
  const g = p.pos === 'D' ? 'D' : 'F';
  const z = Z[g];
  if (m && m.effGp >= 30) {
    if (g === 'F' && z.g60(m.g60) > 1.5 && p.ovr >= 78) t.push('sniper');
    if (z.a60(m.a60) > 1.6 && p.ovr >= 78) t.push('playmaker');
    if (z.hits60(m.hits60) > 1.7) t.push('enforcer');
    if (g === 'D' && z.blk60(m.blk60) > 1.4) t.push('blocker');
    if (p.pos === 'C' && m.fo != null && m.fo >= 0.555) t.push('faceoff');
    if (g === 'D' && z.ppToi(m.ppToi) > 1.6 && p.ovr >= 80) t.push('quarterback');
    if (m.avail >= 0.97 && m.gp >= 200) t.push('ironman');
  }
  if (ed?.skatingSpeed?.speedMax?.percentile >= 0.93) t.push('speed');
  if (ed?.topShotSpeed?.percentile >= 0.95) t.push('cannon');
  if (g === 'F' && p.r.di >= 80 && p.r.oi >= 80) t.push('twoway');
  if (ageOn(p.bd) >= 31 && p.ovr >= 84) t.push('leader');
  return t.slice(0, 4);
}

function hist(id, isG) {
  const out = [];
  const src = isG ? GO.summary[id] : SK.summary[id];
  if (!src) return out;
  for (const s of SEASONS) {
    const r = src[s];
    if (!r) continue;
    if (isG) out.push([s, r.teamAbbrevs, r.gamesPlayed, r.wins, r.losses, r.otLosses, +(r.savePct || 0).toFixed(3), +(r.goalsAgainstAverage || 0).toFixed(2), r.shutouts]);
    else out.push([s, r.teamAbbrevs, r.gamesPlayed, r.goals, r.assists, r.points, r.plusMinus, r.penaltyMinutes]);
  }
  return out;
}

// ---------- KHL: real rosters from the league's public API (scripts/fetch-khl.mjs) ----------
const KHL_TEAM = { 30: 'MMG', 26: 'LOK', 36: 'NFT', 16: 'CSK', 40: 'AKB', 44: 'SKA', 22: 'TRP', 32: 'SYU', 56: 'AVT', 46: 'BAR', 315: 'SHA', 8: 'DMS', 18: 'SPR', 10: 'AVG', 38: 'DMN', 42: 'SEV', 28: 'TRK', 12: 'AMR', 61: 'ADM', 24: 'SIB', 105: 'LAD', 113: 'SCH' };
const KHL_SEASON_W = { 20242025: 0.3, 20252026: 0.55, 20262027: 0.15 };
const KHL_CTRY = {
  Russia: 'RUS', Canada: 'CAN', Belarus: 'BLR', USA: 'USA', Kazakhstan: 'KAZ', Slovakia: 'SVK', Sweden: 'SWE', Netherlands: 'NLD',
  China: 'CHN', Norway: 'NOR', Czechia: 'CZE', 'Czech Republic': 'CZE', Finland: 'FIN', Latvia: 'LVA', Switzerland: 'CHE', Germany: 'DEU',
  Austria: 'AUT', Denmark: 'DNK', Slovenia: 'SVN', Ukraine: 'UKR', France: 'FRA', Italy: 'ITA', Uzbekistan: 'UZB', Kyrgyzstan: 'KGZ', Armenia: 'ARM',
};
// League-wide rating quantiles (0, 5 … 100 %) the KHL scoring corridors are calibrated on;
// real players fill them in the order of their real performance.
const KHL_Q = {
  F: [51, 57, 58, 59, 61, 62, 64, 66, 68, 68, 69, 70, 71, 72, 73, 73, 74, 75, 77, 79, 83],
  D: [50, 55, 57, 58, 59, 60, 61, 63, 68, 69, 70, 70, 71, 71, 72, 72, 73, 73, 74, 75, 78],
  G: [48, 53, 54, 55, 55, 57, 58, 59, 60, 62, 64, 67, 68, 69, 70, 72, 75, 77, 77, 78, 80],
};
const KHL_ID_BASE = 7_000_000; // KHL-only players: id = base + KHL id (NHL ids are 8 4xx xxx)

const khlOn = fs.existsSync(path.join(RAW, 'khl/rosters.json'));
const khlStats = {}; // season -> webcaster id -> { gp, g, a, ... }
const khlDetail = {}; // webcaster id -> latest player card
const khlRoster = []; // current rosters
if (khlOn) {
  for (const season of Object.keys(KHL_SEASON_W).map(Number)) {
    const list = readOpt(`khl/players-${season}.json`) ?? [];
    khlStats[season] = {};
    for (const p of list) {
      khlStats[season][p.id] = Object.fromEntries(p.stats.map((x) => [x.id, x.val]));
      khlDetail[p.id] = p; // later seasons overwrite: the freshest card wins
    }
  }
  for (const { player: r } of read('khl/rosters.json')) {
    const team = KHL_TEAM[r.team?.id];
    if (!team || !r.khl_id) continue;
    khlRoster.push({ ...r, ...(khlDetail[r.id] ?? {}), team });
  }
}

const RU_LAT = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya' };
const latin = (w) => [...w].map((ch) => { const l = RU_LAT[ch.toLowerCase()]; return l == null ? ch : ch === ch.toLowerCase() ? l : l.charAt(0).toUpperCase() + l.slice(1); }).join('');
/** "Da Costa Stephane" / "Abramov Mikhail B." → { fn, ln } (the KHL lists the surname first). */
function khlName(name) {
  const t = latin(name).trim().split(/\s+/).filter((x) => !/^[A-Z]\.$/.test(x));
  return t.length < 2 ? { fn: t[0] ?? '', ln: t[0] ?? '' } : { fn: t[t.length - 1], ln: t.slice(0, -1).join(' ') };
}
const unix = (t) => new Date(Math.floor((t + 43200) / 86400) * 86400000).toISOString().slice(0, 10);
const nameKey = (x) => x.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/kh/g, 'h').replace(/ts/g, 'c').replace(/[yji]+/g, 'i').replace(/x/g, 'ks').replace(/w/g, 'v').replace(/[^a-z]/g, '');
function lev(a, b) {
  const dp = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) { const t = dp[j]; dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = t; }
  }
  return dp[b.length];
}
// Match KHL players to NHL API profiles (ex-NHL players, NHL draft picks) by birth date and surname.
const byBirth = {};
for (const [id, d] of Object.entries(landing)) if (d?.birthDate) (byBirth[d.birthDate] ??= []).push(Number(id));
const khlNhl = new Map(); // NHL id -> KHL roster entry
for (const k of khlRoster) {
  k.bd = k.birthday ? unix(k.birthday) : `${2026 - (k.age ?? 26)}-07-01`;
  const { fn, ln } = khlName(k.name);
  Object.assign(k, { fn, ln });
  const lk = nameKey(ln);
  const hit = (byBirth[k.bd] ?? []).find((id) => { const o = nameKey(landing[id].lastName.default); return o === lk || lev(o, lk) <= 2; });
  if (hit != null && !rosterIds.has(hit)) { k.nhlId = hit; khlNhl.set(hit, k); }
}

for (const id of allIds) {
  const d = landing[id];
  if (!d || khlNhl.has(id)) continue; // KHL players are built from the KHL data below
  const rTeam = rosterIds.get(id);
  const pTeam = prospectIds.get(id);
  const age = ageOn(d.birthDate);
  const pos = d.position === 'L' || d.position === 'R' || d.position === 'C' || d.position === 'D' || d.position === 'G' ? d.position : 'C';
  const club = clubSeasons(d);
  const last = club[club.length - 1];
  let st, team;
  if (rTeam) { st = 'NHL'; team = rTeam; }
  else if (pTeam) { team = pTeam; st = statusFromLeague(last?.leagueAbbrev); }
  else if (d.isActive && d.currentTeamAbbrev && teamIndex[d.currentTeamAbbrev] != null) {
    // Off the active roster but under contract: injured regulars (IR/LTIR) stay NHL players.
    team = d.currentTeamAbbrev;
    const lastNhl = (SK.summary[id]?.[20252026]?.gamesPlayed ?? 0) + (GO.summary[id]?.[20252026]?.gamesPlayed ?? 0);
    st = lastNhl >= 30 ? 'NHL' : 'AHL';
  }
  else {
    // Not in any organisation: playing in another league, an unsigned free agent, or retired.
    // European, minor-league and college seasons often have no 2026-27 line yet in the NHL data.
    if (!last || last.season < 20242025 || age >= 39) continue;
    if (last.season < 20252026 && age >= 30) continue; // nothing for a season: most likely retired
    const lg = last.leagueAbbrev;
    if (lg === 'NHL' || last.season < 20252026) st = 'FA';
    else if (lg === 'NCAA') st = age <= 23 ? 'NCAA' : 'FA';
    else if (statusFromLeague(lg) === 'JR') st = age <= 20 ? 'JR' : 'FA';
    // Under contract elsewhere (Europe, AHL/ECHL deal) until next summer. KHL players are on the
    // real KHL rosters below; anyone missing from them has left the league.
    else st = lg === 'KHL' ? 'FA' : 'EUR';
    team = null;
  }
  const rnd = hashRand(id);
  const m = pos === 'G' ? null : skMetrics[id];
  const gm = pos === 'G' ? goMetrics[id] : null;
  const ed = edge[id];
  let ovr;
  const pro = prospectOvr(d, pos);
  if (pos === 'G') ovr = goOvr[id] ?? pro.ovr;
  else ovr = skOvr[id] ?? pro.ovr;
  if (pos !== 'G' && m && m.effGp < 25) ovr = Math.max(ovr, pro.ovr);
  if (pos === 'G' && gm && gm.gp < 15) ovr = Math.max(ovr, pro.ovr);
  // Age drift since the stats were recorded (one summer of development / decline).
  if (age <= 21) ovr += 2.5;
  else if (age <= 23) ovr += 1.2;
  else if (age >= 36) ovr -= 2.5;
  else if (age >= 34) ovr -= 1.2;
  ovr = clamp(round(ovr), 40, 97);

  const rEntry = rosterEntry[id];
  const p = {
    id,
    fn: d.firstName.default,
    ln: d.lastName.default,
    pos,
    sh: d.shootsCatches || 'L',
    bd: d.birthDate,
    ctry: d.birthCountry || 'CAN',
    ht: d.heightInCentimeters || 183,
    wt: d.weightInKilograms || 88,
    num: rEntry?.sweaterNumber ?? d.sweaterNumber ?? null,
    img: rEntry?.headshot || d.headshot || null,
    team,
    st,
    ovr,
  };
  p.r = pos === 'G' ? goalieAttrs(ovr, gm, rnd) : skaterAttrs(id, pos, ovr, m, ed, rnd, p.wt, age);
  p.ovr = calcOvrFrom(p.pos, p.r);
  if (d.draftDetails) p.dr = { y: d.draftDetails.year, r: d.draftDetails.round, p: d.draftDetails.overallPick, t: d.draftDetails.teamAbbrev };
  p.pot = potential(ovr, age, d.draftDetails, rnd);
  const ct = d.careerTotals?.regularSeason;
  if (ct) p.car = pos === 'G' ? { gp: ct.gamesPlayed, w: ct.wins ?? 0, so: ct.shutouts ?? 0 } : { gp: ct.gamesPlayed, g: ct.goals, a: ct.assists, p: ct.points };
  p.h = hist(id, pos === 'G');
  p.lg = pro.league;
  p.c = contractFor(p, rnd) ?? estimateContract(p, rnd);
  if (p.c && (st === 'JR' || st === 'NCAA' || st === 'EUR' || st === 'FA') && !p.c.real) p.c = null;
  if (p.c?.real && st !== 'NHL' && st !== 'AHL') p.st = 'AHL';
  // Expensive veterans off the active roster are almost always on long-term injured reserve.
  if (p.st === 'AHL' && p.c && p.c.aav >= 3_000_000 && (p.car?.gp ?? 0) >= 150) { p.st = 'NHL'; p.ltir = true; }
  p.tr = traitsFor(p, m, ed, gm);
  if (ed?.skatingSpeed?.speedMax?.metric) p.spd = +ed.skatingSpeed.speedMax.metric.toFixed(1);
  if (ed?.topShotSpeed?.metric) p.shs = +ed.topShotSpeed.metric.toFixed(1);
  players.push(p);
}

// ---------- KHL players ----------
{
  const grp = (k) => (k.role_key === 'goaltender' || k.role === 'goalie' ? 'G' : k.role_key === 'defensemen' || k.role === 'defensemen' ? 'D' : 'F');
  // Weighted per-game production over three KHL regular seasons.
  for (const k of khlRoster) {
    const g = (k.grp = grp(k));
    let w = 0, eff = 0, gp = 0;
    const a = { ppg: 0, gpg: 0, apg: 0, toi: 0, pm: 0, pim: 0, fo: 0, sv: 0, sh: 0, share: 0 };
    let spd = null;
    k.h = [];
    for (const [season, sw] of Object.entries(KHL_SEASON_W)) {
      const st = khlStats[season]?.[k.id];
      if (st?.top_speed >= 20) spd = Math.max(spd ?? 0, st.top_speed);
      if (!st?.gp) continue;
      const ww = sw * Math.min(1, st.gp / 68) ** 0.5 * st.gp;
      gp += st.gp;
      eff += (st.gp * sw) / 0.55;
      w += ww;
      if (g === 'G') {
        a.sv += sw * (st.sv ?? 0);
        a.sh += sw * ((st.sv ?? 0) + (st.ga ?? 0));
        a.share += ww * Math.min(1, st.gp / 50);
        k.h.push([Number(season), k.team, st.gp, st.w ?? 0, st.l ?? 0, 0, +(((st.sv_pct ?? 0) / 100)).toFixed(3), st.gaa ?? 0, st.so ?? 0]);
      } else {
        a.ppg += (ww * st.pts) / st.gp; a.gpg += (ww * st.g) / st.gp; a.apg += (ww * st.a) / st.gp;
        a.toi += ww * (st.toi_avg ?? 0); a.pm += (ww * (st.pm ?? 0)) / st.gp; a.pim += (ww * (st.pim ?? 0)) / st.gp; a.fo += (ww * (st.fow ?? 0)) / st.gp;
        k.h.push([Number(season), k.team, st.gp, st.g, st.a, st.pts, st.pm ?? 0, st.pim ?? 0]);
      }
    }
    if (w) for (const key of ['ppg', 'gpg', 'apg', 'toi', 'pm', 'pim', 'fo', 'share']) a[key] /= w;
    a.svp = a.sh ? a.sv / a.sh : null;
    Object.assign(k, { m: a, eff, gp, spd });
  }
  // League population (enough games) for z-scores.
  const pop = (g, f) => khlRoster.filter((k) => k.grp === g && k.eff >= 15).map(f);
  const zf = (xs) => { const mu = mean(xs), sd = Math.sqrt(mean(xs.map((x) => (x - mu) ** 2))) || 1; return (x) => (x - mu) / sd; };
  const Zk = {};
  for (const g of ['F', 'D']) for (const key of ['ppg', 'gpg', 'apg', 'toi', 'pm', 'pim', 'fo']) (Zk[g] ??= {})[key] = zf(pop(g, (k) => k.m[key]));
  const spdZ = zf(khlRoster.filter((k) => k.spd).map((k) => k.spd));
  const gSv = khlRoster.filter((k) => k.grp === 'G' && k.m.sh > 300);
  const svMu = gSv.reduce((x, k) => x + k.m.sv, 0) / gSv.reduce((x, k) => x + k.m.sh, 0);
  const svZ = zf(gSv.map((k) => k.m.svp)), shareZ = zf(gSv.map((k) => k.m.share));
  // Position quantile curve → rating; its inverse turns an NHL-based rating into a prior score.
  const qOvr = (g, q) => { const a = KHL_Q[g], x = clamp(q, 0, 1) * 20, i = Math.min(19, Math.floor(x)); return a[i] + (a[i + 1] - a[i]) * (x - i); };
  const qOf = (g, ovr) => { const a = KHL_Q[g]; let i = 0; while (i < 20 && a[i + 1] < ovr) i++; return clamp((i + (a[i + 1] > a[i] ? (ovr - a[i]) / (a[i + 1] - a[i]) : 0)) / 20, 0.01, 0.99); };
  const probit = (q) => { const t = Math.sqrt(-2 * Math.log(q < 0.5 ? q : 1 - q)); const z = t - (2.515517 + 0.802853 * t + 0.010328 * t * t) / (1 + 1.432788 * t + 0.189269 * t * t + 0.001308 * t ** 3); return q < 0.5 ? -z : z; };
  for (const k of khlRoster) {
    const g = k.grp, age = ageOn(k.bd);
    let raw = 0, n = 0;
    if (g === 'G') {
      if (k.m.sh) {
        const sv = (k.m.sv + svMu * 600) / (k.m.sh + 600); // shrink to league save %
        raw = 0.65 * svZ(sv) + 0.35 * shareZ(k.m.share);
        n = k.m.sh / 30;
      }
    } else if (k.eff) {
      const Z = Zk[g];
      raw = g === 'F' ? 0.55 * Z.ppg(k.m.ppg) + 0.45 * Z.toi(k.m.toi) : 0.4 * Z.ppg(k.m.ppg) + 0.6 * Z.toi(k.m.toi);
      n = k.eff;
    }
    // Prior: NHL-based rating for players the NHL API knows, else by age.
    let prior = age <= 20 ? -1.3 : age <= 23 ? -0.8 : -0.5;
    const d = k.nhlId ? landing[k.nhlId] : null;
    if (d) {
      const pos0 = g === 'G' ? 'G' : g === 'D' ? 'D' : 'C';
      const nhlOvr = (g === 'G' ? goOvr[k.nhlId] : skOvr[k.nhlId]) ?? prospectOvr(d, pos0).ovr;
      prior = probit(qOf(g, nhlOvr));
    }
    k.score = (raw * n + prior * 15) / (n + 15);
  }
  const khlPlayers = [];
  for (const g of ['F', 'D', 'G']) {
    const list = khlRoster.filter((k) => k.grp === g).sort((a, b) => a.score - b.score);
    list.forEach((k, i) => { k.ovr = round(qOvr(g, list.length > 1 ? i / (list.length - 1) : 0.5)); });
  }
  for (const k of khlRoster) {
    const d = k.nhlId ? landing[k.nhlId] : null;
    const id = k.nhlId ?? KHL_ID_BASE + k.khl_id;
    const age = ageOn(k.bd);
    const rnd = hashRand(id);
    const g = k.grp;
    let pos = g === 'G' ? 'G' : g === 'D' ? 'D' : k.m.fo >= 2.5 ? 'C' : k.stick === 'r' ? 'R' : 'L';
    if (d && g === 'F' && ['C', 'L', 'R'].includes(d.position)) pos = d.position;
    const p = {
      id,
      fn: d?.firstName.default ?? k.fn,
      ln: d?.lastName.default ?? k.ln,
      pos,
      sh: d?.shootsCatches ?? (k.stick === 'r' ? 'R' : 'L'),
      bd: d?.birthDate ?? k.bd,
      ctry: d?.birthCountry ?? KHL_CTRY[k.country] ?? 'RUS',
      ht: k.height || d?.heightInCentimeters || 183,
      wt: k.weight || d?.weightInKilograms || 88,
      num: k.shirt_number ?? null,
      img: d?.headshot || k.image || null,
      team: k.team,
      st: 'NHL',
      ovr: k.ovr,
    };
    if (!KHL_CTRY[k.country] && !d) console.warn('KHL country?', k.country, k.name);
    if (g === 'G') p.r = goalieAttrs(p.ovr, null, rnd);
    else {
      const Z = Zk[g], c = (x) => clamp(x, -2.5, 2.5), noise = (sp) => (rnd() - 0.5) * sp;
      const has = k.eff >= 5;
      const dev = has ? {
        sh: c(Z.gpg(k.m.gpg)) * 3.2 + noise(3),
        pa: c(Z.apg(k.m.apg)) * 3.6 + noise(3),
        oi: c(Z.ppg(k.m.ppg)) * 3.6,
        di: c(Z.pm(k.m.pm)) * 1.6 + (g === 'D' ? c(Z.toi(k.m.toi)) * 1.5 : 0) - c(Z.ppg(k.m.ppg)) * 0.6 + noise(4),
        ph: (p.wt - 92) * 0.25 + c(Z.pim(k.m.pim)) * 1.2 + noise(4),
        dc: -c(Z.pim(k.m.pim)) * 4,
        du: noise(10),
      } : null;
      if (dev) dev.ha = (dev.sh + dev.pa) / 2 + noise(3);
      if (dev && k.spd) dev.sk = c(spdZ(k.spd)) * 6;
      if (dev && pos === 'C') dev.fo = c(Z.fo(k.m.fo)) * 6 + 4;
      p.r = skaterAttrs(id, pos, p.ovr, null, null, rnd, p.wt, age, dev);
    }
    p.ovr = calcOvrFrom(p.pos, p.r);
    if (d?.draftDetails) p.dr = { y: d.draftDetails.year, r: d.draftDetails.round, p: d.draftDetails.overallPick, t: d.draftDetails.teamAbbrev };
    p.pot = potential(p.ovr, age, d?.draftDetails, rnd);
    const ct = d?.careerTotals?.regularSeason;
    if (ct) p.car = g === 'G' ? { gp: ct.gamesPlayed, w: ct.wins ?? 0, so: ct.shutouts ?? 0 } : { gp: ct.gamesPlayed, g: ct.goals, a: ct.assists, p: ct.points };
    p.h = [...(d ? hist(k.nhlId, g === 'G') : []), ...k.h].sort((a, b) => a[0] - b[0]);
    p.lg = 'KHL';
    p.c = null; // KHL salaries are not public: the game sets them from the salary model
    const holder = prospectIds.get(k.nhlId);
    if (holder) p.rights = holder; // NHL club holding his draft rights
    p.tr = [];
    if (g === 'F' && k.eff >= 30 && Zk.F.gpg(k.m.gpg) > 1.6 && p.ovr >= 76) p.tr.push('sniper');
    if (g !== 'G' && k.eff >= 30 && Zk[g].apg(k.m.apg) > 1.7 && p.ovr >= 76) p.tr.push('playmaker');
    if (pos === 'C' && k.eff >= 30 && Zk.F.fo(k.m.fo) > 1.5) p.tr.push('faceoff');
    if (k.spd && spdZ(k.spd) > 1.7) p.tr.push('speed');
    if (age >= 31 && p.ovr >= 78) p.tr.push('leader');
    if (k.spd) p.spd = +k.spd.toFixed(1);
    khlPlayers.push(p);
  }
  // Main roster: the best 13 forwards, 7 defencemen and 3 goalies; everyone else plays in the farm club.
  for (const t of Object.values(KHL_TEAM)) {
    for (const [g, n] of [['F', 13], ['D', 7], ['G', 3]]) {
      const isG = (p) => (g === 'G' ? p.pos === 'G' : g === 'D' ? p.pos === 'D' : p.pos !== 'G' && p.pos !== 'D');
      khlPlayers.filter((p) => p.team === t && isG(p)).sort((a, b) => b.ovr - a.ovr).forEach((p, i) => { p.st = i < n ? 'NHL' : 'AHL'; });
    }
  }
  players.push(...khlPlayers);
  const ex = khlPlayers.filter((p) => p.id < KHL_ID_BASE || p.id >= KHL_ID_BASE + 1e6);
  console.log('KHL players', khlPlayers.length, 'matched to NHL profiles', ex.length, 'with NHL rights', khlPlayers.filter((p) => p.rights).length);
  console.log('KHL top', [...khlPlayers].sort((a, b) => b.ovr - a.ovr).slice(0, 25).map((p) => `${p.fn} ${p.ln} ${p.pos} ${p.team} ${p.ovr}`).join(', '));
}

// ---------- National teams of smaller nations: IIHF rosters via Wikipedia (scripts/fetch-intl.mjs) ----------
{
  const NATION = {
    Austria: 'AUT', Canada: 'CAN', Finland: 'FIN', France: 'FRA', Latvia: 'LVA', Slovakia: 'SVK', Slovenia: 'SVN', Sweden: 'SWE', Czechia: 'CZE',
    'Czech Republic': 'CZE', Denmark: 'DNK', Germany: 'DEU', Hungary: 'HUN', Kazakhstan: 'KAZ', Norway: 'NOR', Switzerland: 'CHE',
    'United States': 'USA', 'Great Britain': 'GBR', Italy: 'ITA', Poland: 'POL', Japan: 'JPN', Ukraine: 'UKR',
  };
  // Club country (IOC code of the flag) → league and its strength relative to the NHL.
  const CLUB_LG = {
    SWE: 'SHL', FIN: 'Liiga', SUI: 'NL', CZE: 'Czechia', SVK: 'Slovakia', GER: 'DEL', AUT: 'ICEHL', SLO: 'ICEHL', HUN: 'ICEHL', ITA: 'ICEHL',
    DEN: 'Metal Ligaen', NOR: 'EliteHockey', GBR: 'EIHL', UK: 'EIHL', FRA: 'Magnus', POL: 'PHL', LAT: 'Latvia', KAZ: 'Kazakhstan', RUS: 'VHL', UKR: 'UHL',
    LTU: 'Lithuania', EST: 'Estonia', ROU: 'Erste Liga', NED: 'BeNe League', BEL: 'BeNe League', JPN: 'AsiaHL', KOR: 'AsiaHL', CHN: 'AsiaHL',
  };
  const LGF = { SHL: 0.57, Liiga: 0.44, NL: 0.46, Czechia: 0.4, Slovakia: 0.25, DEL: 0.37, ICEHL: 0.22, VHL: 0.27, AHL: 0.39, ECHL: 0.13, NCAA: 0.2, OHL: 0.12, 'Metal Ligaen': 0.17, EliteHockey: 0.15, EIHL: 0.15, Magnus: 0.15, PHL: 0.11, Latvia: 0.1, Kazakhstan: 0.12, UHL: 0.07, AsiaHL: 0.1 };
  const UK_LAT = { а: 'a', б: 'b', в: 'v', г: 'h', ґ: 'g', д: 'd', е: 'e', є: 'ie', ж: 'zh', з: 'z', и: 'y', і: 'i', ї: 'i', й: 'i', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ь: '', ю: 'iu', я: 'ia', 'ʼ': '', "'": '', ы: 'y', э: 'e', ё: 'e', ъ: '' };
  // Word-initial є/ї/й/ю/я use y- (Ukrainian national transliteration).
  const UK_INIT = { є: 'ye', ї: 'yi', й: 'y', ю: 'yu', я: 'ya' };
  const ukLatin = (w) => [...w].map((ch, i) => {
    const lo = ch.toLowerCase();
    const l = i === 0 && UK_INIT[lo] ? UK_INIT[lo] : UK_LAT[lo];
    if (l == null) return ch;
    return ch === lo ? l : l.charAt(0).toUpperCase() + l.slice(1);
  }).join('');
  const UK_MONTH = { січня: 1, лютого: 2, березня: 3, квітня: 4, травня: 5, червня: 6, липня: 7, серпня: 8, вересня: 9, жовтня: 10, листопада: 11, грудня: 12 };
  const pad = (n) => String(n).padStart(2, '0');
  const strip = (x) => x.replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1').replace(/'{2,3}/g, '').trim();
  const rows = [];
  const files = fs.existsSync(path.join(RAW, 'intl')) ? fs.readdirSync(path.join(RAW, 'intl')).sort() : [];
  for (const f of files) {
    const { lang, page, wikitext } = read(`intl/${f}`);
    const year = Number((page.match(/(20\d\d)/) ?? [])[1] ?? 2026);
    if (lang === 'en') {
      let nation = null;
      for (const line of wikitext.split('\n')) {
        const h = line.match(/^==+\s*([^=]+?)\s*==+\s*$/);
        if (h) { nation = NATION[h[1].trim()] ?? null; continue; }
        const pos = nation && (line.match(/^\|\s*\d*\s*\|\|\s*(G|D|F)\s*\|\|/) ?? [])[1];
        if (!pos) continue;
        // Name cell: {{Sortname|First|Last}} or a [[link|First Last]].
        const cell = line.split('||')[2] ?? '';
        let nm = line.match(/\{\{sortname\|([^|}]+)\|([^|}]+)/i);
        if (!nm) {
          const full = strip(cell.replace(/align=left\|/, '').replace(/\s+[–-]\s+'''.*$/, '').replace(/\(.*?\)/g, '')).split(/\s+/).filter(Boolean);
          if (full.length >= 2) nm = [null, full[0], full.slice(1).join(' ')];
        }
        const b = line.match(/birth date and age2?\|(?:\d{4}\|\d{1,2}\|\d{1,2}\|)?(\d{4})\|(\d{1,2})\|(\d{1,2})/);
        if (!nm || !b) continue;
        const club = line.split('flagicon|').pop();
        const m = line.match(/convert\|(\d\.\d+)\|m/), ft = line.match(/convert\|(\d)\|ft\|(\d+)\|in/);
        const kg = line.match(/convert\|(\d+)\|kg/), lb = line.match(/convert\|(\d+)\|lb/);
        const flag = club.match(/^([A-Z]{2,3})\}\}\s*(.*)$/s);
        rows.push({
          nation, year, pos, fn: nm[1].trim(), ln: nm[2].trim(), bd: `${b[1]}-${pad(b[2])}-${pad(b[3])}`,
          ht: m ? Math.round(Number(m[1]) * 100) : ft ? Math.round((Number(ft[1]) * 12 + Number(ft[2])) * 2.54) : 183,
          wt: kg ? Number(kg[1]) : lb ? Math.round(Number(lb[1]) * 0.4536) : 85,
          clubCtry: flag?.[1] ?? '', club: strip((flag?.[2] ?? '').replace(/\}\}/, '')),
        });
      }
    } else if (lang === 'uk') {
      // Ukrainian article: "Склад команди" tables split by Воротарі / Захисники / Нападники.
      const sec = wikitext.slice(wikitext.indexOf('Склад команди'));
      const year2 = Number((sec.match(/чемпіонаті світу (20\d\d)/) ?? sec.match(/(20\d\d)/) ?? [])[1] ?? 2026);
      let pos = 'F';
      for (const chunk of sec.split(/\n\|-/)) {
        if (/Воротарі/.test(chunk)) pos = 'G';
        else if (/Захисники/.test(chunk)) pos = 'D';
        else if (/Нападники/.test(chunk)) pos = 'F';
        const cells = chunk.split('\n').filter((l) => l.startsWith('|') && !l.startsWith('|}')).map((l) => l.replace(/^\|\s*(align="?center"?\s*\|)?/, '').trim());
        if (cells.length < 7 || !/^\d+$/.test(cells[0])) continue;
        const name = strip(cells[1]).split(/\s+/);
        const bm = cells[5].match(/\[\[(\d{1,2}) (\S+)\]\]\s*\[\[(\d{4})\]\]/);
        if (!bm || !UK_MONTH[bm[2]]) continue;
        const club = cells[6].split('flagicon|').pop();
        const flag = club.match(/^([A-Z]{2,3})\}\}\s*(.*)$/s);
        rows.push({
          nation: 'UKR', year: year2, pos, fn: ukLatin(name[0]), ln: ukLatin(name.slice(1).join(' ')), bd: `${bm[3]}-${pad(UK_MONTH[bm[2]])}-${pad(bm[1])}`,
          sh: /П/.test(cells[2]) ? 'R' : 'L', ht: Number((cells[3].match(/\d+/) ?? [183])[0]), wt: Number((cells[4].match(/\d+/) ?? [85])[0]),
          clubCtry: flag?.[1] ?? '', club: strip((flag?.[2] ?? '').replace(/\}\}/, '')),
        });
      }
    }
  }
  // Already in the world (NHL / KHL / Europe data)? Same birth date and a matching surname.
  const known = {};
  const byName = {};
  // Everyone the NHL API knows counts too, active or not (retired players, those who died).
  const people = [...players, ...Object.values(landing).filter((d) => d?.birthDate).map((d) => ({ fn: d.firstName.default, ln: d.lastName.default, bd: d.birthDate }))];
  for (const p of people) {
    (known[p.bd] ??= []).push(nameKey(p.ln));
    (byName[nameKey(`${p.fn}${p.ln}`)] ??= []).push(p.bd);
  }
  const days = (a, b) => Math.abs(new Date(a) - new Date(b)) / 86400000;
  const seen = new Set();
  let id = 6_000_000;
  const added = [];
  for (const r of rows.sort((a, b) => b.year - a.year || a.ln.localeCompare(b.ln) || a.bd.localeCompare(b.bd))) {
    const key = `${r.bd}|${nameKey(r.ln)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const age = ageOn(r.bd);
    if (age < 17 || age >= 38 || (r.year <= 2024 && age >= 34)) continue;
    if ((known[r.bd] ?? []).some((k) => k === nameKey(r.ln) || lev(k, nameKey(r.ln)) <= 2)) continue;
    // Sources disagree on birth dates now and then (even by months): same full name, about the same age.
    if ((byName[nameKey(`${r.fn}${r.ln}`)] ?? []).some((bd) => days(bd, r.bd) <= 400)) continue;
    if (/[={}|]/.test(r.fn + r.ln)) continue; // unparsed markup
    let lg = CLUB_LG[r.clubCtry] ?? null;
    if (r.clubCtry === 'USA' || r.clubCtry === 'CAN') lg = /ice hockey|University|College/.test(r.club) ? 'NCAA' : age <= 20 ? 'OHL' : 'ECHL';
    lg ??= 'Europe';
    const rnd = hashRand(++id);
    // National-team players: a bit above their league's average; youth and age shade it.
    let ovr = 55 + 22 * (LGF[lg] ?? 0.1) + 2 + (rnd() - 0.5) * 6;
    if (age <= 20) ovr -= 3; else if (age <= 22) ovr -= 1; else if (age >= 34) ovr -= 1.5;
    ovr = clamp(round(ovr), 48, 75);
    const pos = r.pos === 'F' ? (rnd() < 0.35 ? 'C' : rnd() < 0.5 ? 'L' : 'R') : r.pos;
    const p = {
      id, fn: r.fn, ln: r.ln, pos, sh: r.sh ?? (rnd() < 0.6 ? 'L' : 'R'), bd: r.bd, ctry: r.nation,
      ht: r.ht || 183, wt: r.wt || 85, num: null, img: null, team: null,
      st: lg === 'NCAA' && age <= 23 ? 'NCAA' : lg === 'OHL' && age <= 20 ? 'JR' : 'EUR', ovr,
    };
    p.r = pos === 'G' ? goalieAttrs(ovr, null, rnd) : skaterAttrs(id, pos, ovr, null, null, rnd, p.wt, age);
    p.ovr = calcOvrFrom(p.pos, p.r);
    p.pot = potential(p.ovr, age, null, rnd);
    p.h = [];
    p.lg = lg;
    p.c = null;
    p.tr = [];
    added.push(p);
  }
  players.push(...added);
  const byN = {};
  for (const p of added) byN[p.ctry] = (byN[p.ctry] ?? 0) + 1;
  console.log('national-team players added', added.length, JSON.stringify(byN));
}

// ---------- Team cap calibration ----------
for (const t of teams) {
  const roster = players.filter((p) => p.team === t.id && p.st === 'NHL' && p.c);
  const fixed = roster.filter((p) => p.c.real || p.c.type === 'ELC');
  const flex = roster.filter((p) => !(p.c.real || p.c.type === 'ELC'));
  const rnd = hashRand(teamIndex[t.id] * 7919 + 13);
  // Teams spend 92-99% of the cap; estimated deals stay close to market value.
  const target = CAP * (0.92 + rnd() * 0.07);
  const fixedSum = fixed.reduce((a, p) => a + p.c.aav, 0);
  const flexSum = flex.reduce((a, p) => a + p.c.aav, 0);
  if (flexSum > 0) {
    let k = clamp((target - fixedSum) / flexSum, 0.75, 1.08);
    // Never start a team over the cap
    if (fixedSum + flexSum * k > CAP * 0.995) k = Math.max(0.35, (CAP * 0.99 - fixedSum) / flexSum);
    for (const p of flex) p.c.aav = clamp(round((p.c.aav * k) / 5000) * 5000, MIN_SALARY, MAX_SALARY);
  }
  t.capUsed = roster.reduce((a, p) => a + p.c.aav, 0);
}

// Rostered NHL players without any contract (shouldn't happen) get a 1-year deal.
for (const p of players) {
  if ((p.st === 'NHL' || p.st === 'AHL') && !p.c) p.c = { aav: MIN_SALARY, last: 2026, type: 'STD', clause: null, real: false };
  if (p.c) {
    const age2 = ageOn(p.bd, new Date(`${p.c.last + 1}-07-01`));
    p.c.exp = p.c.type === 'ELC' || age2 < 27 ? 'RFA' : 'UFA';
  }
}

// ---------- Coaching / system factor ----------
// Team results not explained by roster strength are attributed (50% regressed) to the coaching staff.
{
  const str = (t) => {
    const ro = players.filter((p) => p.team === t.id && p.st === 'NHL');
    const sk = ro.filter((p) => p.pos !== 'G').sort((a, b) => b.ovr - a.ovr).slice(0, 18);
    const g = ro.filter((p) => p.pos === 'G').sort((a, b) => b.ovr - a.ovr)[0];
    return mean(sk.map((p) => p.ovr)) * 0.8 + (g?.ovr || 70) * 0.2;
  };
  const tl = teams.filter((t) => t.last);
  const xs = tl.map(str), ys = tl.map((t) => t.last.pts);
  const mx = mean(xs), my = mean(ys);
  const b = xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0) / xs.reduce((a, x) => a + (x - mx) ** 2, 0);
  tl.forEach((t, i) => {
    const resid = ys[i] - (my + b * (xs[i] - mx));
    t.coach = clamp(round(72 + resid * 0.55), 58, 90);
  });
  for (const t of teams) t.coach ??= 72;
}

const unused = Object.keys(CONTRACTS).filter((k) => !used.has(k));
const world = {
  meta: {
    snapshot: SNAPSHOT,
    season: 2026,
    seasonStart,
    cap: { 2026: CAP, 2027: 113_500_000 },
    floor: { 2026: 76_900_000, 2027: 84_000_000 },
    minSalary: { 2026: MIN_SALARY, 2027: 925_000 },
    champion: 'CAR',
    rivals: RIVALS,
  },
  teams,
  schedule,
  players,
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(world));

// ---------- Report ----------
const by = (f) => players.filter(f);
const nhl = by((p) => p.st === 'NHL');
console.log('players', players.length, 'NHL', nhl.length, 'AHL', by((p) => p.st === 'AHL').length, 'JR', by((p) => p.st === 'JR').length, 'NCAA', by((p) => p.st === 'NCAA').length, 'EUR', by((p) => p.st === 'EUR').length, 'FA', by((p) => p.st === 'FA').length);
console.log('games', schedule.length, 'start', seasonStart, 'size KB', Math.round(fs.statSync(OUT).size / 1024));
console.log('unused contract overrides:', unused.join(', ') || 'none');
const top = [...players].sort((a, b) => b.ovr - a.ovr).slice(0, 40);
console.log(top.map((p) => `${p.fn} ${p.ln} ${p.pos} ${p.team} ${p.ovr}/${p.pot} [${p.tr.join(',')}]`).join('\n'));
const tg = [...players].filter((p) => p.pos === 'G').sort((a, b) => b.ovr - a.ovr).slice(0, 12);
console.log('GOALIES', tg.map((p) => `${p.ln} ${p.team} ${p.ovr}`).join(', '));
const hist2 = {};
for (const p of nhl) hist2[Math.floor(p.ovr / 5) * 5] = (hist2[Math.floor(p.ovr / 5) * 5] || 0) + 1;
console.log('NHL OVR histogram', hist2);
const pros = by((p) => p.st !== 'NHL' && ageOn(p.bd) <= 21).sort((a, b) => b.pot - a.pot).slice(0, 15);
console.log('TOP PROSPECTS', pros.map((p) => `${p.ln} ${p.team} ${p.ovr}/${p.pot} ${p.lg}`).join(', '));
for (const t of teams) {
  const ro = nhl.filter((p) => p.team === t.id);
  const top12 = ro.filter((p) => p.pos !== 'G').sort((a, b) => b.ovr - a.ovr).slice(0, 18);
  const g = ro.filter((p) => p.pos === 'G').sort((a, b) => b.ovr - a.ovr)[0];
  t._str = mean(top12.map((p) => p.ovr)) * 0.8 + (g?.ovr || 70) * 0.2;
}
const tl = teams.filter((t) => t.last);
const xs = tl.map((t) => t._str), ys = tl.map((t) => t.last.pts);
const mx = mean(xs), my = mean(ys);
const r = xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0) / Math.sqrt(xs.reduce((a, x) => a + (x - mx) ** 2, 0) * ys.reduce((a, y) => a + (y - my) ** 2, 0));
console.log('correlation strength vs 2025-26 points r =', r.toFixed(2));
console.log('TEAM STRENGTH', [...teams].sort((a, b) => b._str - a._str).map((t) => `${t.id} ${t._str.toFixed(1)} (${t.last?.pts}) $${(t.capUsed / 1e6).toFixed(1)}M`).join(' | '));
