// Player career screens: home (replaces the GM office), contract & agent, the club, career summary.
import { useState } from 'react';
import { motion } from 'motion/react';
import { useGame, useL } from '../../store/game';
import { useNav } from '../../store/nav';
import type { GoalieLine, League, Player, SkaterLine } from '../../engine/types';
import { Screen, Sheet, Dialog, Icon } from '../components/shell';
import { Button, Card, cx, Empty, Meter, Ovr, Pill, SectionTitle } from '../components/kit';
import { PlayerPhoto, TeamLogo } from '../components/media';
import { PlayerRow } from '../components/rows';
import { Sparkline } from '../components/charts';
import { ATTR_RU, dateLong, dateShort, dow, flag, money, POS_FULL, POS_RU, seasonLabel, toi } from '../format';
import { LG_RU, lgOf, proPlayer, teamLg } from '../../engine/leagues';
import { acceptProOffer, askIceTime, askTrade, declineProOffer, farmKey, nextLineTarget, proCanAsk, proOnMarket, proRole, proSeasonLine, retirePro } from '../../engine/pro';
import { nextUserGame } from '../../engine/season';
import { gameWinProb } from '../../engine/projection';
import { draftPool, publicRank } from '../../engine/draft';
import { NATIONS, nationOf } from '../../engine/intl';
import { gaa, statKey, svPct } from '../../engine/stats';
import { ageOn } from '../../engine/util';
import { unreadCount } from '../../engine/news';
import { placeInConference, placeInDivision } from '../../engine/standings';
import { SimDock } from './SimOverlay';
import { NewsItem } from './News';
import { MessageView } from './Inbox';
import type { Message } from '../../engine/types';
import { achievementsFor } from '../../engine/achievements';
import { AWARD_NAMES } from '../../engine/awards';

const roleText = (L: League, p: Player) => {
  if (!p.team) return 'без клуба';
  if (p.st === 'AHL') return `фарм (${lgOf(L.teams[p.team]) === 'KHL' ? 'ВХЛ' : 'АХЛ'})`;
  const r = proRole(L, p);
  if (!r) return 'в запасе';
  if (p.pos === 'G') return r === 1 ? 'основной вратарь' : 'второй вратарь';
  return `${r}-е ${p.pos === 'D' ? 'пара' : 'звено'}`;
};

export function ProHome() {
  const L = useL();
  const nav = useNav();
  const p = proPlayer(L);
  const [msg, setMsg] = useState<Message | null>(null);
  const [focus, setFocus] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  const [retireAsk, setRetireAsk] = useState(false);
  if (!p) return <Screen title="Карьера"><Empty title="Игрок не найден" /></Screen>;
  const P = L.pro!;
  const t = p.team ? L.teams[p.team] : null;
  const age = ageOn(p.bd, L.date);
  const unread = L.inbox.filter((m) => !m.read).slice(0, 3);
  if (P.retired) return <ProRetired />;
  const canAsk = proCanAsk(L);
  const target = nextLineTarget(L, p);
  return (
    <Screen
      title="Карьера"
      subtitle={`${p.fn} ${p.ln} · ${dateLong(L.date)}`}
      right={
        <button onClick={() => nav.push('inbox')} className="press relative w-11 h-11 flex items-center justify-center rounded-full glass" aria-label="Входящие">
          <Icon name="mail" size={21} />
          {unreadCount(L) > 0 && <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-bad text-[11px] font-semibold flex items-center justify-center">{unreadCount(L)}</span>}
        </button>
      }
    >
      {/* Hero */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="relative rounded-[28px] overflow-hidden p-[1px]" style={{ background: 'linear-gradient(135deg, var(--accent), rgba(255,255,255,0.08) 45%, rgba(255,255,255,0.03))' }}>
        <div className="rounded-[27px] p-4" style={{ background: 'linear-gradient(120deg, color-mix(in oklab, var(--team) 55%, #070b14), #070b14 65%)' }}>
          <div className="flex items-center gap-4">
            <PlayerPhoto p={p} L={L} size={84} />
            <div className="flex-1 min-w-0">
              <div className="text-[12px] uppercase tracking-[0.16em] text-white/65">{POS_FULL[p.pos]} · {age} лет · {flag(p.ctry)}{p.num != null ? ` · №${p.num}` : ''}</div>
              <div className="font-display uppercase text-[22px] leading-[1.05] mt-1 break-words">{p.fn} {p.ln}</div>
              <div className="flex items-center gap-2 mt-2">
                {t ? <TeamLogo id={t.id} size={26} /> : null}
                <span className="text-[14px] text-white/80 truncate">{t ? `${t.name} · ${LG_RU[lgOf(t)]}` : 'Свободный агент'}</span>
              </div>
            </div>
            <div className="flex flex-col items-center">
              <Ovr v={p.ovr} size={52} />
              <div className="text-[10.5px] text-white/60 mt-1">потолок ~{p.pot}</div>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5 mt-3">
            <Pill color="var(--accent)">{roleText(L, p)}</Pill>
            {p.inj && <Pill color="#ff5a5f">🩹 {p.inj.type} · {p.inj.days} дн.</Pill>}
            {p.form > 0.25 && <Pill color="#ffb547">🔥 в форме</Pill>}
            {p.form < -0.25 && <Pill color="#7fd3ff">🧊 спад</Pill>}
            {p.rights && <Pill color="#e8c26a">права НХЛ: {L.teams[p.rights]?.short}</Pill>}
            {P.pending && <Pill color="#3ddc97">с 1 июля: {L.teams[P.pending.team]?.short}</Pill>}
          </div>
        </div>
      </motion.div>

      <NextGame />
      <SeasonCard p={p} />

      {/* Coach & mood */}
      <div className="grid grid-cols-2 gap-2 mt-3">
        <Card className="!py-3">
          <div className="text-[11px] uppercase tracking-wider text-muted">Доверие тренера</div>
          <div className="num text-[24px] leading-tight">{P.trust}<span className="text-[13px] text-muted">/100</span></div>
          <Meter value={P.trust} className="mt-1.5" color={P.trust < 35 ? '#ff5a5f' : P.trust < 60 ? '#ffb547' : '#3ddc97'} />
        </Card>
        <Card className="!py-3">
          <div className="text-[11px] uppercase tracking-wider text-muted">Настроение</div>
          <div className="num text-[24px] leading-tight">{p.morale}<span className="text-[13px] text-muted">/100</span></div>
          <Meter value={p.morale} className="mt-1.5" color={p.morale < 35 ? '#ff5a5f' : p.morale < 60 ? '#ffb547' : '#3ddc97'} />
        </Card>
      </div>
      {target != null && p.st === 'NHL' && <div className="text-[12.5px] text-muted mt-2 px-1">Чтобы подняться на звено выше, нужен уровень ~{target} (сейчас {p.ovr}).</div>}

      <DraftCard p={p} />
      <NationalCard p={p} />

      {/* Training & requests */}
      <SectionTitle>Развитие и решения</SectionTitle>
      <Card>
        <div className="flex items-center gap-3">
          <div className="text-[26px]">🏋️</div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-[15px]">Фокус тренировок</div>
            <div className="text-[12.5px] text-muted">{p.focus ? `Сейчас: ${ATTR_RU[p.focus]}. Упор даёт +2–3 к навыку в летнем лагере.` : 'Не выбран — навыки растут равномерно.'}</div>
          </div>
          <Button size="sm" onClick={() => setFocus(true)}>Выбрать</Button>
        </div>
      </Card>
      <div className="grid grid-cols-2 gap-2 mt-2">
        <Button full disabled={!canAsk || !t} onClick={() => setAnswer(useGame.getState().act((L) => askIceTime(L)))}>Больше игрового времени</Button>
        <Button full disabled={!canAsk || !t} onClick={() => setAnswer(useGame.getState().act((L) => askTrade(L)))}>Попросить обмен</Button>
      </div>
      {!canAsk && <div className="text-[12px] text-muted mt-1.5 px-1">Следующий разговор с тренером или GM — через несколько недель после прошлого.</div>}
      {(age >= 30 || L.phase === 'offseason') && <Button full variant="danger" className="mt-2" onClick={() => setRetireAsk(true)}>Завершить карьеру</Button>}

      {/* Inbox */}
      {unread.length > 0 && (
        <>
          <SectionTitle right={<button className="text-[13px] accent-text press" onClick={() => nav.push('inbox')}>Все</button>}>Входящие</SectionTitle>
          <Card pad={false} className="overflow-hidden">
            {unread.map((m, i) => (
              <div key={m.id} onClick={() => { m.read = true; setMsg(m); useGame.getState().touch(); }} className={cx('press px-4 py-3 flex gap-3 active:bg-white/5', i && 'border-t hairline')}>
                <div className="w-2 h-2 rounded-full accent-bg mt-2 shrink-0" />
                <div className="min-w-0">
                  <div className="text-[12px] text-muted truncate">{m.from}</div>
                  <div className="font-semibold text-[15px] truncate">{m.title}</div>
                </div>
              </div>
            ))}
          </Card>
        </>
      )}
      <SectionTitle right={<button className="text-[13px] accent-text press" onClick={() => nav.push('news')}>Лента</button>}>Новости</SectionTitle>
      <div className="flex flex-col gap-2">{L.news.slice(0, 5).map((n) => <NewsItem key={n.id} n={n} />)}</div>

      <Sheet open={!!msg} onClose={() => setMsg(null)} title={msg?.title}>{msg && <MessageView m={msg} onClose={() => setMsg(null)} />}</Sheet>
      <Sheet open={focus} onClose={() => setFocus(false)} title="Фокус тренировок">
        <p className="text-[14px] text-muted mb-3">Тренеры сделают упор на выбранный навык в летнем лагере (+2–3 к навыку, остальные растут чуть медленнее). Те же правила, что и для всех игроков лиги.</p>
        <div className="grid grid-cols-2 gap-2">
          {(p.pos === 'G' ? ['po', 'rf', 'rb', 'cs', 'mn', 'pk'] : ['sk', 'sh', 'pa', 'ha', 'oi', 'di', 'ph', ...(p.pos === 'C' ? ['fo'] : [])]).map((k) => (
            <Button key={k} variant={p.focus === k ? 'primary' : 'glass'} onClick={() => { useGame.getState().act(() => (p.focus = k as Player['focus'])); setFocus(false); }}>{ATTR_RU[k]}</Button>
          ))}
        </div>
      </Sheet>
      <Dialog open={!!answer} onClose={() => setAnswer(null)}>
        <div className="text-[15px] leading-relaxed">{answer}</div>
        <Button full variant="primary" className="mt-4" onClick={() => setAnswer(null)}>Понятно</Button>
      </Dialog>
      <Dialog open={retireAsk} onClose={() => setRetireAsk(false)}>
        <div className="font-display uppercase text-[19px]">Завершить карьеру?</div>
        <p className="text-[14px] text-muted mt-2">Это нельзя отменить. Итоги карьеры останутся в разделе «Ещё → Карьера».</p>
        <div className="flex gap-2 mt-4">
          <Button full onClick={() => setRetireAsk(false)}>Ещё поиграю</Button>
          <Button full variant="danger" onClick={() => { useGame.getState().act((L) => retirePro(L)); setRetireAsk(false); }}>Завершить</Button>
        </div>
      </Dialog>
      <SimDock />
    </Screen>
  );
}

function NextGame() {
  const L = useL();
  const g = nextUserGame(L);
  const p = proPlayer(L)!;
  if (!g || !p.team) return null;
  const home = g.h === p.team;
  const pr = gameWinProb(L, g.h, g.a, !!g.series);
  const series = g.series ? (g.lg === 'KHL' ? L.khl?.playoffs : L.playoffs)?.series.find((s) => s.id === g.series) : null;
  return (
    <Card className="mt-3">
      <div className="flex items-center justify-between text-[11.5px] uppercase tracking-[0.14em] text-muted">
        <span>{series ? `Плей-офф · матч ${series.wHi + series.wLo + 1}` : 'Следующий матч'}</span>
        <span>{dow(g.day)}, {dateShort(g.day)}</span>
      </div>
      <div className="flex items-center gap-3 mt-2.5">
        <TeamLogo id={g.h} size={40} />
        <div className="flex-1 text-center">
          <div className="font-display uppercase text-[15px]">{L.teams[g.h].short} — {L.teams[g.a].short}</div>
          <div className="text-[12.5px] text-muted">{home ? 'дома' : 'в гостях'} · шанс победы <span className="num text-ink">{Math.round((home ? pr : 1 - pr) * 100)}%</span></div>
        </div>
        <TeamLogo id={g.a} size={40} />
      </div>
      <Button size="sm" full className="mt-3" onClick={() => useGame.getState().simulate('game', undefined, { watch: true })} icon={<Icon name="eye" size={16} />}>Смотреть матч</Button>
    </Card>
  );
}

function SeasonCard({ p }: { p: Player }) {
  const L = useL();
  const lines = proSeasonLine(p, L.season);
  const farm = p.stats[farmKey(L.season)];
  const lg = teamLg(L, p.team) ?? 'NHL';
  const key = statKey(L.season, false, lg);
  const cur = p.stats[key];
  return (
    <>
      <SectionTitle>Сезон {seasonLabel(L.season)}</SectionTitle>
      {!lines.length && !farm && <Card><div className="text-[14px] text-muted">Матчей в сезоне пока нет.</div></Card>}
      {cur && (p.pos === 'G' ? (
        <div className="grid grid-cols-4 gap-2">
          <Mini k="Игры" v={(cur as GoalieLine).gp} />
          <Mini k="Победы" v={(cur as GoalieLine).w} />
          <Mini k="%ОБ" v={svPct(cur as GoalieLine).toFixed(3).slice(1)} />
          <Mini k="КН" v={gaa(cur as GoalieLine).toFixed(2)} />
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-2">
          <Mini k="Игры" v={(cur as SkaterLine).gp} />
          <Mini k="Голы" v={(cur as SkaterLine).g} />
          <Mini k="Передачи" v={(cur as SkaterLine).a} />
          <Mini k="Очки" v={(cur as SkaterLine).pts} />
          <Mini k="+/−" v={(cur as SkaterLine).pm} />
          <Mini k="Броски" v={(cur as SkaterLine).sog} />
          <Mini k="Время" v={toi((cur as SkaterLine).toi, (cur as SkaterLine).gp)} />
          <Mini k="Лига" v={LG_RU[lg]} />
        </div>
      ))}
      {farm && farm.gp > 0 && (
        <div className="text-[12.5px] text-muted mt-2 px-1">
          Фарм ({lg === 'KHL' ? 'ВХЛ' : 'АХЛ'}, оценка): {p.pos === 'G' ? `${farm.gp} И, ${(farm as GoalieLine).w} В, ${svPct(farm as GoalieLine).toFixed(3)}` : `${farm.gp} И, ${(farm as SkaterLine).g}+${(farm as SkaterLine).a}=${(farm as SkaterLine).pts}`}
        </div>
      )}
    </>
  );
}

function Mini({ k, v }: { k: string; v: React.ReactNode }) {
  return <div className="glass rounded-2xl px-2.5 py-2 min-w-0"><div className="text-[10.5px] uppercase text-muted truncate">{k}</div><div className="num text-[18px] truncate">{v}</div></div>;
}

function DraftCard({ p }: { p: Player }) {
  const L = useL();
  if (p.dr) {
    return (
      <Card className="mt-3 flex items-center gap-3">
        <div className="text-[28px]">🎯</div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-[15px]">Драфт НХЛ {p.dr.y}: №{p.dr.p}, {p.dr.r}-й раунд</div>
          <div className="text-[12.5px] text-muted">{p.rights ? `Права у ${L.teams[p.rights]?.name} до ${(p.rightsUntil ?? L.season) + 1} года. После контракта в КХЛ они могут предложить контракт новичка.` : `Выбран клубом ${L.teams[p.dr.t]?.name ?? p.dr.t}.`}</div>
        </div>
        <TeamLogo id={p.dr.t} size={36} />
      </Card>
    );
  }
  const year = L.draft && !L.draft.done ? L.draft.year : L.season + 1;
  const inPool = draftPool(L, year).some((x) => x.id === p.id);
  if (!inPool) return null;
  const rank = publicRank(L, year).findIndex((x) => x.id === p.id) + 1;
  return (
    <Card className="mt-3 flex items-center gap-3">
      <div className="text-[28px]">🎯</div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-[15px]">Драфт НХЛ {year} · 26 июня</div>
        <div className="text-[12.5px] text-muted">Рейтинг скаутов: №{rank} среди проспектов. Клуб, который вас выберет, получит права — а вы останетесь в КХЛ до конца контракта.</div>
      </div>
    </Card>
  );
}

function NationalCard({ p }: { p: Player }) {
  const L = useL();
  const nav = useNav();
  const T = L.intl?.current;
  const n = nationOf(p);
  if (!T || !n) return null;
  const inField = T.teams.includes(n);
  const named = T.named && inField && T.rosters[n]?.includes(p.id);
  return (
    <Card className="mt-3 flex items-center gap-3" onClick={() => nav.go('more', 'intl')}>
      <div className="text-[28px]">{flag(n)}</div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-[15px]">{T.name}</div>
        <div className="text-[12.5px] text-muted">
          {!inField ? `${NATIONS[n].name} ${n === 'RUS' || n === 'BLR' ? 'отстранена IIHF' : 'не участвует'} в этом турнире.` : named ? 'Вы в составе сборной!' : T.named ? 'В этот раз без вас.' : `Состав объявят ${dateShort(T.select)}. Выбирают лучших по уровню и форме.`}
        </div>
      </div>
      <Icon name="league" size={20} className="text-muted" />
    </Card>
  );
}

function ProRetired() {
  const L = useL();
  const p = proPlayer(L)!;
  return (
    <Screen title="Карьера завершена" subtitle={`${p.fn} ${p.ln}`}>
      <Card className="text-center !py-6">
        <div className="text-[44px]">🏒</div>
        <div className="font-display uppercase text-[24px] mt-2">{p.fn} {p.ln}</div>
        <div className="text-[14px] text-muted mt-1">{seasonLabel(L.pro!.season0)} — {seasonLabel(p.retired ?? L.season)}</div>
      </Card>
      <CareerSummary p={p} />
      <Button full variant="primary" className="mt-4" onClick={() => useGame.getState().quit()}>В главное меню</Button>
    </Screen>
  );
}

// ---------- Contract & agent ----------

export function ProContract() {
  const L = useL();
  const p = proPlayer(L);
  const { act, toast } = useGame.getState();
  const [confirm, setConfirm] = useState<number | null>(null);
  if (!p) return <Screen title="Контракт"><Empty title="Нет игрока" /></Screen>;
  const P = L.pro!;
  const offers = P.offers.filter((o) => o.expires >= L.date);
  const lg = teamLg(L, p.team);
  const offer = offers.find((o) => o.id === confirm);
  return (
    <Screen title="Контракт" subtitle={`Агент: ${P.agent}`}>
      <SectionTitle className="!mt-1">Текущий контракт</SectionTitle>
      {p.c && p.team ? (
        <Card>
          <div className="flex items-center gap-3">
            <TeamLogo id={p.team} size={44} />
            <div className="flex-1 min-w-0">
              <div className="font-display uppercase text-[18px] truncate">{L.teams[p.team].name}</div>
              <div className="text-[12.5px] text-muted">{LG_RU[lgOf(L.teams[p.team])]} · до конца сезона {seasonLabel(p.c.last)}{p.c.type === 'ELC' ? ' · контракт новичка' : ''}</div>
            </div>
            <div className="text-right">
              <div className="num text-[22px]">{money(p.c.aav, 2, lg ?? 'NHL')}</div>
              <div className="text-[11px] text-muted">в сезон</div>
            </div>
          </div>
          {p.ext && <div className="text-[13px] text-good mt-2">Продление: {money(p.ext.aav, 2, lg ?? 'NHL')} до {seasonLabel(p.ext.last)}</div>}
        </Card>
      ) : (
        <Card><div className="text-[14px]">Вы свободный агент. Агент ищет клуб — предложения приходят каждую неделю.</div></Card>
      )}
      {P.pending && (
        <Card className="mt-2 border-good/30">
          <div className="text-[14px]">✍️ Договорённость: с 1 июля вы — игрок <b>{L.teams[P.pending.team]?.name}</b> ({P.pending.years} × {money(P.pending.aav, 2, teamLg(L, P.pending.team) ?? 'NHL')}{P.pending.kind === 'ELC' ? ', контракт новичка' : ''}).</div>
        </Card>
      )}
      {p.rights && <Card className="mt-2"><div className="text-[13.5px] text-muted">Права в НХЛ: <b className="text-ink">{L.teams[p.rights]?.name}</b> до {(p.rightsUntil ?? L.season) + 1}. Другие клубы НХЛ не могут вас подписать, клубы КХЛ — могут.</div></Card>}

      <SectionTitle>Предложения · {offers.length}</SectionTitle>
      {!offers.length && (
        <Card>
          <div className="text-[13.5px] text-muted leading-relaxed">
            {proOnMarket(L, p)
              ? 'Агент ведёт переговоры. Новые предложения приходят по понедельникам.'
              : 'Переговоры откроются в мае, в последний сезон вашего контракта (или сразу, если вы без клуба). Клубы смотрят на уровень игры, возраст и потенциал; права драфта НХЛ закрывают путь в другие клубы НХЛ.'}
          </div>
        </Card>
      )}
      <div className="flex flex-col gap-2">
        {offers.map((o) => {
          const t = L.teams[o.team];
          const olg = lgOf(t);
          return (
            <Card key={o.id}>
              <div className="flex items-center gap-3">
                <TeamLogo id={o.team} size={42} />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-[15.5px] truncate">{t.name}</div>
                  <div className="text-[12.5px] text-muted truncate">{LG_RU[olg]} · {o.note}</div>
                </div>
                <div className="text-right">
                  <div className="num text-[19px]">{money(o.aav, 2, olg)}</div>
                  <div className="text-[11px] text-muted">× {o.years} {o.years === 1 ? 'сезон' : o.years < 5 ? 'сезона' : 'сезонов'}{o.kind === 'ELC' ? ' · ELC' : ''}</div>
                </div>
              </div>
              <div className="flex gap-2 mt-3">
                <Button size="sm" full onClick={() => act((L) => declineProOffer(L, o.id))}>Отклонить</Button>
                <Button size="sm" full variant="primary" onClick={() => setConfirm(o.id)}>Принять</Button>
              </div>
              <div className="text-[11.5px] text-faint mt-2">Действует до {dateShort(o.expires)}</div>
            </Card>
          );
        })}
      </div>
      <div className="text-[12px] text-muted mt-3 px-1">Зарплаты в КХЛ — в рублях (налог в России 13–15%), в НХЛ — в долларах (налоги в Северной Америке выше). Курс для пересчёта — ориентир.</div>
      <Dialog open={!!offer} onClose={() => setConfirm(null)}>
        {offer && (
          <>
            <div className="font-display uppercase text-[19px]">Подписать контракт?</div>
            <p className="text-[14.5px] text-muted mt-2">{L.teams[offer.team].name}: {offer.years} × {money(offer.aav, 2, lgOf(L.teams[offer.team]))}. Остальные предложения сгорят.</p>
            <div className="flex gap-2 mt-4">
              <Button full onClick={() => setConfirm(null)}>Отмена</Button>
              <Button full variant="primary" onClick={() => { const r = act((L) => acceptProOffer(L, offer.id)); toast(r.message, r.ok ? 'good' : 'bad'); setConfirm(null); }}>Подписать</Button>
            </div>
          </>
        )}
      </Dialog>
      <SimDock />
    </Screen>
  );
}

// ---------- The club ----------

export function ProTeam() {
  const L = useL();
  const nav = useNav();
  const p = proPlayer(L);
  const t = p?.team ? L.teams[p.team] : null;
  if (!p || !t) return <Screen title="Команда"><Empty icon="🧳" title="Вы без клуба" text="Агент ищет варианты — загляните во вкладку «Контракт»." /><SimDock /></Screen>;
  const khl = lgOf(t) === 'KHL';
  const main = Object.values(L.players).filter((x) => x.team === t.id && x.st === 'NHL').sort((a, b) => b.ovr - a.ovr);
  const farm = Object.values(L.players).filter((x) => x.team === t.id && x.st === 'AHL').sort((a, b) => b.ovr - a.ovr);
  const place = khl ? placeInConference(L, t.id) : placeInDivision(L, t.id);
  const Tile = ({ id }: { id?: number }) => {
    const x = id != null ? L.players[id] : null;
    return (
      <button onClick={() => x && nav.push('player', { id: x.id })} className={cx('press flex-1 min-w-0 rounded-2xl p-2 flex flex-col items-center gap-1 border', x?.id === p.id ? 'border-[var(--accent)] bg-[color-mix(in_oklab,var(--accent)_18%,transparent)]' : 'glass')}>
        {x ? (<><PlayerPhoto p={x} L={L} size={34} /><div className="text-[12px] font-medium truncate w-full text-center">{x.ln}</div><div className="num text-[13px]">{x.ovr}</div></>) : <div className="h-[64px] flex items-center text-muted text-[12px]">—</div>}
      </button>
    );
  };
  return (
    <Screen title={t.name} subtitle={`${t.rec.w}–${t.rec.l}–${t.rec.otl} · ${t.rec.pts} оч. · ${place}-е место${khl ? ' в конференции' : ' в дивизионе'}`}>
      <div className="flex items-center gap-4 py-2">
        <TeamLogo id={t.id} size={64} />
        <div className="flex-1 min-w-0">
          <div className="text-[13px] text-muted">Главный тренер {t.coach.name} · рейтинг {t.coach.rating}</div>
          <div className="text-[13px] text-muted mt-1">Звенья ставит тренер — по уровню игроков. Ваше место: <b className="text-ink">{roleText(L, p)}</b>.</div>
        </div>
      </div>
      <SectionTitle className="!mt-2">Нападение</SectionTitle>
      <div className="flex flex-col gap-2">
        {t.lines.f.map((l, i) => <div key={i} className="flex gap-2 items-center"><div className="w-4 text-muted font-display text-[13px]">{i + 1}</div><Tile id={l[0]} /><Tile id={l[1]} /><Tile id={l[2]} /></div>)}
      </div>
      <SectionTitle>Защита</SectionTitle>
      <div className="flex flex-col gap-2">
        {t.lines.d.map((l, i) => <div key={`d${i}`} className="flex gap-2 items-center"><div className="w-4 text-muted font-display text-[13px]">{i + 1}</div><Tile id={l[0]} /><Tile id={l[1]} /><div className="flex-1" /></div>)}
      </div>
      <SectionTitle>Вратари</SectionTitle>
      <div className="flex gap-2 items-center"><div className="w-4" /><Tile id={t.lines.g[0]} /><Tile id={t.lines.g[1]} /><div className="flex-1" /></div>
      <SectionTitle>Основной состав · {main.length}</SectionTitle>
      <div className="glass rounded-3xl py-1">{main.map((x) => <PlayerRow key={x.id} p={x} L={L} />)}</div>
      {farm.length > 0 && (
        <>
          <SectionTitle>Фарм ({khl ? 'ВХЛ' : 'АХЛ'}) · {farm.length}</SectionTitle>
          <div className="glass rounded-3xl py-1">{farm.map((x) => <PlayerRow key={x.id} p={x} L={L} showPot />)}</div>
        </>
      )}
      <SimDock />
    </Screen>
  );
}

// ---------- Career summary ----------

function CareerSummary({ p }: { p: Player }) {
  const L = useL();
  const seasons: { season: number; lg: string; gp: number; g: number; a: number; pts: number; extra?: string }[] = [];
  const keys = Object.keys(p.stats).filter((k) => /^\d{4}(rK?|rF)$/.test(k)).sort();
  for (const k of keys) {
    const s = p.stats[k];
    if (!s?.gp) continue;
    const season = Number(k.slice(0, 4));
    const lg = k.endsWith('F') ? (p.teams.some((t) => L.teams[t]?.lg === 'KHL') && !p.teams.some((t) => !L.teams[t]?.lg) ? 'ВХЛ*' : 'Фарм*') : k.endsWith('K') ? 'КХЛ' : 'НХЛ';
    if (p.pos === 'G') {
      const g = s as GoalieLine;
      seasons.push({ season, lg, gp: g.gp, g: g.w, a: g.so, pts: 0, extra: svPct(g).toFixed(3).slice(1) });
    } else {
      const k2 = s as SkaterLine;
      seasons.push({ season, lg, gp: k2.gp, g: k2.g, a: k2.a, pts: k2.pts });
    }
  }
  const tot = (lg: string) => seasons.filter((x) => x.lg === lg).reduce((a, x) => ({ gp: a.gp + x.gp, g: a.g + x.g, a: a.a + x.a, pts: a.pts + x.pts }), { gp: 0, g: 0, a: 0, pts: 0 });
  const nhl = tot('НХЛ'), khl = tot('КХЛ');
  const medals = (p.intl ?? []).filter((x) => x.split(':').length === 3);
  const trophies = p.awards.filter((a) => !a.startsWith('potm') && AWARD_NAMES[a.split(':')[0]]);
  const hist = p.hist.slice(-12);
  return (
    <>
      <div className="grid grid-cols-2 gap-2 mt-3">
        <Card className="!py-3"><div className="text-[11px] uppercase text-muted">НХЛ</div><div className="num text-[20px]">{nhl.gp} И · {p.pos === 'G' ? `${nhl.g} В` : `${nhl.pts} О`}</div>{p.pos !== 'G' && <div className="text-[12px] text-muted">{nhl.g} голов, {nhl.a} передач</div>}</Card>
        <Card className="!py-3"><div className="text-[11px] uppercase text-muted">КХЛ</div><div className="num text-[20px]">{khl.gp} И · {p.pos === 'G' ? `${khl.g} В` : `${khl.pts} О`}</div>{p.pos !== 'G' && <div className="text-[12px] text-muted">{khl.g} голов, {khl.a} передач</div>}</Card>
      </div>
      {(medals.length > 0 || trophies.length > 0) && (
        <>
          <SectionTitle>Трофеи</SectionTitle>
          <div className="flex flex-wrap gap-1.5">
            {medals.map((m) => { const [k, y, c] = m.split(':'); return <Pill key={m} color={c === 'gold' ? '#e8c26a' : c === 'silver' ? '#c9d4e4' : '#c08a5a'}>{c === 'gold' ? '🥇' : c === 'silver' ? '🥈' : '🥉'} {k === 'og' ? 'ОИ' : 'ЧМ'}-{y}</Pill>; })}
            {trophies.map((a) => <Pill key={a} color="#e8c26a">🏆 {awardName(a)}</Pill>)}
          </div>
        </>
      )}
      {hist.length >= 2 && (
        <>
          <SectionTitle>Рост рейтинга</SectionTitle>
          <Card className="flex justify-center"><Sparkline values={hist.map((h) => h[1])} labels={hist.map((h) => String(h[0]).slice(2))} width={300} height={70} /></Card>
        </>
      )}
      <SectionTitle>По сезонам</SectionTitle>
      {seasons.length ? (
        <Card pad={false} className="overflow-hidden">
          <table className="w-full text-[13px] tnum">
            <thead><tr className="text-muted text-[11px]"><th className="text-left font-medium px-3 py-2">Сезон</th><th className="text-left font-medium">Лига</th>{(p.pos === 'G' ? ['И', 'В', 'СМ', '%ОБ'] : ['И', 'Г', 'П', 'О']).map((h) => <th key={h} className="font-medium text-right pr-3">{h}</th>)}</tr></thead>
            <tbody>
              {seasons.map((x, i) => (
                <tr key={i} className="border-t hairline">
                  <td className="px-3 py-2">{seasonLabel(x.season)}</td>
                  <td className="text-muted">{x.lg}</td>
                  <td className="text-right pr-3">{x.gp}</td>
                  <td className="text-right pr-3">{x.g}</td>
                  <td className="text-right pr-3">{x.a}</td>
                  <td className="text-right pr-3">{p.pos === 'G' ? x.extra : x.pts}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : <div className="text-muted text-[13.5px] px-1">Первый сезон впереди.</div>}
      <div className="text-[11.5px] text-faint mt-2 px-1">* Матчи фарм-клубов не симулируются полностью: статистика — оценка по уровню игрока.</div>
    </>
  );
}

export const awardName = (a: string) => { const [k, y] = a.split(':'); return `${(AWARD_NAMES[k] ?? k).split(' — ')[0]} ${y ?? ''}`.trim(); };

export function ProCareerScreen() {
  const L = useL();
  const p = proPlayer(L);
  if (!p) return <Screen title="Карьера"><Empty title="Нет игрока" /></Screen>;
  const ach = achievementsFor(L);
  const got = ach.filter((a) => L.achievements[a.id]).length;
  return (
    <Screen title="Карьера игрока" subtitle={`${p.fn} ${p.ln} · с ${seasonLabel(L.pro!.season0)}`}>
      <Card className="flex items-center gap-3">
        <PlayerPhoto p={p} L={L} size={56} />
        <div className="flex-1 min-w-0">
          <div className="font-display uppercase text-[19px] truncate">{p.fn} {p.ln}</div>
          <div className="text-[12.5px] text-muted">{POS_RU[p.pos]} · {ageOn(p.bd, L.date)} лет · клубы: {p.teams.map((t) => L.teams[t]?.short ?? t).join(' → ')}</div>
        </div>
        <Ovr v={p.ovr} size={44} />
      </Card>
      <div className="text-[12.5px] text-muted mt-2 px-1">Достижения: {got} из {ach.length}</div>
      <CareerSummary p={p} />
    </Screen>
  );
}
