/**
 * Resumen's address: `#/resumen/<id>`, plus the fixture route `#/resumen/demo`.
 *
 * The route table knows the sheet (`routes.tsx`: `resumen` and `resumen/demo`, with
 * `isSummaryRoute`), but a table of literal paths collapses the id: `useHashRoute`
 * reports `resumen` for every `#/resumen/<id>`. The id therefore comes from the hash,
 * exactly the way Progreso reads its drill-down, and this pure parser is what turns the
 * hash into a closed union. Anything that is not a summary is `null`, so the caller keeps
 * the screen it was going to draw.
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
