/**
 * Copia de seguridad — docs/data-model.md §9, design-system §2.5 and §7.8.
 *
 * Four rules, all of them visible on screen:
 *
 * 1. Export produces the versioned JSON and says **which route was used**: the download,
 *    the share sheet or the clipboard. Which of the three works inside the installed app
 *    on this iOS version is uncertain (P-10), so the screen never shows a success it
 *    could not observe — an unobservable download ends as "no podemos confirmar".
 * 2. Import validates before touching anything, and an invalid document changes nothing
 *    and reports the first failure **with its path** (`sessions[3].exercises[0]…`).
 * 3. Restore needs the typed word the storage layer checks, and the button stays
 *    disabled until the word matches exactly.
 * 4. Merge is offered only for the collections it accepts — pesos y actividades — and is
 *    not drawn at all for a document that carries nothing else.
 */

import { useState } from 'react';
import { Card, ErrorBanner, SectionLabel, TextButton } from '../../design-system';
import {
  RESTORE_CONFIRMATION,
  type BackupDocument,
  type ImportReport,
  type StoragePort,
} from '../../storage';
import { readFileText } from './browser-edges';
import { restoreGate } from './confirmation';
import { exportMessage, type ExportRoute } from './export';
import { Note, LiveField } from './fields';
import {
  importFailureText,
  importProblem,
  mergeOffer,
  type ImportFailure,
  type ImportProblem,
} from './import';
import type { ExportControl } from './useBackupExport';

type Mode = 'restore' | 'merge';

export interface BackupGroupProps {
  readonly storage: StoragePort;
  readonly exportControl: ExportControl;
  /** Re-reads the screen after an import replaced or added rows. */
  readonly onChanged: () => void;
  /** The evicted banner's `Importar copia` lands here. */
  readonly importAnchor?: React.RefObject<HTMLDivElement | null> | undefined;
}

const ROUTE_WORD: Record<ExportRoute, string> = {
  download: 'Descargar la copia',
  share: 'Compartir la copia',
  clipboard: 'Copiar al portapapeles',
};

export function BackupGroup({
  storage,
  exportControl,
  onChanged,
  importAnchor,
}: BackupGroupProps): React.ReactElement {
  const [document, setDocument] = useState<{ document: BackupDocument; json: string } | null>(null);
  const [problem, setProblem] = useState<ImportProblem | null>(null);
  const [failure, setFailure] = useState<{ readonly mode: Mode; readonly failure: ImportFailure } | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [busy, setBusy] = useState<Mode | null>(null);
  const [paste, setPaste] = useState('');
  const [confirmation, setConfirmation] = useState('');

  const validate = (json: string): void => {
    setProblem(null);
    setFailure(null);
    setReport(null);

    const validation = storage.backup.validate(json);
    const invalid = importProblem(validation);
    if (invalid !== null) {
      setDocument(null);
      setProblem(invalid);
      return;
    }
    if (!validation.ok) return;

    setDocument({ document: validation.document, json });
    setConfirmation('');
  };

  const submit = (mode: Mode): void => {
    if (document === null) return;
    setBusy(mode);
    setFailure(null);
    setReport(null);

    void (async () => {
      try {
        const written =
          mode === 'restore'
            ? await storage.backup.import({ json: document.json, mode: 'restore', confirmation })
            : await storage.backup.import({ json: document.json, mode: 'merge' });
        setReport(written);
        setDocument(null);
        setPaste('');
        setConfirmation('');
        onChanged();
      } catch (error) {
        setFailure({ mode, failure: importFailureText(error) });
      } finally {
        setBusy(null);
      }
    })();
  };

  const onFile = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0];
    // Picking the same file twice must fire `change` twice.
    event.target.value = '';
    if (file === undefined) return;

    void (async () => {
      try {
        validate(await readFileText(file));
      } catch {
        setDocument(null);
        setProblem({
          kind: 'not-json',
          path: null,
          title: 'No se pudo leer el archivo.',
          detail: file.name,
        });
      }
    })();
  };

  const gate = restoreGate({ validated: document !== null, typed: confirmation });
  const merge = document === null ? null : mergeOffer(document.document);
  const result = exportControl.view.kind === 'result' ? exportControl.view.result : null;
  const retryRoute = result === null ? null : result.nextRoute;

  return (
    <section className="profile__section">
      <SectionLabel>Copia de seguridad</SectionLabel>

      <Card>
        {/* Exporting is infrequent and Perfil has no primary action to protect: a filled
            block here made the rarest action of the app its loudest element. */}
        <TextButton
          icon="export"
          disabled={exportControl.view.kind === 'working'}
          onClick={() => exportControl.start()}
        >
          Exportar copia
        </TextButton>

        <p className="ds-meta" aria-live="polite">
          {exportControl.view.kind === 'working'
            ? 'Preparando la copia…'
            : result === null
              ? 'Un archivo JSON con todo: perfil, rutina, sesiones, pesos y actividades.'
              : exportMessage(result)}
        </p>

        {retryRoute === null ? null : (
          <TextButton align="start" onClick={() => exportControl.start(retryRoute)}>
            {ROUTE_WORD[retryRoute]}
          </TextButton>
        )}

        {exportControl.view.kind === 'failed' ? (
          <ErrorBanner message={exportControl.view.message} />
        ) : null}

        <details className="profile__disclosure">
          <summary className="profile__disclosure-trigger">
            <span className="ds-meta">Importar copia</span>
            <span className="ds-caption">Restaurar o añadir datos desde un archivo Rupfit</span>
          </summary>

          <div className="profile__import" ref={importAnchor} tabIndex={-1}>
          <label className="profile__file">
            <span className="ds-text-button">Elegir archivo…</span>
            <input type="file" accept="application/json,.json" onChange={onFile} />
          </label>

          <LiveField
            label="O pega el contenido"
            hint="El archivo que exportó Rupfit, tal cual."
            value={paste}
            multiline
            placeholder='{"documentType":"rupfit.backup",…}'
            onChange={setPaste}
          />
          <TextButton
            align="start"
            disabled={paste.trim() === '' || busy !== null}
            onClick={() => validate(paste)}
          >
            Comprobar el texto pegado
          </TextButton>

          {problem === null ? null : (
            <>
              <ErrorBanner message={problem.title} />
              <p className="ds-caption">
                {problem.path === null
                  ? problem.detail
                  : `Ruta del fallo: ${problem.path} · ${problem.detail}`}
              </p>
            </>
          )}

          {document === null ? null : (
            <>
              <p className="ds-body">{documentSummary(document.document)}</p>

              <p className="ds-meta">
                Restaurar reemplaza todo lo guardado. Añadir solo toca pesos y actividades.
              </p>

              <LiveField
                label="Confirmación"
                hint={
                  gate === 'ready'
                    ? 'Coincide: puedes restaurar.'
                    : gate === 'wrong'
                      ? `No coincide. Escribe ${RESTORE_CONFIRMATION}.`
                      : `Escribe ${RESTORE_CONFIRMATION} para restaurar.`
                }
                hintTone={gate === 'ready' ? 'success' : gate === 'wrong' ? 'danger' : 'muted'}
                value={confirmation}
                capitalise
                onChange={setConfirmation}
              />

              <TextButton
                align="start"
                disabled={gate !== 'ready' || busy !== null}
                onClick={() => submit('restore')}
              >
                Restaurar y reemplazar
              </TextButton>

              {merge === null ? null : (
                <>
                  <Note>{merge}</Note>
                  <TextButton align="start" disabled={busy !== null} onClick={() => submit('merge')}>
                    Añadir pesos y actividades
                  </TextButton>
                </>
              )}
            </>
          )}

          {busy === null ? null : (
            <p className="ds-meta" aria-live="polite">
              {busy === 'restore' ? 'Restaurando la copia…' : 'Añadiendo pesos y actividades…'}
            </p>
          )}

          {failure === null ? null : (
            <>
              <ErrorBanner
                message={failure.failure.title}
                {...(document === null ? {} : { onRetry: () => submit(failure.mode) })}
              />
              {failure.failure.detail === null ? null : (
                <p className="ds-caption">{failure.failure.detail}</p>
              )}
            </>
          )}

          {report === null ? null : <p className="ds-body">{reportLine(report)}</p>}
          </div>
        </details>
      </Card>
    </section>
  );
}

function documentSummary(document: BackupDocument): string {
  const plural = (count: number, one: string, many: string): string =>
    `${count} ${count === 1 ? one : many}`;

  return [
    plural(document.sessions.length, 'sesión', 'sesiones'),
    plural(document.exercises.length, 'ejercicio', 'ejercicios'),
    plural(document.planDays.length, 'día de rutina', 'días de rutina'),
    plural(document.bodyMeasurements.length, 'peso', 'pesos'),
    plural(document.activities.length, 'actividad', 'actividades'),
  ].join(' · ');
}

function reportLine(report: ImportReport): string {
  if (report.mode === 'merge') {
    return `Añadidos ${report.written.bodyMeasurements} pesos y ${report.written.activities} actividades.`;
  }
  return `Restaurado: ${report.written.sessions} sesiones, ${report.written.exercises} ejercicios y ${report.written.bodyMeasurements} pesos.`;
}
