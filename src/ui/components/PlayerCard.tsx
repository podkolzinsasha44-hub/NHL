import { motion, useMotionValue, useSpring, useTransform } from 'motion/react';
import { useState } from 'react';
import type { League, Player } from '../../engine/types';
import { potRange } from '../../engine/draft';
import { ATTR_SHORT, flag, money, playerAge, POS_RU, tierOf, TRAIT_RU } from '../format';
import { cx } from './kit';
import { Silhouette, TeamLogo } from './media';

const TIER_BORDER: Record<string, string> = {
  bronze: 'linear-gradient(140deg,#f0b88a,#8a5330 45%,#d99a6c 70%,#5a3018)',
  silver: 'linear-gradient(140deg,#ffffff,#8f9bb0 40%,#e6ecf5 65%,#5d6778)',
  gold: 'linear-gradient(140deg,#fff3c9,#c9a24b 40%,#ffe7a3 65%,#8a6a22)',
  elite: 'linear-gradient(140deg,#fff3c9,#1a1a1a 35%,#e8c26a 60%,#111 85%)',
  legend: '',
};

export function PlayerCard({ p, L, width = 260, interactive = true }: { p: Player; L: League; width?: number; interactive?: boolean }) {
  const t = p.team ? L.teams[p.team] : null;
  const tier = tierOf(p.ovr);
  const [imgErr, setImgErr] = useState(false);
  const mx = useMotionValue(0), my = useMotionValue(0);
  const rx = useSpring(useTransform(my, [-1, 1], [9, -9]), { stiffness: 180, damping: 18 });
  const ry = useSpring(useTransform(mx, [-1, 1], [-11, 11]), { stiffness: 180, damping: 18 });
  const glareX = useTransform(mx, [-1, 1], ['0%', '100%']);
  const h = width * 1.42;
  const attrs = p.pos === 'G' ? ['po', 'rf', 'rb', 'cs', 'mn', 'pk'] : ['sk', 'sh', 'pa', 'ha', 'oi', 'di'];
  const r = p.r as unknown as Record<string, number>;
  const [lo, hi] = potRange(L, p);
  const age = playerAge(L, p);
  const primary = t?.primary ?? '#1b2a44';
  const accent = t?.accent ?? '#7fd3ff';

  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!interactive) return;
    const b = e.currentTarget.getBoundingClientRect();
    mx.set(((e.clientX - b.left) / b.width) * 2 - 1);
    my.set(((e.clientY - b.top) / b.height) * 2 - 1);
  };
  const reset = () => { mx.set(0); my.set(0); };

  return (
    <div style={{ perspective: 900 }} className="mx-auto" onPointerMove={onMove} onPointerLeave={reset} onPointerUp={reset}>
      <motion.div
        style={{ width, height: h, rotateX: rx, rotateY: ry, transformStyle: 'preserve-3d' }}
        className={cx('relative rounded-[28px] p-[3px] shadow-[0_30px_60px_-20px_rgba(0,0,0,0.8)]', tier === 'legend' && 'holo')}
        initial={{ opacity: 0, y: 20, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 22 }}
      >
        {tier !== 'legend' && <div className="absolute inset-0 rounded-[28px]" style={{ background: TIER_BORDER[tier] }} />}
        <div
          className={cx('relative w-full h-full rounded-[25px] overflow-hidden', tier !== 'bronze' && tier !== 'silver' && 'shine')}
          style={{ background: `linear-gradient(165deg, color-mix(in oklab, ${primary} 85%, #fff 6%) 0%, color-mix(in oklab, ${primary} 55%, #05070d) 48%, #070b14 100%)` }}
        >
          {/* rink lines */}
          <svg className="absolute inset-0 w-full h-full opacity-[0.07]" viewBox="0 0 100 142" preserveAspectRatio="none">
            <circle cx="50" cy="40" r="26" fill="none" stroke="white" strokeWidth="0.6" />
            <line x1="0" y1="40" x2="100" y2="40" stroke="white" strokeWidth="0.6" />
            <line x1="0" y1="98" x2="100" y2="98" stroke={accent} strokeWidth="1.4" />
          </svg>
          <motion.div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(circle at var(--gx) 0%, rgba(255,255,255,0.22), transparent 55%)', ['--gx' as string]: glareX }} />
          {/* header */}
          <div className="absolute left-4 top-4 flex flex-col items-center z-10">
            <div className={cx('num leading-none font-semibold', tier === 'gold' || tier === 'elite' ? 'text-gradient-gold' : 'text-white')} style={{ fontSize: width * 0.17 }}>{p.ovr}</div>
            <div className="font-display text-[13px] tracking-widest text-white/85 mt-0.5">{POS_RU[p.pos]}</div>
            <div className="text-[18px] mt-1 leading-none">{flag(p.ctry)}</div>
            {t && <TeamLogo id={t.id} size={26} className="mt-1.5" />}
          </div>
          <div className="absolute right-3.5 top-4 z-10 flex flex-col items-end gap-1">
            {p.num != null && <div className="num text-white/30 leading-none" style={{ fontSize: width * 0.11 }}>#{p.num}</div>}
            {p.tr.slice(0, 3).map((tr) => (
              <div key={tr} className="text-[15px] leading-none" title={TRAIT_RU[tr]?.name}>{TRAIT_RU[tr]?.icon}</div>
            ))}
          </div>
          {/* photo */}
          <div className="absolute left-0 right-0 flex justify-center" style={{ top: h * 0.07, height: h * 0.5 }}>
            <div className="relative" style={{ width: h * 0.5, height: h * 0.5 }}>
              {p.img && !imgErr ? (
                <img src={p.img} alt="" className="w-full h-full object-contain object-bottom drop-shadow-[0_10px_20px_rgba(0,0,0,0.5)]" onError={() => setImgErr(true)} draggable={false} />
              ) : (
                <Silhouette p={p} color={accent} />
              )}
            </div>
          </div>
          <div className="absolute left-0 right-0" style={{ top: h * 0.44, height: h * 0.16, background: `linear-gradient(180deg, transparent, color-mix(in oklab, ${primary} 30%, #070b14))` }} />
          {/* name */}
          <div className="absolute left-0 right-0 text-center px-3" style={{ top: h * 0.565 }}>
            <div className="text-white/70 text-[12px] uppercase tracking-[0.2em] truncate">{p.fn}</div>
            <div className="font-display uppercase text-white leading-[1.05] truncate" style={{ fontSize: width * 0.105 }}>{p.ln}</div>
          </div>
          <div className="absolute left-5 right-5 h-px" style={{ top: h * 0.705, background: `linear-gradient(90deg, transparent, ${accent}, transparent)` }} />
          {/* attrs */}
          <div className="absolute left-4 right-4 grid grid-cols-3 gap-y-1.5" style={{ top: h * 0.73 }}>
            {attrs.map((k) => (
              <div key={k} className="flex items-baseline justify-center gap-1.5">
                <span className="num text-white text-[18px] leading-none">{r[k]}</span>
                <span className="text-[10px] tracking-wider text-white/55">{ATTR_SHORT[k]}</span>
              </div>
            ))}
          </div>
          {/* footer */}
          <div className="absolute left-0 right-0 bottom-3 flex items-center justify-center gap-2 text-[11.5px] text-white/70 px-3">
            <span>{age} лет</span>
            <span className="opacity-40">·</span>
            <span>{p.c ? `${money(p.c.aav)} до ${p.c.last + 1}` : 'без контракта'}</span>
            <span className="opacity-40">·</span>
            <span>POT {lo === hi ? lo : `${lo}–${hi}`}</span>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

/** Small collectible-style tile used in albums and lists. */
export function MiniCard({ p, L, onClick }: { p: Player; L: League; onClick?: () => void }) {
  const t = p.team ? L.teams[p.team] : null;
  const tier = tierOf(p.ovr);
  const [err, setErr] = useState(false);
  return (
    <div onClick={onClick} className={cx('press relative rounded-2xl p-[2px]', tier === 'legend' && 'holo')} style={tier !== 'legend' ? { background: TIER_BORDER[tier] } : undefined}>
      <div className="relative rounded-[14px] overflow-hidden aspect-[0.72]" style={{ background: `linear-gradient(165deg, ${t?.primary ?? '#1b2a44'}, #070b14 75%)` }}>
        <div className="absolute left-2 top-1.5 num text-[20px] text-white leading-none">{p.ovr}</div>
        <div className="absolute left-2 top-7 font-display text-[10px] text-white/70">{POS_RU[p.pos]}</div>
        <div className="absolute inset-x-0 top-3 bottom-8 flex justify-center">
          {p.img && !err ? <img src={p.img} alt="" loading="lazy" onError={() => setErr(true)} className="h-full object-contain object-bottom" /> : <div className="w-3/4"><Silhouette p={p} color={t?.accent} /></div>}
        </div>
        <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-black/80 to-transparent" />
        <div className="absolute inset-x-1 bottom-1.5 text-center font-display uppercase text-[11px] text-white truncate">{p.ln}</div>
      </div>
    </div>
  );
}
