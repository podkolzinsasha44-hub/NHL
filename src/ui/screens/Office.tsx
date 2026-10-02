import { motion } from 'motion/react';
import { useEffect, useMemo, useState } from 'react';
import { useL, useGame } from '../../store/game';
import { useNav } from '../../store/nav';
import { Screen, Icon, Sheet } from '../components/shell';
import { Button, Card, cx, Meter, Pill, SectionTitle } from '../components/kit';
import { TeamLogo } from '../components/media';
import { Ring, Sparkline } from '../components/charts';
import { daysBetween } from '../../engine/util';
import { SimDock } from './SimOverlay';
import { dateLong, dateShort, dow, money, phaseLabel, recordStr, seasonLabel } from '../format';
import { nextUserGame } from '../../engine/season';
import { placeInDivision } from '../../engine/standings';
import { DIV_NAMES } from '../../engine/standings';
import { gameWinProb, seasonOdds } from '../../engine/projection';
import { capSummary } from '../../engine/contracts';
import { unreadCount } from '../../engine/news';
import { assistantTips } from '../assistant';
import { NewsItem } from './News';
import { Term } from '../components/Term';
import type { Message } from '../../engine/types';
import { MessageView } from './Inbox';

export function Office() {
  const L = useL();
  const nav = useNav();
  const t = L.teams[L.user];
  const ng = nextUserGame(L);
  const odds = useMemo(() => (L.phase === 'regular' || L.phase === 'preseason' || L.phase === 'playoffs' ? seasonOdds(L, 250) : null), [L.date, L.phase, L.trades.length, L.user]); // eslint-disable-line react-hooks/exhaustive-deps
  const cap = capSummary(L, L.user);
  const tips = assistantTips(L).slice(0, 3);
  const unread = L.inbox.filter((m) => !m.read).slice(0, 3);
  const [msg, setMsg] = useState<Message | null>(null);
  const lastGame = L.lastUserGame ? L.games.find((g) => g.id === L.lastUserGame && g.played) : null;
  const my = odds?.[L.user];
  useEffect(() => {
    if (!my || L.phase !== 'regular') return;
    const h = L.oddsHist ?? [];
    const last = h[h.length - 1];
    if (!last || daysBetween(last[0], L.date) >= 7) {
      useGame.getState().act((L) => { (L.oddsHist ??= []).push([L.date, my.po, my.cup]); if (L.oddsHist.length > 40) L.oddsHist.shift(); });
    }
  }, [L.date]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Screen
      title="Офис GM"
      subtitle={`${L.gm.name} · ${dateLong(L.date)}`}
      right={
        <button onClick={() => nav.push('inbox')} className="press relative w-11 h-11 flex items-center justify-center rounded-full glass" aria-label="Входящие">
          <Icon name="mail" size={21} />
          {unreadCount(L) > 0 && <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-bad text-[11px] font-semibold flex items-center justify-center">{unreadCount(L)}</span>}
        </button>
      }
    >
      {/* Hero */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-4 pt-1 pb-4">
        <div className="relative">
          <div className="absolute inset-0 blur-2xl opacity-60 rounded-full" style={{ background: t.accent }} />
          <TeamLogo id={t.id} size={72} className="relative" />
        </div>
        <div className="min-w-0">
          <div className="text-[12px] uppercase tracking-[0.16em] text-muted">{phaseLabel(L)} · {seasonLabel(L.season)}</div>
          <div className="font-display uppercase text-[26px] leading-none mt-1 truncate">{t.short}</div>
          <div className="text-[14px] text-muted mt-1.5">
            <span className="num text-ink text-[16px]">{recordStr(t)}</span> · {t.rec.pts} оч. · {placeInDivision(L, t.id)}-е место, {DIV_NAMES[t.div]}
          </div>
          <div className="text-[12.5px] text-faint mt-0.5">{dow(L.date)}, {dateLong(L.date)}</div>
        </div>
      </motion.div>

      {/* Next game */}
      {ng && (L.phase === 'regular' || L.phase === 'playoffs' || L.phase === 'preseason') ? (
        <NextGameCard />
      ) : (
        <PhaseCard />
      )}

      {/* Projections */}
      {my && (
        <Card className="mt-3">
          <div className="flex items-center gap-4">
            <Ring value={my.po} label="плей-офф" size={70} />
            <Ring value={my.cup} label="кубок" size={70} color="#e8c26a" />
            <div className="flex-1 min-w-0">
              <div className="text-[11px] uppercase tracking-wider text-muted">Прогноз сезона</div>
              {L.phase !== 'playoffs' ? (
                <div className="num text-[24px] leading-tight">~{Math.round(my.pts)} <span className="text-[14px] text-muted font-sans">очков</span></div>
              ) : (
                <div className="num text-[20px] leading-tight">Финал: {Math.round(my.final * 100)}%</div>
              )}
              <div className="text-[12px] text-muted mt-0.5">Монте-Карло, 250 симуляций. Те же шансы, что использует движок.</div>
            </div>
          </div>
          {(L.oddsHist?.length ?? 0) >= 3 && (
            <div className="mt-3">
              <div className="text-[11px] uppercase tracking-wider text-muted mb-1">Шансы на плей-офф по неделям</div>
              <Sparkline values={L.oddsHist!.slice(-14).map((x) => Math.round(x[1] * 100))} width={Math.min(330, window.innerWidth - 64)} height={46} />
            </div>
          )}
        </Card>
      )}

      {/* Last game */}
      {lastGame && (
        <Card className="mt-3" onClick={() => nav.openModal('match', { id: lastGame.id })}>
          <div className="flex items-center gap-3">
            <div className="text-[11px] uppercase tracking-wider text-muted w-16 leading-tight">Последний матч<br />{dateShort(lastGame.day)}</div>
            <TeamLogo id={lastGame.h} size={30} />
            <div className="num text-[24px]">{lastGame.hs}<span className="text-muted mx-1">:</span>{lastGame.as}</div>
            <TeamLogo id={lastGame.a} size={30} />
            {lastGame.ot && <Pill>{lastGame.ot}</Pill>}
            <div className="flex-1" />
            <Pill color={(lastGame.h === L.user ? (lastGame.hs ?? 0) > (lastGame.as ?? 0) : (lastGame.as ?? 0) > (lastGame.hs ?? 0)) ? '#3ddc97' : '#ff5a5f'}>
              {(lastGame.h === L.user ? (lastGame.hs ?? 0) > (lastGame.as ?? 0) : (lastGame.as ?? 0) > (lastGame.hs ?? 0)) ? 'Победа' : 'Поражение'}
            </Pill>
          </div>
        </Card>
      )}

      {/* Assistant */}
      {L.settings.assistant && (
        <>
          <SectionTitle>Ассистент GM</SectionTitle>
          <div className="flex flex-col gap-2">
            {tips.map((tip) => (
              <Card key={tip.id} className={cx('flex gap-3 items-start', tip.level === 'bad' && 'border-bad/30', tip.level === 'warn' && 'border-warn/25')}>
                <div className="text-[22px] leading-none mt-0.5">{tip.icon}</div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-[15px]">{tip.title}</div>
                  <div className="text-[13.5px] text-muted mt-0.5">{tip.text}</div>
                  {tip.action && (
                    <button className="press mt-2 text-[13.5px] font-semibold accent-text" onClick={() => nav.go(tip.action!.tab, tip.action!.route, tip.action!.params)}>
                      {tip.action.label} →
                    </button>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </>
      )}

      {/* Owner + cap */}
      <div className="grid grid-cols-2 gap-2 mt-3">
        <Card onClick={() => nav.go('more', 'career')}>
          <div className="text-[11px] uppercase tracking-wider text-muted">Владелец</div>
          <div className="num text-[24px] leading-tight">{L.owner.trust}<span className="text-[13px] text-muted">/100</span></div>
          <Meter value={L.owner.trust} className="mt-1.5" color={L.owner.trust < 30 ? '#ff5a5f' : L.owner.trust < 55 ? '#ffb547' : '#3ddc97'} />
          <div className="text-[11.5px] text-muted mt-1.5 line-clamp-2">{L.owner.goalText}</div>
          <div className="text-[11.5px] text-muted mt-1">Трибуны: {Math.round(70 + t.fans * 0.3)}% · {t.fans >= 70 ? '🔥 аншлаги' : t.fans >= 45 ? 'спокойно' : '😠 свист'}</div>
        </Card>
        <Card onClick={() => nav.go('more', 'finance')}>
          <div className="text-[11px] uppercase tracking-wider text-muted"><Term k="cap">Под потолком</Term></div>
          <div className={cx('num text-[24px] leading-tight', cap.space < 0 && 'text-bad')}>{money(cap.space)}</div>
          <Meter value={cap.hit} max={cap.cap} className="mt-1.5" color={cap.space < 0 ? '#ff5a5f' : undefined} />
          <div className="text-[11.5px] text-muted mt-1.5">{money(cap.hit)} из {money(cap.cap, 1)} · {cap.contracts}/50 контр.</div>
        </Card>
      </div>

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

      {/* News */}
      <SectionTitle right={<button className="text-[13px] accent-text press" onClick={() => nav.push('news')}>Лента</button>}>Новости и соцсети</SectionTitle>
      <div className="flex flex-col gap-2">
        {L.news.slice(0, 6).map((n) => <NewsItem key={n.id} n={n} />)}
      </div>
      <Sheet open={!!msg} onClose={() => setMsg(null)} title={msg?.title}>
        {msg && <MessageView m={msg} onClose={() => setMsg(null)} />}
      </Sheet>
      <SimDock />
    </Screen>
  );
}

function NextGameCard() {
  const L = useL();
  const nav = useNav();
  const g = nextUserGame(L)!;
  const home = g.h === L.user;
  const opp = L.teams[home ? g.a : g.h];
  const p = gameWinProb(L, g.h, g.a);
  const pUser = home ? p : 1 - p;
  const rival = L.rivals.some(([a, b]) => (a === g.h && b === g.a) || (a === g.a && b === g.h));
  const series = g.series ? L.playoffs?.series.find((s) => s.id === g.series) : null;
  return (
    <div className="relative rounded-[28px] overflow-hidden p-[1px]" style={{ background: 'linear-gradient(135deg, var(--accent), rgba(255,255,255,0.08) 40%, rgba(255,255,255,0.03))' }}>
      <div className="relative rounded-[27px] p-4 overflow-hidden" style={{ background: `linear-gradient(120deg, color-mix(in oklab, var(--team) 55%, #070b14), #070b14 55%, color-mix(in oklab, ${opp.primary} 40%, #070b14))` }}>
        <div className="flex items-center justify-between text-[11.5px] uppercase tracking-[0.14em] text-white/70">
          <span>{series ? `Плей-офф · матч ${series.wHi + series.wLo + 1}` : g.special === 'classic' ? '❄️ Winter Classic' : 'Следующий матч'}</span>
          <span>{dow(g.day)}, {dateShort(g.day)}</span>
        </div>
        <div className="flex items-center justify-between mt-3">
          <div className="flex flex-col items-center w-24">
            <TeamLogo id={g.h} size={58} />
            <div className="font-display uppercase text-[14px] mt-1.5">{L.teams[g.h].short}</div>
            <div className="text-[11.5px] text-white/60">{recordStr(L.teams[g.h])}</div>
          </div>
          <div className="flex flex-col items-center">
            <div className="font-display text-[13px] text-white/60 uppercase tracking-widest">{home ? 'дома' : 'в гостях'}</div>
            <div className="num text-[34px] leading-none mt-1">{Math.round(pUser * 100)}%</div>
            <div className="text-[11px] text-white/60 mt-0.5">шанс победы</div>
            {series && <div className="mt-1.5 num text-[14px]">{L.teams[series.hi].short} {series.wHi}–{series.wLo} {L.teams[series.lo].short}</div>}
            {rival && !series && <div className="mt-1.5"><Pill color="#ff5a5f">🔥 Дерби</Pill></div>}
          </div>
          <div className="flex flex-col items-center w-24">
            <TeamLogo id={g.a} size={58} />
            <div className="font-display uppercase text-[14px] mt-1.5">{L.teams[g.a].short}</div>
            <div className="text-[11.5px] text-white/60">{recordStr(L.teams[g.a])}</div>
          </div>
        </div>
        <div className="flex gap-2 mt-4">
          <Button size="sm" full onClick={() => useGame.getState().simulate('game', undefined, { watch: true })} icon={<Icon name="eye" size={16} />}>Смотреть матч</Button>
          <Button size="sm" full onClick={() => nav.go('roster')} icon={<Icon name="roster" size={16} />}>Звенья</Button>
        </div>
      </div>
    </div>
  );
}

function PhaseCard() {
  const L = useL();
  const nav = useNav();
  const ph = L.phase;
  let title = '', text = '', cta: { label: string; go: () => void } | null = null, icon = '🏒';
  if (ph === 'draft' || (ph === 'offseason' && L.date.slice(5) < '06-26' && L.draft && !L.draft.done)) {
    icon = '🎯'; title = ph === 'draft' ? 'Драфт идёт!' : 'Скоро драфт'; text = ph === 'draft' ? 'Ваша очередь выбирать — откройте драфт-рум.' : `Драфт ${L.draft?.year} состоится 26 июня. Соберите свой big board.`;
    cta = { label: ph === 'draft' ? 'В драфт-рум' : 'Драфт-центр', go: () => nav.go('more', ph === 'draft' ? 'draftRoom' : 'draft') };
  } else if (ph === 'freeagency') {
    icon = '🛒'; title = `Свободные агенты · день ${L.fa?.day ?? 1}`; text = 'Лучшие игроки рынка ждут предложений. Действуйте быстро.';
    cta = { label: 'К рынку', go: () => nav.go('market', 'market', { tab: 'fa' }) };
  } else if (ph === 'offseason') {
    icon = '☀️'; title = 'Межсезонье'; text = L.date.slice(5) < '07-01' ? 'Продлите контракты до 1 июля — потом игроки уйдут на рынок.' : 'Тренировочный лагерь 1 сентября. Доведите состав до ума.';
    cta = { label: L.date.slice(5) < '07-01' ? 'Продления' : 'Рынок', go: () => nav.go('market', 'market', { tab: L.date.slice(5) < '07-01' ? 'ext' : 'fa' }) };
  } else if (ph === 'preseason') {
    icon = '🏁'; title = 'Предсезонка'; text = `Сезон стартует ${dateLong(L.seasonStart)}.`;
  } else {
    icon = '🏆'; title = 'Сезон завершён'; text = 'Подводим итоги.';
  }
  return (
    <Card className="flex gap-4 items-center">
      <div className="text-[40px]">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="font-display uppercase text-[19px] tracking-wide">{title}</div>
        <div className="text-[13.5px] text-muted mt-0.5">{text}</div>
        {cta && <Button size="sm" variant="primary" className="mt-3" onClick={cta.go}>{cta.label}</Button>}
      </div>
    </Card>
  );
}
