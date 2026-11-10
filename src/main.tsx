import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import './design-system/tokens.css';
import './app/shell.css';

const container = document.getElementById('root');
if (container === null) throw new Error('missing #root');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

/**
 * The launch screen lives in `index.html` so it paints before any module is parsed. It goes
 * away once the app has produced a frame of its own — two frames, in fact: the first one is
 * React committing, the second is the browser painting it, and removing the cover between
 * them would show the blank page it was hiding.
 */
const boot = document.getElementById('boot');
if (boot !== null) {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => boot.remove());
  });
}
