/**
 * The export sequence — docs/data-model.md §9, architecture §2.2 P-10,
 * design-system §2.5.
 *
 * The order is a design decision, not an implementation detail: a `Blob` download
 * first, the share sheet second, the clipboard last, and the screen says which one
 * was used because the app cannot observe what iOS did with the file.
 */

import { describe, expect, it } from 'vitest';
import { exportArtifact } from './backup-file';
import {
  EXPORT_ROUTE_ORDER,
  exportMessage,
  nextRouteAfter,
  runExport,
  type EdgeAnswer,
  type ExportEdges,
  type ExportRoute,
} from './export';

const ARTIFACT = exportArtifact('{"documentType":"rupfit.backup"}', {
  exportedAt: '2026-11-08T10:00:00.000Z',
});

const FILE_NAME = 'rupfit-backup-2026-11-08T10-00-00-000Z.json';

type Answers = Partial<Record<ExportRoute, EdgeAnswer | 'throws'>>;

function edges(answers: Answers): { readonly edges: ExportEdges; readonly calls: ExportRoute[] } {
  const calls: ExportRoute[] = [];

  const answer = (route: ExportRoute): Promise<EdgeAnswer> | EdgeAnswer => {
    calls.push(route);
    const configured = answers[route] ?? 'unavailable';
    if (configured === 'throws') throw new Error(`${route} is not available`);
    return configured;
  };

  return {
    calls,
    edges: {
      download: () => answer('download'),
      share: () => answer('share'),
      clipboard: () => answer('clipboard'),
    },
  };
}

describe('EXPORT_ROUTE_ORDER', () => {
  it('is the documented order: download, share sheet, clipboard', () => {
    expect(EXPORT_ROUTE_ORDER).toEqual(['download', 'share', 'clipboard']);
  });
});

describe('nextRouteAfter', () => {
  it('walks the order and stops at the clipboard', () => {
    expect(nextRouteAfter('download')).toBe('share');
    expect(nextRouteAfter('share')).toBe('clipboard');
    expect(nextRouteAfter('clipboard')).toBeNull();
  });
});

describe('runExport', () => {
  it('stops at the first route that reports a result', async () => {
    const { edges: port, calls } = edges({ download: 'unavailable', share: 'done' });

    const result = await runExport(ARTIFACT, port);

    expect(result.outcome).toBe('done');
    expect(result.route).toBe('share');
    expect(result.attempts).toEqual([
      { route: 'download', answer: 'unavailable' },
      { route: 'share', answer: 'done' },
    ]);
    expect(calls).toEqual(['download', 'share']);
    expect(result.nextRoute).toBeNull();
  });

  it('an unobservable download ends the sequence: it does not hand a second copy over', async () => {
    const { edges: port, calls } = edges({ download: 'unknown' });

    const result = await runExport(ARTIFACT, port);

    expect(result.outcome).toBe('unknown');
    expect(result.route).toBe('download');
    expect(result.nextRoute).toBe('share');
    expect(calls).toEqual(['download']);
  });

  it('treats a throwing route as unavailable rather than as a crash', async () => {
    const { edges: port } = edges({ download: 'throws', share: 'done' });

    const result = await runExport(ARTIFACT, port);

    expect(result.outcome).toBe('done');
    expect(result.route).toBe('share');
    expect(result.attempts[0]).toEqual({ route: 'download', answer: 'unavailable' });
  });

  it('reports exhaustion when no route is available, and names none', async () => {
    const { edges: port } = edges({});

    const result = await runExport(ARTIFACT, port);

    expect(result.outcome).toBe('exhausted');
    expect(result.route).toBeNull();
    expect(result.nextRoute).toBeNull();
    expect(result.attempts).toHaveLength(3);
  });

  it('stops when the owner cancels the share sheet instead of falling through', async () => {
    const { edges: port, calls } = edges({ download: 'unavailable', share: 'declined' });

    const result = await runExport(ARTIFACT, port);

    expect(result.outcome).toBe('declined');
    expect(result.route).toBe('share');
    expect(result.nextRoute).toBeNull();
    expect(calls).toEqual(['download', 'share']);
  });

  it('can be started at a later route, which is how the second attempt is offered', async () => {
    const { edges: port, calls } = edges({ clipboard: 'done' });

    const result = await runExport(ARTIFACT, port, 'clipboard');

    expect(result.outcome).toBe('done');
    expect(result.route).toBe('clipboard');
    expect(calls).toEqual(['clipboard']);
  });
});

describe('exportMessage', () => {
  it('names the route that worked and where the file went', async () => {
    const downloaded = await runExport(ARTIFACT, edges({ download: 'done' }).edges);
    expect(exportMessage(downloaded)).toContain(FILE_NAME);
    expect(exportMessage(downloaded)).toContain('Descargas');

    const shared = await runExport(ARTIFACT, edges({ download: 'unavailable', share: 'done' }).edges);
    expect(exportMessage(shared)).toContain(FILE_NAME);
    expect(exportMessage(shared)).toContain('Copia compartida');

    const copied = await runExport(ARTIFACT, edges({ clipboard: 'done' }).edges, 'clipboard');
    expect(exportMessage(copied)).toContain(FILE_NAME);
    expect(exportMessage(copied)).toContain('portapapeles');
  });

  it('says it cannot confirm the result when the download gives no signal (§2.5)', async () => {
    const result = await runExport(ARTIFACT, edges({ download: 'unknown' }).edges);
    const message = exportMessage(result);

    expect(message).toContain(FILE_NAME);
    expect(message).toContain('No podemos confirmar');
    // No "Copia creada" and no "Copia compartida": neither was observed.
    expect(message.startsWith('Copia creada')).toBe(false);
  });

  it('does not claim success when the owner cancels', async () => {
    const result = await runExport(ARTIFACT, edges({ share: 'declined' }).edges, 'share');

    expect(exportMessage(result)).toBe('No se compartió la copia. No se ha guardado nada.');
  });

  it('says plainly when no route exists, and offers no false success', async () => {
    const result = await runExport(ARTIFACT, edges({}).edges);
    const message = exportMessage(result);

    expect(message).toContain('No se pudo sacar la copia del teléfono');
  });
});
