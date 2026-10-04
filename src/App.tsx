import { Activity, memo, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useAnimate } from 'motion/react';
import { useGame } from './store/game';
import { TAB_ORDER, useNav, type Route, type Tab } from './store/nav';
import { LayerCtx } from './store/layer';
import { TabBar, Toasts } from './ui/components/shell';
import { Menu } from './ui/screens/Menu';
import { ROUTES, MODALS } from './ui/routes';
import { SimOverlay } from './ui/screens/SimOverlay';
import { unreadCount } from './engine/news';

export default function App() {
  const L = useGame((s) => s.L);
  useGame((s) => s.ver);
  if (!L) {
    return (
      <>
        <div className="arena" />
        <Menu />
        <Toasts />
      </>
    );
  }
  return <GameShell />;
}

function GameShell() {
  const L = useGame((s) => s.L)!;
  const modal = useNav((s) => s.modal);
  const badges: Partial<Record<Tab, number>> = {
    office: unreadCount(L),
    market: L.offers.length || undefined,
  };
  const ModalComp = modal ? MODALS[modal.name] : null;
  const month = Number(L.date.slice(5, 7));
  const mood = L.phase === 'playoffs' ? 'playoffs' : month === 12 || month <= 2 ? 'winter' : '';
  return (
    <>
      <div className="arena" data-mood={mood} />
      <Stage />
      <TabBar badges={badges} />
      <SimOverlay />
      <AnimatePresence>
        {ModalComp && (
          <motion.div
            key={modal!.key}
            className="fixed inset-0 z-50"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 36 }}
          >
            <ModalComp params={modal!.params ?? {}} />
          </motion.div>
        )}
      </AnimatePresence>
      <Toasts />
    </>
  );
}

const SPRING = { type: 'spring', stiffness: 420, damping: 42, mass: 0.9 } as const;
const NO_PARAMS: Record<string, unknown> = {};
const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const enterFrom = (dir: number) => (dir > 0 ? '30%' : '-22%');
const exitTo = (dir: number) => (dir > 0 ? '-18%' : '30%');

/**
 * All screens of every opened tab stay mounted; only the top of the current tab is visible.
 * Switching tabs or going back therefore returns to a screen exactly as it was left: chosen
 * segments, filters, typed text and scroll position. Subscribes to navigation only, so simulation
 * ticks never re-render the hidden screens.
 */
const Stage = memo(function Stage() {
  const tab = useNav((s) => s.tab);
  const stacks = useNav((s) => s.stacks);
  const seen = useNav((s) => s.seen);
  const dir = useNav((s) => s.dir);
  return (
    <div className="fixed inset-0 overflow-hidden">
      <AnimatePresence initial={false} custom={dir} presenceAffectsLayout={false}>
        {TAB_ORDER.filter((t) => seen.includes(t)).flatMap((t) =>
          stacks[t].map((route, depth) => (
            <Layer key={`${t}-${route.key}`} route={route} depth={depth} visible={t === tab && depth === stacks[t].length - 1} />
          )),
        )}
      </AnimatePresence>
    </div>
  );
});

const Layer = memo(function Layer({ route, depth, visible }: { route: Route; depth: number; visible: boolean }) {
  const Comp = ROUTES[route.name] ?? ROUTES.office;
  const [scope, animate] = useAnimate<HTMLDivElement>();
  // A screen being covered (push, tab switch) stays visible while it slides away, then hides.
  const [leaving, setLeaving] = useState(false);
  const [wasVisible, setWasVisible] = useState(visible);
  if (wasVisible !== visible) {
    setWasVisible(visible);
    setLeaving(!visible);
  }
  const shown = useRef(visible);
  useLayoutEffect(() => {
    if (shown.current === visible || !scope.current) return;
    shown.current = visible;
    const dir = useNav.getState().dir;
    const transition = reducedMotion() ? { duration: 0 } : SPRING;
    if (visible) {
      animate(scope.current, { x: [enterFrom(dir), '0%'], opacity: [0, 1] }, transition);
      return;
    }
    let current = true;
    animate(scope.current, { x: exitTo(dir), opacity: 0 }, transition).then(() => current && setLeaving(false));
    return () => {
      current = false;
    };
  }, [visible, animate, scope]);
  const info = useMemo(() => ({ active: visible, depth }), [visible, depth]);
  return (
    <Activity mode={visible || leaving ? 'visible' : 'hidden'}>
      <motion.div
        ref={scope}
        className="absolute inset-0"
        style={{ zIndex: visible ? 1 : 0, pointerEvents: visible ? undefined : 'none' }}
        initial={{ x: enterFrom(useNav.getState().dir), opacity: 0 }}
        animate={{ x: '0%', opacity: 1 }}
        variants={{ exit: (dir: number) => ({ x: exitTo(dir), opacity: 0 }) }}
        exit="exit"
        transition={SPRING}
      >
        <LayerCtx.Provider value={info}>
          <Comp params={route.params ?? NO_PARAMS} />
        </LayerCtx.Provider>
      </motion.div>
    </Activity>
  );
});
