/**
 * The export sequence — docs/data-model.md §9, architecture §2.2 P-10,
 * design-system §2.5.
 *
 * The order is a design decision and it is fixed here, once:
 *
 * 1. `download` — a `Blob` and an `<a download>`.
 * 2. `share` — `navigator.share({ files })`, the sheet the owner already trusts.
 * 3. `clipboard` — the JSON as text, pasted into Notes or a mail.
 *
 * Which of the three works inside the installed app on this iOS version is uncertain
 * (P-10, measured in F5), so the sequence asks each route for an *answer* rather than
 * for a success, and the screen says the answer out loud:
 *
 * | answer        | meaning                                                   |
 * | ------------- | --------------------------------------------------------- |
 * | `done`        | the route reports that the copy left (the sheet resolved)  |
 * | `unknown`     | a file was produced and iOS gave no observable result      |
 * | `declined`    | the owner cancelled; nothing was handed over               |
 * | `unavailable` | the API is absent or threw; try the next route             |
 *
 * Two rules keep it honest:
 *
 * - A route that answered `unknown` ends the sequence. Handing the same copy to a
 *   second sheet automatically would produce two files and no new information.
 * - The sequence never falls through a cancellation. "No" is an answer.
 */

import type { ExportArtifact } from './backup-file';

export type ExportRoute = 'download' | 'share' | 'clipboard';

/** §9, in order. The one place the order is written. */
export const EXPORT_ROUTE_ORDER: readonly ExportRoute[] = ['download', 'share', 'clipboard'];

export type EdgeAnswer = 'done' | 'unknown' | 'declined' | 'unavailable';

/**
 * The three browser edges, injected. Every one of them is allowed to throw: a route
 * that cannot run is `unavailable`, which is not an error the owner needs to see.
 */
export interface ExportEdges {
  download(artifact: ExportArtifact): Promise<EdgeAnswer> | EdgeAnswer;
  share(artifact: ExportArtifact): Promise<EdgeAnswer> | EdgeAnswer;
  clipboard(artifact: ExportArtifact): Promise<EdgeAnswer> | EdgeAnswer;
}

export interface ExportAttempt {
  readonly route: ExportRoute;
  readonly answer: EdgeAnswer;
}

export type ExportOutcome = 'done' | 'unknown' | 'declined' | 'exhausted';

export interface ExportResult {
  readonly artifact: ExportArtifact;
  readonly attempts: readonly ExportAttempt[];
  /** `exhausted`: no route could even be attempted. */
  readonly outcome: ExportOutcome;
  /** The route whose answer ended the sequence, or `null` when none ran. */
  readonly route: ExportRoute | null;
  /** The next route the owner may try by hand, in the documented order. */
  readonly nextRoute: ExportRoute | null;
}

/** The route after this one, or `null` at the end of the order. */
export function nextRouteAfter(route: ExportRoute): ExportRoute | null {
  const index = EXPORT_ROUTE_ORDER.indexOf(route);
  return index < 0 ? null : (EXPORT_ROUTE_ORDER[index + 1] ?? null);
}

async function ask(
  route: ExportRoute,
  artifact: ExportArtifact,
  edges: ExportEdges,
): Promise<EdgeAnswer> {
  try {
    const edge =
      route === 'download' ? edges.download : route === 'share' ? edges.share : edges.clipboard;
    return await edge(artifact);
  } catch {
    return 'unavailable';
  }
}

/**
 * Runs the sequence from `from` (the download by default). `from` exists so the screen
 * can offer the next route as one tap after an unobservable result.
 */
export async function runExport(
  artifact: ExportArtifact,
  edges: ExportEdges,
  from: ExportRoute = 'download',
): Promise<ExportResult> {
  const start = EXPORT_ROUTE_ORDER.indexOf(from);
  const routes = start < 0 ? EXPORT_ROUTE_ORDER : EXPORT_ROUTE_ORDER.slice(start);
  const attempts: ExportAttempt[] = [];

  for (const route of routes) {
    const answer = await ask(route, artifact, edges);
    attempts.push({ route, answer });

    if (answer === 'unavailable') continue;

    // `done`, `unknown` and `declined` all end the sequence: one copy, one answer.
    return {
      artifact,
      attempts,
      outcome: answer,
      route,
      nextRoute: answer === 'unknown' ? nextRouteAfter(route) : null,
    };
  }

  return { artifact, attempts, outcome: 'exhausted', route: null, nextRoute: null };
}

/**
 * The sentence the screen shows. It always names the file the app produced and the
 * route it used, and it never claims an outcome the app could not observe (§2.5).
 */
export function exportMessage(result: ExportResult): string {
  const name = result.artifact.fileName;

  switch (result.outcome) {
    case 'done':
      switch (result.route) {
        case 'download':
          return `Copia creada: ${name}. Búscala en Descargas.`;
        case 'share':
          return `Copia compartida: ${name}.`;
        default:
          return `Copia en el portapapeles: ${name}. Pégala en Notas o en un correo.`;
      }
    case 'unknown':
      return result.route === 'share'
        ? `Se abrió el selector de compartir con ${name}. No podemos confirmar que se enviara.`
        : `Copia preparada: ${name}. No podemos confirmar que iOS la haya guardado; compruébala en Archivos o en Descargas.`;
    case 'declined':
      return 'No se compartió la copia. No se ha guardado nada.';
    case 'exhausted':
      return 'No se pudo sacar la copia del teléfono: este navegador no ofrece descarga, compartir ni portapapeles.';
  }
}
