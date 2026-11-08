/**
 * The export control's state — the screen's half of `runExport`.
 *
 * The sequence itself is pure and tested (`export.ts`); this hook only owns what the
 * button shows and when the marker is allowed to record a date. The clock arrives from
 * the provider: the file name and the marker both come from the same injected instant,
 * so a test or the demo can pin them.
 */

import { useCallback, useState } from 'react';
import type { Clock } from './clock';
import type { StoragePort } from '../../storage';
import { exportArtifact } from './backup-file';
import { exportEdges } from './browser-edges';
import { runExport, type ExportResult, type ExportRoute } from './export';
import { rememberExport, type MarkerStore } from './launch-marker';
import { APP_VERSION } from './copy';

export type ExportView =
  | { readonly kind: 'idle' }
  /** §S3: local data, so a state word instead of a spinner. */
  | { readonly kind: 'working' }
  | { readonly kind: 'result'; readonly result: ExportResult }
  | { readonly kind: 'failed'; readonly message: string };

export interface ExportControl {
  readonly view: ExportView;
  /** Starts the sequence at `from`; the second attempt after an unobservable download. */
  start: (from?: ExportRoute) => void;
}

export interface UseBackupExportOptions {
  readonly storage: StoragePort;
  readonly clock: Clock;
  readonly markerStore: MarkerStore;
}

export function useBackupExport({
  storage,
  clock,
  markerStore,
}: UseBackupExportOptions): ExportControl {
  const [view, setView] = useState<ExportView>({ kind: 'idle' });
  const [edges] = useState(() => exportEdges());

  const start = useCallback(
    (from: ExportRoute = 'download'): void => {
      setView({ kind: 'working' });
      void (async () => {
        try {
          const now = clock.now();
          const exported = await storage.backup.export({ appVersion: APP_VERSION, exportedAt: now });
          const artifact = exportArtifact(exported.json, exported.document);
          const result = await runExport(artifact, edges, from);
          setView({ kind: 'result', result });

          // Only a confirmed export gets a date: the eviction copy must never promise a
          // copy the app could not observe (§2.5).
          if (result.outcome === 'done') rememberExport(markerStore, clock.now());
        } catch {
          setView({ kind: 'failed', message: 'No se pudo preparar la copia. Inténtalo otra vez.' });
        }
      })();
    },
    [clock, edges, markerStore, storage],
  );

  return { view, start };
}
