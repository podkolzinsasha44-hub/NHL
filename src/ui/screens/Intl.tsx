// National teams: World Championship / Olympics — groups, games, playoffs, rosters, history,
// and the roster editor for a GM who also coaches a national team.
import { useMemo, useState } from 'react';
import { useGame, useL } from '../../store/game';
import { Screen, Sheet, Icon } from '../components/shell';
import { Button, Card, Chips, cx, Empty, Pill, SectionTitle } from '../components/kit';
import { NationBadge } from '../components/media';
import { PlayerRow } from '../components/rows';
import { dateShort, flag, POS_RU } from '../format';
import type { IntlGame, League, Player, SkaterLine, Tournament } from '../../engine/types';
import { autoRoster, eligible, groupTable, intlKey, NATIONS, nationOf, ROSTER_SIZE, setCoachRoster, SUSPENDED } from '../../engine/intl';
import { isGM, proPlayer } from '../../engine/leagues';
import { SimDock } from './SimOverlay';

type ITab = 'groups' | 'games' | 'po' | 'rosters' | 'history';

const STAGE_RU: Record<string, string> = { q: 'Квалификация', qf: '1/4 финала', sf: '1/2 финала', bronze: 'Матч за бронзу', final: 'Финал' };
const nat = (c: string) => NATIONS[c]?.name ?? c;

export function IntlScreen() {
  const L = useL();
  const I = L.intl;
  const cur = I?.current ?? null;
  const prev = I?.prev ?? null;
  // Show the running tournament; before it starts, the last one's results are one tap away.
  const [which, setWhich] = useState<'cur' | 'prev'>(cur && cur.phase !== 'upcoming' ? 'cur' : prev ? 'prev' : 'cur');
  const T = which === 'prev' && prev ? prev : cur;
  const [tab, setTab] = useState<ITab>('groups');
  if (!I) return <Screen title="Сборные"><Empty title="Сборных пока нет" /></Screen>;
  return (
    <Screen title="Сборные" subtitle={T ? T.name : 'Международный хоккей'}>
      {cur && prev && (
        <Chips value={which} onChange={setWhich} options={[{ v: 'cur', label: `${cur.name}${cur.phase === 'upcoming' ? ' · скоро' : ''}` }, { v: 'prev', label: `${prev.name} · итоги` }]} />
      )}
      {T && <TournamentCard T={T} />}
      <CoachCard />
      {T && (
        <>
          <div className="mt-3"><Chips value={tab} onChange={setTab} options={[{ v: 'groups', label: 'Группы' }, { v: 'games', label: 'Матчи' }, { v: 'po', label: 'Плей-офф' }, { v: 'rosters', label: 'Составы' }, { v: 'history', label: 'История' }]} /></div>
          {tab === 'groups' && <Groups T={T} />}
          {tab === 'games' && <Games T={T} />}
          {tab === 'po' && <Playoff T={T} />}
          {tab === 'rosters' && <Rosters L={L} T={T} />}
          {tab === 'history' && <History L={L} />}
        </>
      )}
      <SimDock />
    </Screen>
  );
}

function TournamentCard({ T }: { T: Tournament }) {
  const L = useL();
  const phase = T.phase === 'upcoming' ? (T.named ? 'Составы объявлены' : `Составы — ${dateShort(T.select)}`) : T.phase === 'group' ? 'Групповой этап' : T.phase === 'playoff' ? 'Плей-офф' : 'Турнир завершён';
  const banned = [...SUSPENDED].filter((c) => !T.teams.includes(c));
  return (
    <Card className="mt-3">
      <div className="flex items-center gap-3">
        <div className="text-[34px]">{T.kind === 'og' ? '🏅' : '🌍'}</div>
        <div className="flex-1 min-w-0">
          <div className="font-display uppercase text-[19px] leading-tight">{T.name}</div>
          <div className="text-[12.5px] text-muted">{T.host ? `${T.host} · ` : ''}{dateShort(T.start)} — {dateShort(T.end)} · {T.teams.length} сборных</div>
        </div>
        <Pill color={T.phase === 'done' ? '#e8c26a' : 'var(--accent)'}>{phase}</Pill>
      </div>
      {T.medals && (
        <div className="flex gap-2 mt-3">
          {T.medals.map((c, i) => (
            <div key={c} className="flex-1 glass rounded-2xl p-2 flex flex-col items-center">
              <div className="text-[20px]">{['🥇', '🥈', '🥉'][i]}</div>
              <NationBadge code={c} size={30} />
              <div className="text-[12px] mt-1 text-center">{nat(c)}</div>
            </div>
          ))}
        </div>
      )}
      {T.mvp && L.players[T.mvp] && <div className="text-[12.5px] text-muted mt-2">MVP турнира: {L.players[T.mvp].fn} {L.players[T.mvp].ln}</div>}
      {banned.length > 0 && !L.settings.intlRussia && <div className="text-[12px] text-faint mt-2">Сборные России и Беларуси отстранены IIHF (с 2022 года). Допустить их можно в настройках.</div>}
    </Card>
  );
}

function Groups({ T }: { T: Tournament }) {
  const L = useL();
  const mine = myNation(L);
  const cut = T.kind === 'wc' ? 4 : 1;
  return (
    <div>
      {Object.keys(T.groups).map((g) => (
        <div key={g}>
          <SectionTitle>Группа {g}</SectionTitle>
          <Card pad={false} className="overflow-hidden">
            <div className="flex items-center gap-1.5 px-3 h-8 text-[11px] text-muted uppercase">
              <span className="w-4" /><span className="w-6" /><span className="flex-1">Сборная</span>{['И', 'В', 'ВО', 'ПО', 'П'].map((h) => <span key={h} className="w-6 text-right">{h}</span>)}<span className="w-7 text-right">О</span>
            </div>
            {groupTable(T, g).map((c, i) => {
              const r = T.table[c];
              return (
                <div key={c} className={cx('flex items-center gap-1.5 px-3 h-[44px] text-[14px] tnum', c === mine && 'bg-[color-mix(in_oklab,var(--accent)_14%,transparent)]', i === cut - 1 && 'border-b-2 border-dashed border-white/20')}>
                  <span className="w-4 text-muted text-right">{i + 1}</span>
                  <NationBadge code={c} size={24} />
                  <span className="flex-1 truncate">{nat(c)}</span>
                  {[r.gp, r.w, r.otw, r.otl, r.l].map((x, k) => <span key={k} className="w-6 text-right text-muted">{x}</span>)}
                  <span className="w-7 text-right num text-[15px]">{r.pts}</span>
                </div>
              );
            })}
          </Card>
        </div>
      ))}
      <div className="text-[12px] text-muted mt-2 px-1">В — победы в основное время, ВО/ПО — победы и поражения в овертайме или по буллитам. Очки по системе IIHF: победа в основное время — 3, в овертайме или по буллитам — 2, поражение в овертайме — 1. {T.kind === 'wc' ? 'Четыре лучшие команды группы выходят в плей-офф, последняя покидает элиту.' : 'Победители групп и лучшая вторая команда — сразу в четвертьфинал, остальные играют квалификацию.'}</div>
    </div>
  );
}

function GameRow({ g }: { g: IntlGame }) {
  const L = useL();
  const mine = myNation(L);
  const win = g.played ? ((g.hs ?? 0) > (g.as ?? 0) ? g.h : g.a) : null;
  return (
    <div className={cx('glass rounded-2xl px-3 h-[50px] flex items-center gap-2', (g.h === mine || g.a === mine) && 'border-[color-mix(in_oklab,var(--accent)_55%,transparent)]')}>
      <div className="w-12 text-[11px] text-muted leading-tight">{dateShort(g.day)}<br />{STAGE_RU[g.stage] ? STAGE_RU[g.stage].slice(0, 10) : `гр. ${g.stage}`}</div>
      <NationBadge code={g.h} size={24} />
      <span className={cx('flex-1 truncate text-[13.5px]', win === g.h && 'font-semibold')}>{nat(g.h)}</span>
      <span className="num text-[16px] w-14 text-center">{g.played ? `${g.hs}:${g.as}` : '—'}</span>
      <span className={cx('flex-1 truncate text-right text-[13.5px]', win === g.a && 'font-semibold')}>{nat(g.a)}</span>
      <NationBadge code={g.a} size={24} />
      <span className="w-6 text-[10.5px] text-muted text-right">{g.ot ?? ''}</span>
    </div>
  );
}

function Games({ T }: { T: Tournament }) {
  const days = [...new Set(T.games.map((g) => g.day))].sort();
  if (!T.games.length) return <Empty icon="🗓️" title="Расписания нет" />;
  return (
    <div className="flex flex-col gap-1.5 mt-3">
      {days.map((d) => T.games.filter((g) => g.day === d).map((g) => <GameRow key={g.id} g={g} />))}
    </div>
  );
}

function Playoff({ T }: { T: Tournament }) {
  const stages = ['q', 'qf', 'sf', 'bronze', 'final'].filter((s) => T.games.some((g) => g.stage === s));
  if (!stages.length) return <Empty icon="🏆" title="Плей-офф впереди" text={T.kind === 'wc' ? 'Четвертьфиналы: A1–B4, A2–B3, B1–A4, B2–A3; в полуфиналах — перепосев.' : 'Квалификация 5–12, затем четвертьфиналы с лучшей четвёркой.'} />;
  return (
    <div>
      {stages.reverse().map((s) => (
        <div key={s}>
          <SectionTitle>{STAGE_RU[s]}</SectionTitle>
          <div className="flex flex-col gap-1.5">{T.games.filter((g) => g.stage === s).map((g) => <GameRow key={g.id} g={g} />)}</div>
        </div>
      ))}
    </div>
  );
}

function Rosters({ L, T }: { L: League; T: Tournament }) {
  const mine = myNation(L);
  const [code, setCode] = useState<string>(mine && T.teams.includes(mine) ? mine : T.teams[0]);
  const key = intlKey(T);
  const ids = T.rosters[code] ?? [];
  const players = ids.map((id) => L.players[id]).filter(Boolean).sort((a, b) => ({ G: 0, D: 1, C: 2, L: 2, R: 2 }[a.pos] - { G: 0, D: 1, C: 2, L: 2, R: 2 }[b.pos] || b.ovr - a.ovr));
  return (
    <div className="mt-3">
      <Chips value={code} onChange={setCode} options={T.teams.map((c) => ({ v: c, label: `${flag(c)} ${nat(c)}` }))} />
      {!T.named ? (
        <Card className="mt-3"><div className="text-[14px] text-muted">Составы объявят {dateShort(T.select)}. Тренеры берут лучших доступных: игроки клубов, которые ещё в плей-офф, приезжают только на Олимпиаду.</div></Card>
      ) : (
        <div className="glass rounded-3xl py-1 mt-3">
          {players.map((p) => {
            const s = p.stats[key] as SkaterLine | undefined;
            return <PlayerRow key={p.id} p={p} L={L} showTeam right={s && p.pos !== 'G' ? <div className="text-right mr-1"><div className="num text-[15px]">{s.g}+{s.a}</div><div className="text-[10px] text-muted">{s.gp} И</div></div> : undefined} />;
          })}
        </div>
      )}
    </div>
  );
}

function History({ L }: { L: League }) {
  const I = L.intl!;
  const medals: Record<string, [number, number, number]> = {};
  for (const h of I.history) h.medals.forEach((c, i) => { (medals[c] ??= [0, 0, 0])[i]++; });
  const table = Object.entries(medals).sort((a, b) => b[1][0] - a[1][0] || b[1][1] - a[1][1] || b[1][2] - a[1][2]);
  if (!I.history.length) return <Empty icon="📜" title="История пишется" text="Здесь появятся медалисты чемпионатов мира и Олимпиад." />;
  return (
    <div>
      <SectionTitle>Медальный зачёт</SectionTitle>
      <Card pad={false}>
        {table.map(([c, m], i) => (
          <div key={c} className={cx('flex items-center gap-3 px-4 h-11 text-[14px] tnum', i && 'border-t hairline')}>
            <NationBadge code={c} size={24} />
            <span className="flex-1">{nat(c)}</span>
            <span className="w-8 text-right">🥇{m[0]}</span><span className="w-8 text-right">🥈{m[1]}</span><span className="w-8 text-right">🥉{m[2]}</span>
          </div>
        ))}
      </Card>
      <SectionTitle>Турниры</SectionTitle>
      <div className="flex flex-col gap-2">
        {I.history.map((h) => (
          <Card key={h.id} className="!py-3">
            <div className="flex items-center justify-between">
              <div className="font-semibold text-[15px]">{h.name}</div>
              {h.coach && h.coachRank && <Pill color="var(--accent)">{nat(h.coach)}: {h.coachRank}-е</Pill>}
            </div>
            <div className="text-[13px] text-muted mt-1">{h.medals.map((c, i) => `${['🥇', '🥈', '🥉'][i]} ${nat(c)}`).join('  ')}</div>
            {h.mvp && L.players[h.mvp] && <div className="text-[12px] text-faint mt-1">MVP: {L.players[h.mvp].fn} {L.players[h.mvp].ln}{h.topScorer ? ` · бомбардир: ${h.topScorer.name} (${h.topScorer.pts})` : ''}</div>}
          </Card>
        ))}
      </div>
      <div className="text-[12px] text-muted mt-2 px-1">Мировой рейтинг: {I.ranking.slice(0, 8).map((c, i) => `${i + 1}. ${nat(c)}`).join(' · ')}</div>
    </div>
  );
}

/** The nation the user follows: the coached team, or the player's own country. */
function myNation(L: League): string | null {
  if (isGM(L)) return L.intl?.coach ?? null;
  const p = proPlayer(L);
  return p ? nationOf(p) : null;
}

function CoachCard() {
  const L = useL();
  const I = L.intl!;
  const T = I.current;
  const { act, toast } = useGame.getState();
  const [pick, setPick] = useState(false);
  const [add, setAdd] = useState(false);
  if (!isGM(L)) return null;
  const c = I.coach;
  const editable = !!(c && T && T.teams.includes(c) && T.named && T.phase === 'upcoming');
  return (
    <>
      <Card className="mt-3">
        {c ? (
          <div className="flex items-center gap-3">
            <NationBadge code={c} size={40} />
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-[15px]">Вы — главный тренер: {nat(c)}</div>
              <div className="text-[12.5px] text-muted">{!T ? '' : !T.teams.includes(c) ? `${nat(c)} не играет на турнире ${T.name}.` : editable ? 'Состав можно менять до стартового матча.' : T.named ? 'Состав утверждён.' : `Штаб предложит состав ${dateShort(T.select)}.`}</div>
            </div>
            <Button size="sm" onClick={() => setPick(true)}>Сменить</Button>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <div className="text-[30px]">🎽</div>
            <div className="flex-1"><div className="font-semibold text-[15px]">Возглавить сборную</div><div className="text-[12.5px] text-muted">Совмещайте работу GM клуба и тренера сборной: выбирайте состав на ЧМ и Олимпиаду.</div></div>
            <Button size="sm" variant="primary" onClick={() => setPick(true)}>Выбрать</Button>
          </div>
        )}
      </Card>
      {editable && c && T && <CoachRoster T={T} code={c} onAdd={() => setAdd(true)} />}
      <Sheet open={pick} onClose={() => setPick(false)} title="Сборная">
        <div className="grid grid-cols-3 gap-2">
          {Object.keys(NATIONS).map((code) => (
            <button key={code} onClick={() => { act((L) => (L.intl!.coach = code)); setPick(false); toast(`Вы — тренер сборной: ${nat(code)}`, 'good'); }} className={cx('press glass rounded-2xl p-2 flex flex-col items-center gap-1', c === code && 'border-[var(--accent)]')}>
              <NationBadge code={code} size={34} />
              <div className="text-[11.5px] text-center leading-tight">{nat(code)}</div>
            </button>
          ))}
        </div>
        {c && <Button full className="mt-3" onClick={() => { act((L) => (L.intl!.coach = undefined)); setPick(false); }}>Оставить пост тренера</Button>}
      </Sheet>
      {editable && c && T && <AddSheet open={add} onClose={() => setAdd(false)} T={T} code={c} />}
    </>
  );
}

function counts(L: League, ids: number[]) {
  const n = { G: 0, D: 0, F: 0 };
  for (const id of ids) { const p = L.players[id]; if (p) n[p.pos === 'G' ? 'G' : p.pos === 'D' ? 'D' : 'F']++; }
  return n;
}

function CoachRoster({ T, code, onAdd }: { T: Tournament; code: string; onAdd: () => void }) {
  const L = useL();
  const { act, toast } = useGame.getState();
  const ids = T.rosters[code] ?? [];
  const n = counts(L, ids);
  const players = ids.map((id) => L.players[id]).filter(Boolean).sort((a, b) => b.ovr - a.ovr);
  return (
    <>
      <SectionTitle right={<span className="text-[12px] text-muted">В {n.G}/{ROSTER_SIZE.G} · З {n.D}/{ROSTER_SIZE.D} · Н {n.F}/{ROSTER_SIZE.F}</span>}>Ваш состав · {ids.length}</SectionTitle>
      <div className="glass rounded-3xl py-1">
        {players.map((p) => (
          <PlayerRow key={p.id} p={p} L={L} showTeam right={<button onClick={(e) => { e.stopPropagation(); act((L) => setCoachRoster(L, ids.filter((x) => x !== p.id))); }} className="press w-8 h-8 rounded-full bg-white/10 flex items-center justify-center mr-1" aria-label="Убрать"><Icon name="close" size={14} /></button>} />
        ))}
      </div>
      <div className="flex gap-2 mt-2">
        <Button full onClick={onAdd} icon={<Icon name="plus" size={16} />}>Добавить игрока</Button>
        <Button full onClick={() => { act((L) => setCoachRoster(L, autoRoster(L, T, code))); toast('Штаб собрал оптимальный состав', 'good'); }}>Автосостав</Button>
      </div>
      {(n.G < 2 || n.D < 6 || n.F < 12) && <div className="text-[12.5px] text-warn mt-2 px-1">Для матча нужны минимум 2 вратаря, 6 защитников и 12 нападающих — иначе федерация добавит игроков сама.</div>}
    </>
  );
}

function AddSheet({ open, onClose, T, code }: { open: boolean; onClose: () => void; T: Tournament; code: string }) {
  const L = useL();
  const { act } = useGame.getState();
  const [pos, setPos] = useState<'F' | 'D' | 'G'>('F');
  const ids = T.rosters[code] ?? [];
  const list = useMemo(() => eligible(L, T, code).filter((p: Player) => !ids.includes(p.id) && (pos === 'G' ? p.pos === 'G' : pos === 'D' ? p.pos === 'D' : p.pos !== 'G' && p.pos !== 'D')).sort((a, b) => b.ovr - a.ovr).slice(0, 40), [L, T, code, ids, pos]);
  return (
    <Sheet open={open} onClose={onClose} title={`Кандидаты: ${nat(code)}`} full>
      <Chips value={pos} onChange={setPos} options={[{ v: 'F', label: 'Нападающие' }, { v: 'D', label: 'Защитники' }, { v: 'G', label: 'Вратари' }]} />
      <div className="text-[12px] text-muted mt-2 px-1">Доступны игроки, чьи клубы не играют в плей-офф, без серьёзных травм. Максимум 28 человек.</div>
      <div className="flex flex-col gap-1 mt-2">
        {list.map((p) => (
          <PlayerRow key={p.id} p={p} L={L} showTeam sub={`${POS_RU[p.pos]} · ${p.team ? L.teams[p.team]?.short ?? p.team : p.lg ?? ''}`} onClick={() => { act((L) => setCoachRoster(L, [...ids, p.id])); onClose(); }} />
        ))}
      </div>
    </Sheet>
  );
}
