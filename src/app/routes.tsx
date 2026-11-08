import { useEffect, useState } from 'react';

export const ROUTES = ['inicio', 'entrenar', 'progreso', 'perfil', 'sesion'] as const;
export type Route = (typeof ROUTES)[number];

const DEFAULT_ROUTE: Route = 'inicio';

function parse(hash: string): Route {
  const name = hash.replace(/^#\/?/, '').split('/')[0] ?? '';
  return (ROUTES as readonly string[]).includes(name) ? (name as Route) : DEFAULT_ROUTE;
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
