import { create } from 'zustand';
import type { Game, League } from '../engine/types';
import type { WorldJson, NewCareerOpts } from '../engine/world';
import { newCareer } from '../engine/world';
import { advanceDay, lastUserBox } from '../engine/season';
import { saveLeague, loadLeague, requestPersistence } from '../persistence/db';
import { useNav } from './nav';
import { checkAchievements } from '../engine/achievements';

export type SimMode = 'day' | 'game' | 'week' | 'event' | 'deadline' | 'regular' | 'season' | 'date';

export interface SimState {
  mode: SimMode;
  running: boolean;
  from: string;
  target?: string;
  days: number;
  last?: { game: Game; won: boolean } | null;
  results: { game: Game; won: boolean }[];
}

export interface Toast {
  id: number;
  text: string;
  kind?: 'good' | 'bad' | 'info';
}

interface GameState {
  L: League | null;
  ver: number;
  saveId: string | null;
  world: WorldJson | null;
  sim: SimState | null;
  toasts: Toast[];
  loading: boolean;
  touch: () => void;
  loadWorld: () => Promise<WorldJson>;
  start: (opts: NewCareerOpts) => Promise<void>;
  open: (id: string) => Promise<boolean>;
  setLeague: (L: League, id?: string) => void;
  simulate: (mode: SimMode, target?: string, opts?: { watch?: boolean }) => Promise<void>;
  stopSim: () => void;
  act: <T>(fn: (L: League) => T) => T;
  save: () => Promise<void>;
  toast: (text: string, kind?: Toast['kind']) => void;
  quit: () => void;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let toastId = 1;

const ALWAYS = new Set(['playoffs', 'cup', 'champion', 'draft', 'fa', 'expiring', 'camp', 'regular-end']);
const EVENT = new Set([...ALWAYS, 'deadline', 'offer', 'injury', 'eliminated', 'series-won', 'fa-day1']);

export function applyTheme(L: League | null) {
  const root = document.documentElement;
  const t = L?.teams[L.user];
  root.style.setProperty('--accent', t?.accent ?? '#7fd3ff');
  root.style.setProperty('--team', t?.primary ?? '#0a1428');
  root.style.setProperty('--team2', t?.secondary ?? '#7fd3ff');
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', '#05070d');
}

export const useGame = create<GameState>((set, get) => ({
  L: null,
  ver: 0,
  saveId: null,
  world: null,
  sim: null,
  toasts: [],
  loading: false,
  touch: () => set((s) => ({ ver: s.ver + 1 })),
  loadWorld: async () => {
    const w = get().world;
    if (w) return w;
    const res = await fetch('/data/world.json');
    const json = (await res.json()) as WorldJson;
    set({ world: json });
    return json;
  },
  start: async (opts) => {
    set({ loading: true });
    const w = await get().loadWorld();
    await new Promise((r) => setTimeout(r, 30));
    const L = newCareer(w, opts);
    const id = `career-${Date.now()}`;
    applyTheme(L);
    useNav.getState().reset();
    set({ L, saveId: id, loading: false, ver: get().ver + 1 });
    requestPersistence();
    await saveLeague(id, L);
  },
  open: async (id) => {
    set({ loading: true });
    const L = await loadLeague(id);
    if (!L) {
      set({ loading: false });
      return false;
    }
    migrate(L);
    applyTheme(L);
    useNav.getState().reset();
    set({ L, saveId: id, loading: false, ver: get().ver + 1 });
    return true;
  },
  setLeague: (L, id) => {
    migrate(L);
    applyTheme(L);
    useNav.getState().reset();
    set({ L, saveId: id ?? `career-${Date.now()}`, ver: get().ver + 1 });
    get().save();
  },
  simulate: async (mode, target, opts) => {
    const L = get().L;
    if (!L || get().sim?.running) return;
    if (L.gm.fired) {
      useNav.getState().go('more', 'career');
      return;
    }
    const sim: SimState = { mode, running: true, from: L.date, target, days: 0, results: [], last: null };
    set({ sim });
    let budgetStart = performance.now();
    const stopSet = mode === 'event' || mode === 'week' || mode === 'game' ? EVENT : ALWAYS;
    let reason: string | null = null;
    // Already standing on a stop-worthy screen (e.g. draft day)? Continue anyway.
    while (get().sim?.running) {
      L.stops = [];
      const rep = advanceDay(L);
      sim.days++;
      if (rep.userGame) {
        const g = rep.userGame.game;
        const won = g.h === L.user ? (g.hs ?? 0) > (g.as ?? 0) : (g.as ?? 0) > (g.hs ?? 0);
        sim.last = { game: g, won };
        sim.results.push({ game: g, won });
      }
      const hit = L.stops.find((s) => stopSet.has(s));
      if (hit) { reason = hit; break; }
      if (L.gm.fired) break;
      if (mode === 'day') break;
      if (mode === 'game' && rep.userGame) break;
      if (mode === 'week' && sim.days >= 7) break;
      if (mode === 'event' && L.settings.stopOnUserGames && rep.userGame) break;
      if (mode === 'deadline' && L.date >= L.deadline) break;
      if (mode === 'date' && target && L.date >= target) break;
      if (mode === 'regular' && L.phase !== 'regular' && L.phase !== 'preseason') break;
      if (mode === 'season' && L.phase === 'offseason') break;
      if (sim.days > 420) break;
      if (performance.now() - budgetStart > 34) {
        set({ sim: { ...sim }, ver: get().ver + 1 });
        await new Promise((r) => setTimeout(r, 0));
        budgetStart = performance.now();
      }
    }
    checkAchievements(L);
    set({ sim: null, ver: get().ver + 1 });
    get().save();
    onStop(reason, mode, !!opts?.watch);
  },
  stopSim: () => {
    const s = get().sim;
    if (s) set({ sim: { ...s, running: false } });
  },
  act: (fn) => {
    const L = get().L!;
    const r = fn(L);
    set({ ver: get().ver + 1 });
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => get().save(), 1200);
    return r;
  },
  save: async () => {
    const { L, saveId } = get();
    if (!L || !saveId) return;
    try {
      await saveLeague(saveId, L);
    } catch (e) {
      console.warn('save failed', e);
    }
  },
  toast: (text, kind = 'info') => {
    const id = toastId++;
    set({ toasts: [...get().toasts, { id, text, kind }] });
    setTimeout(() => set({ toasts: get().toasts.filter((t) => t.id !== id) }), 3200);
  },
  quit: () => {
    get().save();
    applyTheme(null);
    set({ L: null, saveId: null });
  },
}));

function onStop(reason: string | null, mode: SimMode, watch = false) {
  const nav = useNav.getState();
  const L = useGame.getState().L!;
  if (L.gm.fired) return nav.go('more', 'career');
  if (reason === 'cup' || reason === 'champion') {
    if (L.playoffs?.champion === L.user) nav.openModal('celebration');
    else nav.go('league', 'playoffs');
    return;
  }
  if (reason === 'draft') return nav.go('more', 'draftRoom');
  if (reason === 'fa' || reason === 'fa-day1') return nav.go('market', 'market', { tab: 'fa' });
  if (reason === 'expiring') return nav.go('market', 'market', { tab: 'ext' });
  if (reason === 'playoffs') return nav.go('league', 'playoffs');
  if (mode === 'game' && (watch || L.settings.watchGames) && lastUserBox) nav.openModal('match', { live: true, id: lastUserBox.game.id });
}

/** Fills fields added in later versions. */
function migrate(L: League) {
  L.dead ??= [];
  L.lotteryWins ??= {};
  L.flags ??= {};
  L.album ??= [];
  L.watch ??= [];
}

export function useL(): League {
  useGame((s) => s.ver);
  return useGame.getState().L!;
}
