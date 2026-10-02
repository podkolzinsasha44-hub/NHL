import type { GoalieAttrs, League, Player, SkaterAttrs } from './types';

export const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));

export function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 86400000);
}
export function ageOn(birth: string, date: string): number {
  const b = new Date(birth + 'T12:00:00Z');
  const d = new Date(date + 'T12:00:00Z');
  let a = d.getUTCFullYear() - b.getUTCFullYear();
  if (d.getUTCMonth() < b.getUTCMonth() || (d.getUTCMonth() === b.getUTCMonth() && d.getUTCDate() < b.getUTCDate())) a--;
  return a;
}
export const age = (p: Player, L: League) => ageOn(p.bd, L.date);

export const isGoalie = (p: Player) => p.pos === 'G';
export const sk = (p: Player) => p.r as SkaterAttrs;
export const gk = (p: Player) => p.r as GoalieAttrs;

export const W_POS = {
  C: { sk: 0.15, sh: 0.15, pa: 0.17, ha: 0.14, oi: 0.17, di: 0.12, ph: 0.05, fo: 0.05 },
  W: { sk: 0.16, sh: 0.19, pa: 0.14, ha: 0.15, oi: 0.18, di: 0.1, ph: 0.08, fo: 0 },
  D: { sk: 0.15, sh: 0.07, pa: 0.14, ha: 0.09, oi: 0.12, di: 0.3, ph: 0.13, fo: 0 },
} as const;

export function calcOvr(p: Player): number {
  if (p.pos === 'G') {
    const a = p.r as GoalieAttrs;
    return Math.round(0.3 * a.po + 0.3 * a.rf + 0.15 * a.rb + 0.05 * a.pk + 0.12 * a.cs + 0.08 * a.mn);
  }
  const a = p.r as SkaterAttrs;
  const w = W_POS[p.pos === 'C' ? 'C' : p.pos === 'D' ? 'D' : 'W'];
  let v = 0;
  for (const [k, wt] of Object.entries(w)) v += wt * a[k as keyof SkaterAttrs];
  return Math.round(v);
}

export const fullName = (p: Player) => `${p.fn} ${p.ln}`;
export const shortName = (p: Player) => `${p.fn[0]}. ${p.ln}`;

export function capOf(L: League, season = L.season) {
  return L.meta.cap[season] ?? projectedCap(L, season);
}
export function minSalaryOf(L: League, season = L.season) {
  return L.meta.minSalary[season] ?? Math.round((L.meta.minSalary[2027] ?? 925_000) * 1.04 ** (season - 2027) / 5000) * 5000;
}
export function floorOf(L: League, season = L.season) {
  return L.meta.floor[season] ?? Math.round(capOf(L, season) * 0.74);
}
function projectedCap(L: League, season: number) {
  let cap = L.meta.cap[2027] ?? 113_500_000;
  for (let y = 2028; y <= season; y++) cap = Math.round((cap * 1.045) / 100_000) * 100_000;
  L.meta.cap[season] = cap;
  return cap;
}

export function seasonLabel(season: number) {
  return `${season}-${String((season + 1) % 100).padStart(2, '0')}`;
}

export function money(n: number, digits = 1) {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(digits)}M`;
  if (Math.abs(n) >= 1000) return `$${Math.round(n / 1000)}K`;
  return `$${n}`;
}
