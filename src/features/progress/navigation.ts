/**
 * The two drill-downs of the Progreso tab, in the hash.
 *
 * Design-system §8: *"there is no browser back button in standalone mode, so back
 * navigation is always an on-screen control, and the active route is kept in the URL
 * so that a relaunch after the page was discarded returns to the same screen."* The
 * tab keeps its own view in the URL for the same reason.
 *
 * ## The routing constraint this file works around
 *
 * `src/app/routes.tsx` parses exactly one segment per tab and falls back to `inicio`
 * for anything else, so `#/progreso/historial` is not a route it knows and
 * `#/progreso/peso` is not either. This module therefore does three things locally:
 *
 * 1. **Parses** the second segment from `window.location.hash` (`parseProgressView`).
 * 2. **Writes** the hash with `history.pushState`, which does not fire a `hashchange`.
 *    A plain `location.hash = …` would fire one, the shell would re-parse
 *    `progreso/historial` as `inicio`, and the tab would be unmounted before it could
 *    render its own view.
 * 3. **Listens** for `popstate` and `hashchange`, so the browser's back gesture and a
 *    link that sets the hash both land on the right view.
 *
 * What is still missing, and needs `src/app` (not this task's surface): the two paths
 * added to `ROUTES`, and the tab derived from the first segment — otherwise a cold
 * relaunch on `#/progreso/historial` is parsed as `inicio` and the shell renders Inicio
 * with the Progreso tab unhighlighted.
 */

import { useCallback, useEffect, useState } from 'react';

export const PROGRESS_VIEWS = ['summary', 'historial', 'peso'] as const;

/** `summary` is the tab itself; the other two are its drill-downs. */
export type ProgressView = (typeof PROGRESS_VIEWS)[number];

const TAB = 'progreso';

/** `#/progreso/historial` → `historial`; anything unknown → `summary`. */
export function parseProgressView(hash: string): ProgressView {
  const path = hash
    .replace(/^#\/?/, '')
    .split('?')[0]
    ?.replace(/\/+$/, '');
  if (path === undefined || path === '') return 'summary';

  const segments = path.split('/');
  if (segments[0] !== TAB) return 'summary';
  if (segments.length === 1) return 'summary';
  if (segments.length > 2) return 'summary';

  const view = segments[1];
  return view === 'historial' || view === 'peso' ? view : 'summary';
}

export function progressViewHash(view: ProgressView): string {
  return view === 'summary' ? `#/${TAB}` : `#/${TAB}/${view}`;
}

export interface ProgressViewNavigation {
  readonly view: ProgressView;
  /** Pushes a hash entry without firing the shell's `hashchange`. */
  navigate(view: ProgressView): void;
  /** The on-screen back control: replaces this entry with the tab's own hash. */
  back(): void;
}

export function useProgressView(): ProgressViewNavigation {
  const [view, setView] = useState<ProgressView>(() => parseProgressView(window.location.hash));

  useEffect(() => {
    const sync = (): void => setView(parseProgressView(window.location.hash));
    // `popstate` covers the back gesture; `hashchange` covers a link or a typed hash.
    window.addEventListener('popstate', sync);
    window.addEventListener('hashchange', sync);
    return () => {
      window.removeEventListener('popstate', sync);
      window.removeEventListener('hashchange', sync);
    };
  }, []);

  const navigate = useCallback((next: ProgressView) => {
    const hash = progressViewHash(next);
    if (window.location.hash !== hash) {
      // See the header: pushState, never `location.hash`, so the shell is not told
      // about a path it would resolve to `inicio`.
      window.history.pushState(null, '', hash);
    }
    setView(next);
  }, []);

  const back = useCallback(() => {
    const hash = progressViewHash('summary');
    if (window.location.hash !== hash) window.history.replaceState(null, '', hash);
    setView('summary');
  }, []);

  return { view, navigate, back };
}
