import type { ReactNode } from 'react';
import type { League, Player, Team } from '../../engine/types';
import { flag, money, playerAge, POS_RU, recordStr, STATUS_RU } from '../format';
import { useNav } from '../../store/nav';
import { Chevron, cx, Ovr } from './kit';
import { PlayerPhoto, TeamLogo } from './media';
import { potRange } from '../../engine/draft';

export function PlayerRow({
  p, L, right, sub, onClick, showTeam, showPot, dim,
}: {
  p: Player; L: League; right?: ReactNode; sub?: ReactNode; onClick?: () => void; showTeam?: boolean; showPot?: boolean; dim?: boolean;
}) {
  const push = useNav((s) => s.push);
  const [lo, hi] = showPot ? potRange(L, p) : [0, 0];
  return (
    <div onClick={onClick ?? (() => push('player', { id: p.id }))} className={cx('press flex items-center gap-3 px-3 min-h-[64px] py-2 active:bg-white/5 rounded-2xl', dim && 'opacity-55')}>
      <PlayerPhoto p={p} L={L} size={46} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="font-semibold text-[15.5px] truncate">{p.fn[0]}. {p.ln}</span>
          {p.inj && <span className="text-[11px] px-1.5 rounded bg-bad/20 text-bad shrink-0">ТР</span>}
          {p.susp ? <span className="text-[11px] px-1.5 rounded bg-warn/20 text-warn shrink-0">ДСК</span> : null}
          {p.wantsTrade && <span className="text-[11px] shrink-0">😤</span>}
        </div>
        <div className="text-[12.5px] text-muted truncate">
          {sub ?? (
            <>
              {POS_RU[p.pos]} · {playerAge(L, p)} лет · {flag(p.ctry)}
              {showTeam && ` · ${p.team ?? STATUS_RU[p.st]}`}
              {p.c ? ` · ${money(p.c.aav)}×${Math.max(0, p.c.last - L.season + 1)}` : ''}
            </>
          )}
        </div>
      </div>
      {right}
      {showPot && <div className="text-right mr-1"><div className="text-[10px] text-muted uppercase">POT</div><div className="num text-[15px] text-ice">{lo === hi ? lo : `${lo}–${hi}`}</div></div>}
      <Ovr v={p.ovr} size={38} />
    </div>
  );
}

export function TeamRow({ t, L, right, onClick, rank }: { t: Team; L: League; right?: ReactNode; onClick?: () => void; rank?: number }) {
  return (
    <div onClick={onClick} className={cx('flex items-center gap-3 px-3 min-h-[52px] rounded-2xl', onClick && 'press active:bg-white/5', t.id === L.user && 'bg-white/[0.06]')}>
      {rank != null && <span className="num w-5 text-muted text-[15px] text-right">{rank}</span>}
      <TeamLogo id={t.id} size={30} />
      <div className="flex-1 min-w-0">
        <div className={cx('font-medium text-[15px] truncate', t.id === L.user && 'accent-text')}>{t.short}</div>
        <div className="text-[12px] text-muted">{recordStr(t)}</div>
      </div>
      {right}
      {onClick && <Chevron />}
    </div>
  );
}
