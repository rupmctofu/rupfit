import { useEffect, useState } from 'react';

/**
 * The four tabs, plus the session sheet and its demo, plus `galeria`. The gallery and
 * the demo are review surfaces, not tabs: they are reachable only by their hash and the
 * tab bar never gains a fifth entry.
 *
 * `sesion/demo` is a path, not a second route table: the session is one screen with two
 * ports behind it, and `#/sesion/demo` is the same sheet fed by fixtures.
 */
export const ROUTES = [
  'inicio',
  'entrenar',
  'progreso',
  'perfil',
  'sesion',
  'sesion/demo',
  'galeria',
  // Drill-downs inside the Progreso tab: paths, not new tabs. A cold load must land on
  // the view it names, so they belong in the table and the shell renders the parent.
  'progreso/historial',
  'progreso/peso',
] as const;
export type Route = (typeof ROUTES)[number];

const DEFAULT_ROUTE: Route = 'inicio';

/** The tab a route belongs to: a drill-down lights up its parent tab. */
export function tabFor(route: Route): Route {
  return route === 'progreso/historial' || route === 'progreso/peso' ? 'progreso' : route;
}

function parse(hash: string): Route {
  const path = hash.replace(/^#\/?/, '').replace(/\/+$/, '');
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
