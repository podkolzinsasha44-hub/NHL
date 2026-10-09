// Hall of Fame and the record book.
// Inductees: retired players three or more seasons after their last game whose career (real NHL
// numbers before the game started + seasons played in the game) reaches Hall of Fame level.
// Record book: real all-time NHL records (historical facts) against the best marks set in the game.
import { careerGoalie, careerSkater, statKey, svPct } from './stats';
import { pushNews, social } from './news';
import type { GoalieLine, HallEntry, League, Player, SkaterLine } from './types';
import { unlock } from './achievements';
import { isGM } from './leagues';

const MAJOR = ['hart', 'vezina', 'norris', 'conn'];
const MINOR = ['ross', 'richard', 'calder', 'selke', 'khl-mvp', 'wc-mvp', 'og-mvp'];

const countAwards = (p: Player, keys: string[]) => p.awards.filter((a) => keys.includes(a.split(':')[0])).length;

/** Hall of Fame score: about 1000 is a sure first-ballot career. */
export function hallScore(p: Player) {
  const cups = countAwards(p, ['cup']);
  const extra = 250 * countAwards(p, MAJOR) + 120 * countAwards(p, MINOR) + 60 * cups + 40 * countAwards(p, ['khl-cup']);
  if (p.pos === 'G') {
    const c = careerGoalie(p);
    return c.w * 2.2 + c.so * 3 + extra;
  }
  const c = careerSkater(p);
  return c.pts * (p.pos === 'D' ? 1.3 : 1) + c.g * 0.4 + extra;
}

function mainTeam(p: Player): string | null {
  const n: Record<string, number> = {};
  for (const row of p.h ?? []) if (typeof row[1] === 'string') n[row[1]] = (n[row[1]] ?? 0) + 1;
  for (const t of p.teams) n[t] = (n[t] ?? 0) + 1;
  let best: string | null = null;
  for (const [t, v] of Object.entries(n)) if (!best || v > n[best]) best = t;
  return best;
}

export function careerLine(p: Player) {
  if (p.pos === 'G') {
    const c = careerGoalie(p);
    return `${c.gp} матчей, ${c.w} побед, ${c.so} «сухих»`;
  }
  const c = careerSkater(p);
  return `${c.gp} матчей, ${c.g} голов, ${c.pts} очков`;
}

/** Summer class of the Hall of Fame (called on July 1): at most four players a year. */
export function inductHall(L: League) {
  const hof = (L.hof ??= []);
  const inside = new Set(hof.map((h) => h.id));
  const cands: { p: Player; v: number }[] = [];
  for (const id in L.players) {
    const p = L.players[id];
    if (p.st !== 'RET' || p.retired == null || inside.has(p.id) || L.season - p.retired < 3) continue;
    if (p.id === L.pro?.pid) continue;
    const v = hallScore(p);
    if (v >= 1000) cands.push({ p, v });
  }
  cands.sort((a, b) => b.v - a.v);
  const cls: HallEntry[] = cands.slice(0, 4).map(({ p }) => ({ id: p.id, name: `${p.fn} ${p.ln}`, pos: p.pos, ctry: p.ctry, year: L.season, team: mainTeam(p), line: careerLine(p) }));
  if (!cls.length) return;
  hof.unshift(...cls);
  for (const h of cls) L.players[h.id]?.awards.push(`hof:${L.season}`);
  pushNews(L, {
    kind: 'league', important: true,
    title: `Зал славы, класс ${L.season}: ${cls.map((h) => h.name).join(', ')}`,
    body: cls.map((h) => `${h.name} — ${h.line}`).join('\n'),
    players: cls.map((h) => h.id),
  });
  if (isGM(L)) {
    const ours = cls.filter((h) => L.album.includes(h.id));
    if (ours.length) {
      unlock(L, 'hof');
      social(L, `${ours.map((h) => h.name).join(' и ')} — в Зале славы! Спасибо за всё, что сделано в нашей форме 🏛️`, { kind: 'fan', team: L.user, players: ours.map((h) => h.id) });
    }
  }
}

// ---------- Record book ----------

export interface RecordRow {
  key: string;
  title: string;
  /** Historical NHL record (before the game started). */
  real: { v: number; who: string; when: string } | null;
  /** Best mark set in the game world. */
  game: { v: number; who: string; when: string; id?: number; team?: string } | null;
  fmt?: 'int' | 'pct3';
}

/** All-time NHL single-season records (regular season, historical facts). */
const SEASON_REAL: Record<string, { v: number; who: string; when: string }> = {
  g: { v: 92, who: 'Wayne Gretzky', when: '1981-82' },
  a: { v: 163, who: 'Wayne Gretzky', when: '1985-86' },
  pts: { v: 215, who: 'Wayne Gretzky', when: '1985-86' },
  dpts: { v: 139, who: 'Bobby Orr', when: '1970-71' },
  pm: { v: 124, who: 'Bobby Orr', when: '1970-71' },
  ppg: { v: 34, who: 'Tim Kerr', when: '1985-86' },
  w: { v: 48, who: 'Martin Brodeur, Braden Holtby', when: '2006-07, 2015-16' },
  so: { v: 22, who: 'George Hainsworth', when: '1928-29' },
  tpts: { v: 135, who: 'Boston Bruins', when: '2022-23' },
  tw: { v: 65, who: 'Boston Bruins', when: '2022-23' },
};
/** All-time NHL career records before the 2026-27 season (players still active are checked live). */
const CAREER_REAL: Record<string, { v: number; who: string }> = {
  g: { v: 894, who: 'Wayne Gretzky' },
  a: { v: 1963, who: 'Wayne Gretzky' },
  pts: { v: 2857, who: 'Wayne Gretzky' },
  gp: { v: 1779, who: 'Patrick Marleau' },
  w: { v: 691, who: 'Martin Brodeur' },
  so: { v: 125, who: 'Martin Brodeur' },
};

const seasonLabel = (s: number) => `${s}-${String((s + 1) % 100).padStart(2, '0')}`;

/** NHL regular seasons completed or in progress in the game. */
function gameSeasons(L: League) {
  const out: number[] = [];
  for (let s = L.season; s >= L.season - 40; s--) {
    if (s < 2026) break;
    out.push(s);
  }
  return out;
}

export function seasonRecords(L: League): RecordRow[] {
  const best: Record<string, RecordRow['game']> = {};
  const put = (k: string, v: number, p: Player, s: number) => {
    const b = best[k];
    if (!b || v > b.v) best[k] = { v, who: `${p.fn} ${p.ln}`, when: seasonLabel(s), id: p.id };
  };
  const seasons = gameSeasons(L);
  for (const id in L.players) {
    const p = L.players[id];
    for (const s of seasons) {
      const st = p.stats[statKey(s, false)];
      if (!st) continue;
      if (p.pos === 'G') {
        const g = st as GoalieLine;
        put('w', g.w, p, s);
        put('so', g.so, p, s);
        if (g.gp >= 40) put('sv', Math.round(svPct(g) * 1000), p, s);
      } else {
        const x = st as SkaterLine;
        put('g', x.g, p, s); put('a', x.a, p, s); put('pts', x.pts, p, s); put('pm', x.pm, p, s); put('ppg', x.ppg, p, s);
        if (p.pos === 'D') put('dpts', x.pts, p, s);
      }
    }
  }
  // Team records from the season history (and the season in progress).
  const teamBest = (k: 'tpts' | 'tw') => {
    let b: RecordRow['game'] = null;
    for (const h of L.history) for (const r of h.standings) {
      const v = k === 'tpts' ? r.pts : r.w ?? 0;
      if (v && (!b || v > b.v)) b = { v, who: L.teams[r.id]?.name ?? r.id, when: seasonLabel(h.season), team: r.id };
    }
    const live = L.phase === 'regular' || L.phase === 'playoffs';
    for (const t of Object.values(L.teams)) {
      if (t.lg || !live) continue;
      const v = k === 'tpts' ? t.rec.pts : t.rec.w;
      if (v && (!b || v > b.v)) b = { v, who: t.name, when: seasonLabel(L.season), team: t.id };
    }
    return b;
  };
  best.tpts = teamBest('tpts');
  best.tw = teamBest('tw');
  const rows: [string, string][] = [
    ['g', 'Голы'], ['a', 'Передачи'], ['pts', 'Очки'], ['dpts', 'Очки защитника'], ['pm', 'Плюс-минус'], ['ppg', 'Голы в большинстве'],
    ['w', 'Победы вратаря'], ['so', '«Сухие» матчи'], ['sv', '% отражённых (40+ матчей)'], ['tpts', 'Очки команды'], ['tw', 'Победы команды'],
  ];
  return rows.map(([key, title]) => ({ key, title, real: SEASON_REAL[key] ?? null, game: best[key] ?? null, fmt: key === 'sv' ? 'pct3' : 'int' }));
}

/** Career records: historical marks and every player in the world (real totals + game seasons). */
export function careerRecords(L: League) {
  const rows: { key: string; title: string; holder: { v: number; who: string; id?: number; active?: boolean }; chase: { v: number; who: string; id: number }[] }[] = [];
  const keys: [string, string, boolean][] = [['g', 'Голы', false], ['a', 'Передачи', false], ['pts', 'Очки', false], ['gp', 'Матчи', false], ['w', 'Победы вратаря', true], ['so', '«Сухие» матчи', true]];
  for (const [k, title, goalie] of keys) {
    const all: { v: number; who: string; id: number; active: boolean }[] = [];
    for (const id in L.players) {
      const p = L.players[id];
      if ((p.pos === 'G') !== goalie) continue;
      const c = goalie ? careerGoalie(p) : careerSkater(p);
      const v = (c as Record<string, number>)[k] ?? 0;
      if (v > 0) all.push({ v, who: `${p.fn} ${p.ln}`, id: p.id, active: p.st !== 'RET' });
    }
    all.sort((a, b) => b.v - a.v);
    const real = CAREER_REAL[k];
    const top = all[0];
    const holder = top && top.v > real.v ? { v: top.v, who: top.who, id: top.id, active: top.active } : { v: real.v, who: real.who };
    rows.push({ key: k, title, holder, chase: all.filter((x) => x.active).slice(0, 5) });
  }
  return rows;
}

/**
 * After the NHL regular season: a real all-time season record beaten in the game makes headlines
 * (once per record and season).
 */
export function announceRecords(L: League) {
  for (const r of seasonRecords(L)) {
    if (!r.real || !r.game || r.game.v <= r.real.v || r.game.when !== seasonLabel(L.season)) continue;
    const flag = `rec:${r.key}:${L.season}`;
    if (L.flags[flag]) continue;
    L.flags[flag] = true;
    pushNews(L, {
      kind: 'milestone', important: true,
      title: `Рекорд НХЛ! ${r.game.who}: ${r.title.toLowerCase()} — ${r.game.v}`,
      body: `Прежний рекорд — ${r.real.v} (${r.real.who}, ${r.real.when}).`,
      players: r.game.id ? [r.game.id] : undefined,
      team: r.game.team,
    });
  }
}
