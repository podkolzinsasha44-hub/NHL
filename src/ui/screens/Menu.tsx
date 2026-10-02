import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { useGame } from '../../store/game';
import { deleteSave, importFile, lastSaveId, listSaves, type SaveMeta } from '../../persistence/db';
import { Button, Card, cx, Spinner } from '../components/kit';
import { Sheet, Icon } from '../components/shell';
import { TeamLogo } from '../components/media';
import { dateLong, seasonLabel } from '../format';
import { NewCareer } from './NewCareer';

function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}
function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export function Menu() {
  const [saves, setSaves] = useState<SaveMeta[]>([]);
  const [mode, setMode] = useState<'menu' | 'new'>('menu');
  const [loadOpen, setLoadOpen] = useState(false);
  const loading = useGame((s) => s.loading);
  const open = useGame((s) => s.open);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    listSaves().then(setSaves).catch(() => setSaves([]));
    useGame.getState().loadWorld();
  }, []);
  const last = saves.find((s) => s.id === lastSaveId()) ?? saves[0];

  if (mode === 'new') return <NewCareer onBack={() => setMode('menu')} />;

  return (
    <div className="fixed inset-0 flex flex-col pt-safe pb-safe overflow-hidden">
      <div className="flex-1 flex flex-col items-center justify-center px-6 relative">
        <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: 'spring', stiffness: 120, damping: 16 }} className="relative">
          <div className="absolute inset-0 blur-3xl rounded-full bg-gold/25 scale-150" />
          <CupMark size={120} />
        </motion.div>
        <motion.h1 initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="font-display uppercase text-[46px] leading-none tracking-[0.06em] mt-6 text-gradient-ice">
          NHL GM
        </motion.h1>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }} className="text-muted text-[14.5px] mt-2 text-center">
          Симулятор генерального менеджера · сезон 2026-27
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }} className="w-full max-w-[380px] mt-10 flex flex-col gap-2.5">
          {last && (
            <button onClick={() => open(last.id)} className="press glass rounded-3xl p-3.5 flex items-center gap-3 text-left">
              <TeamLogo id={last.team} size={44} />
              <div className="flex-1 min-w-0">
                <div className="font-display uppercase tracking-wide text-[17px]">Продолжить</div>
                <div className="text-[12.5px] text-muted truncate">{last.name} · {seasonLabel(last.season)} · {dateLong(last.date)}</div>
              </div>
              {loading ? <Spinner /> : <Icon name="play" size={18} className="accent-text" />}
            </button>
          )}
          <Button size="lg" variant="primary" full onClick={() => setMode('new')}>Новая карьера</Button>
          <div className="flex gap-2.5">
            {saves.length > 0 && <Button full onClick={() => setLoadOpen(true)}>Сохранения</Button>}
            <Button full onClick={() => fileRef.current?.click()}>Импорт файла</Button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              try {
                const L = await importFile(f);
                useGame.getState().setLeague(L);
              } catch (err) {
                useGame.getState().toast((err as Error).message, 'bad');
              }
            }}
          />
        </motion.div>
        {isIOS() && !isStandalone() && (
          <Card className="mt-6 max-w-[380px] w-full flex gap-3 items-center">
            <div className="text-[26px]">📲</div>
            <div className="text-[13px] text-muted">
              Установите как приложение: нажмите <b className="text-ink">«Поделиться»</b> <Icon name="share" size={14} className="inline -mt-1" /> → <b className="text-ink">«На экран „Домой“»</b>. Так игра откроется без адресной строки и сохранения будут надёжнее.
            </div>
          </Card>
        )}
      </div>
      <div className="text-center text-[11px] text-faint px-6 pb-3">
        Фан-проект, не связан с NHL и NHLPA. Составы и статистика — по данным на 02.10.2026.
      </div>

      <Sheet open={loadOpen} onClose={() => setLoadOpen(false)} title="Сохранения">
        <div className="flex flex-col gap-2">
          {saves.map((s) => (
            <div key={s.id} className="glass rounded-2xl p-3 flex items-center gap-3">
              <TeamLogo id={s.team} size={36} />
              <div className="flex-1 min-w-0" onClick={() => open(s.id)}>
                <div className="font-semibold text-[15px] truncate">{s.name}</div>
                <div className="text-[12px] text-muted">{seasonLabel(s.season)} · {dateLong(s.date)}{s.ironman ? ' · 🛡️' : ''}</div>
              </div>
              <Button size="sm" variant="primary" onClick={() => open(s.id)}>Открыть</Button>
              <button
                className={cx('press w-9 h-9 rounded-xl flex items-center justify-center text-bad')}
                onClick={async () => {
                  if (!confirm('Удалить сохранение? Это нельзя отменить.')) return;
                  await deleteSave(s.id);
                  setSaves(await listSaves());
                }}
                aria-label="Удалить"
              >
                <Icon name="close" size={18} />
              </button>
            </div>
          ))}
        </div>
      </Sheet>
    </div>
  );
}

export function CupMark({ size = 100 }: { size?: number }) {
  return (
    <svg width={size} height={size * 1.05} viewBox="300 160 424 560" className="relative drop-shadow-[0_10px_30px_rgba(232,194,106,0.35)]">
      <defs>
        <linearGradient id="cupg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff1c2" />
          <stop offset="0.45" stopColor="#e8c26a" />
          <stop offset="1" stopColor="#9c7425" />
        </linearGradient>
      </defs>
      <g fill="url(#cupg)">
        <ellipse cx="512" cy="200" rx="150" ry="34" />
        <path d="M362 200 Q372 300 470 330 L470 360 L554 360 L554 330 Q652 300 662 200 Z" />
        <rect x="440" y="360" width="144" height="40" rx="10" />
        <rect x="410" y="404" width="204" height="70" rx="12" />
        <rect x="380" y="480" width="264" height="78" rx="12" />
        <rect x="350" y="564" width="324" height="86" rx="14" />
        <rect x="330" y="656" width="364" height="40" rx="12" />
      </g>
      <g fill="#0a1428" opacity="0.3">
        <rect x="410" y="436" width="204" height="5" />
        <rect x="380" y="516" width="264" height="5" />
        <rect x="350" y="604" width="324" height="5" />
      </g>
    </svg>
  );
}
