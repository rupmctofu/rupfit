import { useEffect, useState } from 'react';

/**
 * The four tabs, plus the session sheet and its demo, plus `resumen` and its demo, plus
 * `galeria`. The gallery and the demos are review surfaces, not tabs: they are reachable
 * only by their hash and the tab bar never gains a fifth entry.
 *
 * `sesion/demo` is a path, not a second route table: the session is one screen with two
 * ports behind it, and `#/sesion/demo` is the same sheet fed by fixtures.
 *
 * `resumen` is the summary sheet: `#/resumen/<sessionId>` for the session that was just
 * finished and `#/resumen/demo` for the fixture week. It carries a parameter, so the
 * table names the route and the id is read from the hash (`summaryTargetOf`).
 *
 * `progreso/ejercicio` is the exercise detail: `#/progreso/ejercicio/<exerciseKey>`, a
 * drill-down inside the Progreso tab whose key is read from the hash the same way
 * (`exerciseKeyFromHash`).
 *
 * `empezar` is the first-run setup (`src/features/onboarding`). It is not a fifth tab: the
 * shell shows it in place of a tab while the store cannot train, and it stays reachable by
 * hash so an existing store can be sent to it deliberately.
 */
export const ROUTES = [
  'inicio',
  'entrenar',
  'progreso',
  'perfil',
  'empezar',
  'sesion',
  'sesion/demo',
  'resumen',
  'resumen/demo',
  'galeria',
  // Drill-downs inside the Progreso tab: paths, not new tabs. A cold load must land on
  // the view it names, so they belong in the table and the shell renders the parent.
  'progreso/historial',
  'progreso/peso',
  // The exercise detail carries a key, like `resumen` carries a session id: the table
  // knows the route and `#/progreso/ejercicio/<key>` is read from the hash
  // (`exerciseKeyFromHash`). The key is never `exerciseId`: it is `null` for an
  // exercise deleted from the library, so the key falls back to the snapshot name.
  'progreso/ejercicio',
] as const;
export type Route = (typeof ROUTES)[number];

const DEFAULT_ROUTE: Route = 'inicio';

/** The tab a route belongs to: a drill-down lights up its parent tab. */
export function tabFor(route: Route): Route {
  if (
    route === 'progreso/historial' ||
    route === 'progreso/peso' ||
    route === 'progreso/ejercicio'
  ) {
    return 'progreso';
  }
  // The summary closes the session Inicio started, so Inicio is the tab it belongs to —
  // the same tab its «Hecho» and «Volver a Inicio» land on.
  if (route === 'resumen' || route === 'resumen/demo') return 'inicio';
  // The setup is what Inicio is until the store can train, so it lights Inicio up.
  if (route === 'empezar') return 'inicio';
  return route;
}

/**
 * The routes drawn inside the tab shell — the ones the first-run setup may replace. The
 * session, the summary and the gallery own the whole viewport and their own data, so the
 * gate must not read the store for them.
 */
export function isTabShellRoute(route: Route): boolean {
  return (
    route !== 'sesion' &&
    route !== 'sesion/demo' &&
    route !== 'resumen' &&
    route !== 'resumen/demo' &&
    route !== 'galeria'
  );
}

function parse(hash: string): Route {
  const path = hash.replace(/^#\/?/, '').replace(/\/+$/, '');
  // `#/resumen/<sessionId>` is one route with a parameter, not one entry per session:
  // the summary reads its id from the hash, the way Progreso reads its drill-down.
  if (path.startsWith('resumen/')) return path === 'resumen/demo' ? 'resumen/demo' : 'resumen';
  // `#/progreso/ejercicio/<exerciseKey>` is the same shape: one route, the key read
  // from the hash. The key is percent-encoded, so it can never add a slash here.
  if (path.startsWith('progreso/ejercicio/')) return 'progreso/ejercicio';
  return (ROUTES as readonly string[]).includes(path) ? (path as Route) : DEFAULT_ROUTE;
}

/**
 * Hash routing with no dependency: the route is readable from a cold start, survives a
 * discarded page, and needs no server rewrite rule on GitHub Pages (which has none).
 */
export function useHashRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parse(window.location.hash));

  useEffect(() => {
    const onChange = (): void => setRoute(parse(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  return route;
}

/** `#/sesion` and `#/sesion/demo` are one screen over two ports. */
export function isSessionRoute(route: Route): boolean {
  return route === 'sesion' || route === 'sesion/demo';
}

/**
 * `#/resumen/<id>` and `#/resumen/demo` are one screen over two ports too: the summary of
 * a stored session and the summary of the fixture week.
 */
export function isSummaryRoute(route: Route): boolean {
  return route === 'resumen' || route === 'resumen/demo';
}

/**
 * The hash as state, for the routes that carry a parameter.
 *
 * `useHashRoute` collapses every `#/resumen/<sessionId>` to `resumen`, so the id cannot
 * come from the route: it is read from the hash this hook keeps current. `popstate` as
 * well as `hashchange`, because in standalone mode there is no browser back button and a
 * returning gesture must still land where a fresh load would (`src/features/home/useHash.ts`
 * listens for both for the same reason).
 */
export function useCurrentHash(): string {
  const [hash, setHash] = useState(() => window.location.hash);

  useEffect(() => {
    const onChange = (): void => setHash(window.location.hash);
    window.addEventListener('hashchange', onChange);
    window.addEventListener('popstate', onChange);
    return () => {
      window.removeEventListener('hashchange', onChange);
      window.removeEventListener('popstate', onChange);
    };
  }, []);

  return hash;
}
