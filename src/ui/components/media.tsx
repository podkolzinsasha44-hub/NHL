import { useId, useState } from 'react';
import type { League, Player } from '../../engine/types';
import { flag, logoUrl } from '../format';
import { KHL_BY_ID } from '../../engine/khlData';
import { NATIONS } from '../../engine/intl';
import { cx } from './kit';

/** Generated crest for KHL clubs (no official logos are bundled). */
function KhlCrest({ id, size, className }: { id: string; size: number; className?: string }) {
  const c = KHL_BY_ID[id];
  const txt = c.abbr;
  const fs = txt.length >= 4 ? 22 : txt.length === 3 ? 27 : txt.length === 2 ? 34 : 44;
  const gid = `kc-${id}${useId().replace(/:/g, '')}`;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className={cx('shrink-0', className)} aria-label={c.name}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={c.primary} />
          <stop offset="1" stopColor={`color-mix(in oklab, ${c.primary} 70%, #000)`} />
        </linearGradient>
      </defs>
      <path d="M50 4 L88 16 V50 C88 72 72 88 50 96 C28 88 12 72 12 50 V16 Z" fill={`url(#${gid})`} stroke={c.secondary} strokeWidth="5" strokeLinejoin="round" />
      <path d="M22 30 H78" stroke={c.secondary} strokeWidth="3" opacity="0.55" />
      <text x="50" y="66" textAnchor="middle" fontSize={fs} fontFamily="Oswald Variable, Oswald, sans-serif" fontWeight="700" fill="#fff">{txt}</text>
    </svg>
  );
}

/** National team badge: flag on a dark disc. */
export function NationBadge({ code, size = 32, className }: { code: string; size?: number; className?: string }) {
  return (
    <div className={cx('rounded-full flex items-center justify-center shrink-0 bg-white/8', className)} style={{ width: size, height: size, fontSize: size * 0.62, lineHeight: 1 }} aria-label={NATIONS[code]?.name ?? code}>
      {flag(code)}
    </div>
  );
}

export function TeamLogo({ id, size = 32, className }: { id: string; size?: number; className?: string }) {
  const [err, setErr] = useState(false);
  if (KHL_BY_ID[id]) return <KhlCrest id={id} size={size} className={className} />;
  if (NATIONS[id]) return <NationBadge code={id} size={size} className={className} />;
  if (err || id.length > 3) {
    return (
      <div className={cx('rounded-full flex items-center justify-center font-display font-bold shrink-0', className)} style={{ width: size, height: size, fontSize: size * 0.34, background: 'rgba(255,255,255,0.08)' }}>
        {id}
      </div>
    );
  }
  return <img src={logoUrl(id)} alt={id} width={size} height={size} onError={() => setErr(true)} className={cx('shrink-0 object-contain', className)} style={{ width: size, height: size }} draggable={false} />;
}

export function Silhouette({ p, color = '#7fd3ff' }: { p: Player; color?: string }) {
  const initials = `${p.fn[0] ?? ''}${p.ln[0] ?? ''}`;
  const gid = `sil${p.id}${useId().replace(/:/g, '')}`;
  return (
    <svg viewBox="0 0 100 100" className="w-full h-full">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.55" />
          <stop offset="1" stopColor={color} stopOpacity="0.12" />
        </linearGradient>
      </defs>
      <circle cx="50" cy="36" r="17" fill={`url(#${gid})`} />
      <path d="M14 100 C16 70 32 58 50 58 C68 58 84 70 86 100 Z" fill={`url(#${gid})`} />
      <text x="50" y="41" textAnchor="middle" fontSize="13" fontFamily="Oswald Variable, Oswald, sans-serif" fontWeight="600" fill="white" fillOpacity="0.85">
        {initials}
      </text>
    </svg>
  );
}

export function PlayerPhoto({ p, L, size = 44, className, round = true }: { p: Player; L: League; size?: number; className?: string; round?: boolean }) {
  const [err, setErr] = useState(false);
  const t = p.team ? L.teams[p.team] : null;
  const bg = t ? `radial-gradient(circle at 50% 30%, color-mix(in oklab, ${t.primary} 70%, #1a2440), #0b1120)` : 'radial-gradient(circle at 50% 30%, #1b2a44, #0b1120)';
  return (
    <div className={cx('relative overflow-hidden shrink-0', round ? 'rounded-full' : 'rounded-2xl', className)} style={{ width: size, height: size, background: bg }}>
      {p.img && !err ? (
        <img src={p.img} alt="" loading="lazy" onError={() => setErr(true)} className="absolute inset-0 w-full h-full object-cover object-top" draggable={false} />
      ) : (
        <Silhouette p={p} color={t?.accent} />
      )}
    </div>
  );
}
