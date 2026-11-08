/**
 * Resumen's address: `#/resumen/<id>`, plus the fixture route `#/resumen/demo`.
 *
 * `src/app/routes.tsx` is outside this task's edit surface, so the sheet parses its own
 * hash exactly the way `#/sesion/demo` is drawn today: the parser is pure, its result is
 * a closed union, and anything that is not a summary is `null` so the caller keeps
 * rendering Inicio.
 */

export type SummaryTarget =
  | { readonly kind: 'session'; readonly sessionId: string }
  | { readonly kind: 'demo' };

const PREFIX = '#/resumen/';

export function summaryTargetOf(hash: string): SummaryTarget | null {
  if (!hash.startsWith(PREFIX)) return null;
  const segment = hash.slice(PREFIX.length).replace(/\/+$/, '');
  if (segment === '') return null;
  if (segment === 'demo') return { kind: 'demo' };
  const sessionId = decodeURIComponent(segment);
  return sessionId === '' ? null : { kind: 'session', sessionId };
}

/** `#/resumen/<id>` — the one place the summary's address is built. */
export function summaryHash(sessionId: string): string {
  return `${PREFIX}${encodeURIComponent(sessionId)}`;
}
