import { useState, type ReactNode } from 'react';
import { GLOSSARY } from '../glossary';
import { Sheet } from './shell';

/** Tappable term: opens a short explanation (for players new to hockey management). */
export function Term({ k, children }: { k: keyof typeof GLOSSARY | string; children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const g = GLOSSARY[k];
  if (!g) return <>{children}</>;
  return (
    <>
      <span
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        className="underline decoration-dotted decoration-white/40 underline-offset-[3px] cursor-help"
      >
        {children ?? g.t}
      </span>
      <Sheet open={open} onClose={() => setOpen(false)} title={g.t}>
        <p className="text-[15.5px] leading-relaxed text-ink/90">{g.d}</p>
      </Sheet>
    </>
  );
}
