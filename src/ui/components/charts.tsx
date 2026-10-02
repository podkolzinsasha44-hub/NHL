import { motion } from 'motion/react';

export function Sparkline({ values, width = 120, height = 36, color = 'var(--accent)', labels }: { values: number[]; width?: number; height?: number; color?: string; labels?: string[] }) {
  if (values.length < 2) return <div className="text-muted text-[12px]">недостаточно данных</div>;
  const min = Math.min(...values) - 2, max = Math.max(...values) + 2;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * (width - 8) + 4, height - 4 - ((v - min) / (max - min)) * (height - 8)]);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const area = `${d} L${pts[pts.length - 1][0]},${height} L${pts[0][0]},${height} Z`;
  return (
    <svg width={width} height={height + (labels ? 14 : 0)} className="overflow-visible">
      <defs>
        <linearGradient id="spk" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.35" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#spk)" />
      <motion.path d={d} fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.9 }} />
      {pts.map((p, i) => (
        <g key={i}>
          <circle cx={p[0]} cy={p[1]} r="2.8" fill={color} />
          <text x={p[0]} y={p[1] - 6} textAnchor="middle" fontSize="9.5" fill="#cfd8e6" className="num">{values[i]}</text>
          {labels && <text x={p[0]} y={height + 12} textAnchor="middle" fontSize="9" fill="#7c889e">{labels[i]}</text>}
        </g>
      ))}
    </svg>
  );
}

export function Momentum({ bins, home, away }: { bins: number[]; home: string; away: string }) {
  const max = Math.max(3, ...bins.map(Math.abs));
  return (
    <div>
      <div className="flex justify-between text-[11px] text-muted mb-1"><span>{home} ▲</span><span>▼ {away}</span></div>
      <div className="flex items-center gap-1 h-24 relative">
        <div className="absolute left-0 right-0 top-1/2 h-px bg-white/10" />
        {bins.map((b, i) => (
          <div key={i} className="flex-1 h-full relative">
            <motion.div
              className="absolute left-0 right-0 rounded-sm"
              style={{ background: b >= 0 ? 'var(--accent)' : '#8b98ae', top: b >= 0 ? `${50 - (b / max) * 50}%` : '50%' }}
              initial={{ height: 0 }}
              animate={{ height: `${(Math.abs(b) / max) * 50}%` }}
              transition={{ delay: i * 0.04 }}
            />
          </div>
        ))}
      </div>
      <div className="flex justify-between text-[10px] text-faint mt-1"><span>1-й</span><span>2-й</span><span>3-й</span></div>
    </div>
  );
}

/** Half-rink shot map. Shots are mirrored so each team attacks a different side. */
export function ShotMap({ shots, home }: { shots: { team: string; x: number; y: number; goal: boolean }[]; home: string }) {
  return (
    <svg viewBox="0 0 200 85" className="w-full rounded-2xl" style={{ background: 'linear-gradient(180deg,#e9f3fb,#cfe2f1)' }}>
      <rect x="1" y="1" width="198" height="83" rx="28" fill="none" stroke="#9fb6cc" strokeWidth="1" />
      <line x1="100" y1="1" x2="100" y2="84" stroke="#d9374a" strokeWidth="1.4" />
      <line x1="66" y1="1" x2="66" y2="84" stroke="#2c5fd9" strokeWidth="1.4" />
      <line x1="134" y1="1" x2="134" y2="84" stroke="#2c5fd9" strokeWidth="1.4" />
      <line x1="11" y1="5" x2="11" y2="80" stroke="#d9374a" strokeWidth="0.8" />
      <line x1="189" y1="5" x2="189" y2="80" stroke="#d9374a" strokeWidth="0.8" />
      <circle cx="100" cy="42.5" r="12" fill="none" stroke="#2c5fd9" strokeWidth="0.8" />
      {[[34, 22], [34, 63], [166, 22], [166, 63]].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="10" fill="none" stroke="#d9374a" strokeWidth="0.7" />
      ))}
      <path d="M11 38 A5 5 0 0 1 11 47" fill="#7cc4ff" opacity="0.6" />
      <path d="M189 38 A5 5 0 0 0 189 47" fill="#7cc4ff" opacity="0.6" />
      {shots.map((s, i) => {
        const right = s.team === home;
        const x = right ? 100 + (s.x - 0.5) * 2 * 89 : 100 - (s.x - 0.5) * 2 * 89;
        const y = 5 + s.y * 75;
        return s.goal ? (
          <g key={i}>
            <circle cx={x} cy={y} r="3.6" fill={right ? 'var(--accent)' : '#334155'} stroke="white" strokeWidth="1" />
          </g>
        ) : (
          <circle key={i} cx={x} cy={y} r="1.7" fill={right ? 'var(--accent)' : '#475569'} opacity="0.55" />
        );
      })}
    </svg>
  );
}

export function Ring({ value, size = 64, stroke = 7, color = 'var(--accent)', label }: { value: number; size?: number; stroke?: number; color?: string; label?: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} fill="none" />
        <motion.circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} fill="none" strokeLinecap="round" strokeDasharray={c} initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c * (1 - Math.max(0, Math.min(1, value))) }} transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="num text-[15px] leading-none">{Math.round(value * 100)}%</div>
        {label && <div className="text-[9px] text-muted uppercase mt-0.5">{label}</div>}
      </div>
    </div>
  );
}
