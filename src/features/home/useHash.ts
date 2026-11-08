/**
 * The hash, as React state — for the screens that resolve their own sub-route.
 *
 * `src/app/routes.tsx` parses one segment per route and falls back to `inicio`, so
 * `#/resumen/<id>` and the demo paths are not routes the shell knows: the screens under
 * `inicio` resolve them locally (that router is outside this task's edit surface). A
 * local resolver has to re-render when the hash changes, and the shell does not: its
 * `useHashRoute` receives the same `inicio` value and React bails out of the update.
 * Hence this hook — one listener, the same two events the router listens to.
 *
 * `popstate` as well as `hashchange`, because a browser back gesture inside standalone
 * mode must land on the same view a fresh load would.
 */

import { useEffect, useState } from 'react';

function readLocation(): string {
  return `${window.location.search}${window.location.hash}`;
}

export function useLocationKey(): string {
  const [key, setKey] = useState(readLocation);

  useEffect(() => {
    const onChange = (): void => setKey(readLocation());
    window.addEventListener('hashchange', onChange);
    window.addEventListener('popstate', onChange);
    return () => {
      window.removeEventListener('hashchange', onChange);
      window.removeEventListener('popstate', onChange);
    };
  }, []);

  return key;
}

/** `?demo=inicio` → `inicio`; no query flag → `null`. */
export function demoFlagOf(search: string): string | null {
  return new URLSearchParams(search).get('demo');
}
