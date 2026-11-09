/**
 * The three views of the Progreso tab, in the hash.
 *
 * Design-system §8: *"there is no browser back button in standalone mode, so back
 * navigation is always an on-screen control, and the active route is kept in the URL
 * so that a relaunch after the page was discarded returns to the same screen."* The
 * tab keeps its own view in the URL for the same reason.
 *
 * ## The views
 *
 * `#/progreso` is the tab, `#/progreso/historial` and `#/progreso/peso` are its two
 * fixed drill-downs, and `#/progreso/ejercicio/<key>` is the exercise detail. The last
 * one carries a parameter, so it is parsed like `#/resumen/<id>`: the route table knows
 * `progreso/ejercicio` and the key is read from the hash. The key is the `exerciseKey`
 * of `aggregates.ts` — the exercise id, or `name:<snapshot>` when a deleted exercise
 * has no id (I-4) — never `exerciseId`, which is `null` in exactly that case.
 *
 * ## Writing the hash
 *
 * `navigate` writes with `history.pushState`, which does not fire a `hashchange`: a
 * plain `location.hash = …` would fire one, the shell would re-parse the hash, and the
 * tab could be unmounted before it renders its own view. Reading listens for both
 * `popstate` and `hashchange`, so the back gesture and a link both land on the view
 * they name.
 */

import { useCallback, useEffect, useState } from 'react';

/** The views `progressViewHash` can round-trip on its own: no parameter. */
export const PROGRESS_VIEWS = ['summary', 'historial', 'peso'] as const;

export type ProgressView = (typeof PROGRESS_VIEWS)[number];

/** What the tab renders: the three fixed views, plus the exercise detail. */
export type ProgressTabView = ProgressView | 'exercise';

const TAB = 'progreso';
const EXERCISE_SEGMENT = 'ejercicio';

/**
 * The segments of a Progreso hash, without the `#/`, the query or the trailing
 * slashes: `['progreso', 'historial']`, `['progreso', 'ejercicio', '<key>']`. `null`
 * when the hash names another tab.
 */
function progressSegments(hash: string): readonly string[] | null {
  const path = hash
    .replace(/^#\/?/, '')
    .split('?')[0]
    ?.replace(/\/+$/, '');
  if (path === undefined || path === '') return null;

  const segments = path.split('/');
  if (segments[0] !== TAB) return null;
  return segments;
}

/** `#/progreso/historial` → `historial`; the exercise detail → `exercise`; else the tab. */
export function parseProgressView(hash: string): ProgressTabView {
  const segments = progressSegments(hash);
  if (segments === null || segments.length === 1) return 'summary';
  if (segments[1] === EXERCISE_SEGMENT) {
    // `#/progreso/ejercicio` without a key is not a detail of anything: the tab shows
    // its summary instead of an unnamed exercise.
    return exerciseKeyFromHash(hash) === null ? 'summary' : 'exercise';
  }
  if (segments.length > 2) return 'summary';

  const view = segments[1];
  return view === 'historial' || view === 'peso' ? view : 'summary';
}

/**
 * The exercise key the hash names, decoded, or `null`. The key is percent-encoded when
 * written (`name:` carries a space), so this is the inverse of `exerciseViewHash`.
 */
export function exerciseKeyFromHash(hash: string): string | null {
  const segments = progressSegments(hash);
  if (segments === null || segments.length !== 3) return null;
  if (segments[1] !== EXERCISE_SEGMENT) return null;

  const encoded = segments[2];
  if (encoded === undefined || encoded === '') return null;

  try {
    const key = decodeURIComponent(encoded);
    return key === '' ? null : key;
  } catch {
    // A malformed escape is not a key; the tab falls back to the summary.
    return null;
  }
}

export function progressViewHash(view: ProgressView): string {
  return view === 'summary' ? `#/${TAB}` : `#/${TAB}/${view}`;
}

/** `#/progreso/ejercicio/name%3ASentadilla%20trasera`. */
export function exerciseViewHash(key: string): string {
  return `#/${TAB}/${EXERCISE_SEGMENT}/${encodeURIComponent(key)}`;
}

export interface ProgressViewNavigation {
  /** `exercise` is the detail; `exerciseKey` says which exercise. */
  readonly view: ProgressTabView;
  readonly exerciseKey: string | null;
  /** Pushes a hash entry without firing the shell's `hashchange`. */
  navigate(view: ProgressView): void;
  /** Pushes the detail of one exercise. */
  openExercise(key: string): void;
  /** The on-screen back control: replaces this entry with the tab's own hash. */
  back(): void;
}

export function useProgressView(): ProgressViewNavigation {
  const [hash, setHash] = useState<string>(() => window.location.hash);

  useEffect(() => {
    const sync = (): void => setHash(window.location.hash);
    // `popstate` covers the back gesture; `hashchange` covers a link or a typed hash.
    window.addEventListener('popstate', sync);
    window.addEventListener('hashchange', sync);
    return () => {
      window.removeEventListener('popstate', sync);
      window.removeEventListener('hashchange', sync);
    };
  }, []);

  const view = parseProgressView(hash);
  const exerciseKey = exerciseKeyFromHash(hash);

  const push = useCallback((next: string) => {
    if (window.location.hash !== next) {
      // See the header: pushState, never `location.hash`, so the shell is not told
      // about a path it resolves differently.
      window.history.pushState(null, '', next);
    }
    setHash(next);
  }, []);

  const navigate = useCallback((next: ProgressView) => push(progressViewHash(next)), [push]);
  const openExercise = useCallback((key: string) => push(exerciseViewHash(key)), [push]);

  const back = useCallback(() => {
    const hash = progressViewHash('summary');
    if (window.location.hash !== hash) window.history.replaceState(null, '', hash);
    setHash(hash);
  }, []);

  return { view, exerciseKey, navigate, openExercise, back };
}
