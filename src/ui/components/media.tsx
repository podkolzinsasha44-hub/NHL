import { useState } from 'react';
import type { League, Player } from '../../engine/types';
import { logoUrl } from '../format';
import { cx } from './kit';

export function TeamLogo({ id, size = 32, className }: { id: string; size?: number; className?: string }) {
  const [err, setErr] = useState(false);
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
  return (
    <svg viewBox="0 0 100 100" className="w-full h-full">
      <defs>
        <linearGradient id={`sil${p.id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.55" />
          <stop offset="1" stopColor={color} stopOpacity="0.12" />
        </linearGradient>
      </defs>
      <circle cx="50" cy="36" r="17" fill={`url(#sil${p.id})`} />
      <path d="M14 100 C16 70 32 58 50 58 C68 58 84 70 86 100 Z" fill={`url(#sil${p.id})`} />
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
