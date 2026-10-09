import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import '@fontsource-variable/oswald';
import './index.css';
import App from './App';
import { registerSW } from 'virtual:pwa-register';

registerSW({ immediate: true });

// Debug hooks (used by automated UI checks)
import { useGame } from './store/game';
import { useNav } from './store/nav';
(window as unknown as { __nhl: unknown }).__nhl = { game: useGame, nav: useNav };

// iOS may close a home-screen app in the background without warning: save when it is hidden.
const saveNow = () => void useGame.getState().save();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') saveNow();
});
window.addEventListener('pagehide', saveNow);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
