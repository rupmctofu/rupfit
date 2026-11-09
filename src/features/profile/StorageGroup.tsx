/**
 * Almacenamiento — docs/data-model.md §10 and §11, design-system §2.5 and §7.8.
 *
 * What is stored, how much space it takes *if the browser will say*, the honest
 * sentence about eviction, the recorded answer to `navigator.storage.persist()` (Q-4),
 * and the one destructive operation of the app with its typed confirmation.
 *
 * Nothing here is an aggregate of the domain: the counts are the size of the store, and
 * the space figure is the platform's, never estimated by the app.
 */

import { useState } from 'react';
import { Card, DataRow, ErrorBanner, SectionLabel, TextButton } from '../../design-system';
import { DELETE_ALL_CONFIRMATION, type StorageAnswer, type StoragePort } from '../../storage';
import { deleteGate } from './confirmation';
import { DURABILITY_NOTE } from './copy';
import { LiveField, Note } from './fields';
import {
  persistenceLine,
  storageInventory,
  storageUsageLine,
  type DataSnapshot,
  type UsageEstimate,
} from './storage-inventory';

export interface StorageGroupProps {
  readonly storage: StoragePort;
  readonly snapshot: DataSnapshot;
  readonly usage: UsageEstimate;
  readonly answer: StorageAnswer | null;
  /** Re-reads the screen after the deletion reset the database. */
  readonly onChanged: () => void;
}

export function StorageGroup({
  storage,
  snapshot,
  usage,
  answer,
  onChanged,
}: StorageGroupProps): React.ReactElement {
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const gate = deleteGate(confirmation);

  const remove = (): void => {
    setDeleting(true);
    setError(null);

    void (async () => {
      try {
        // §10: the reset reseeds the exercise library, so the built-in catalogue survives
        // (the seed of `src/core/seed` once it exists; today it is the rows already
        // there). Custom exercises are the owner's data and go with everything else.
        const library = await storage.exercises.all();
        const seed = library.filter((exercise) => !exercise.isCustom);
        await storage.deleteAll({ confirmation, seed });
        setDone(true);
        setOpen(false);
        setConfirmation('');
        onChanged();
      } catch (cause) {
        setError(
          cause instanceof Error
            ? `No se pudieron borrar los datos: ${cause.message}`
            : 'No se pudieron borrar los datos.',
        );
      } finally {
        setDeleting(false);
      }
    })();
  };

  return (
    <section className="profile__section">
      <SectionLabel>Almacenamiento</SectionLabel>

      <Card padding="list">
        {storageInventory(snapshot).map((row) => (
          <DataRow key={row.label} title={row.label} value={row.value} />
        ))}
      </Card>

      {/* The two figures the browser owns are sentences, not rows: right-aligning an
          answer that may be "no lo dice" would read like a value. */}
      <Note>{storageUsageLine(usage)}</Note>
      <Note>{persistenceLine(answer)}</Note>
      <Note>{DURABILITY_NOTE}</Note>

      {done ? <p className="ds-body">Datos borrados. La app vuelve a empezar.</p> : null}
      {error === null ? null : <ErrorBanner message={error} />}

      <TextButton align="start" tone={open ? 'quiet' : 'danger'} onClick={() => setOpen(!open)}>
        {open ? 'Cancelar el borrado' : 'Borrar todos los datos'}
      </TextButton>

      {open ? (
        <Card>
          <p className="ds-body">
            Se borra todo: perfil, rutina, sesiones, pesos, actividades y los ejercicios
            propios. La biblioteca de serie se queda. No se puede deshacer, y sin una copia
            exportada no hay vuelta atrás.
          </p>

          <LiveField
            label="Confirmación"
            hint={
              gate === 'ready'
                ? 'Coincide: puedes borrar.'
                : gate === 'wrong'
                  ? `No coincide. Escribe ${DELETE_ALL_CONFIRMATION}.`
                  : `Escribe ${DELETE_ALL_CONFIRMATION} para borrar.`
            }
            hintTone={gate === 'ready' ? 'success' : gate === 'wrong' ? 'danger' : 'muted'}
            value={confirmation}
            capitalise
            onChange={setConfirmation}
          />

          <TextButton align="start" tone="danger" disabled={gate !== 'ready' || deleting} onClick={remove}>
            {deleting ? 'Borrando…' : 'Borrar definitivamente'}
          </TextButton>
        </Card>
      ) : null}
    </section>
  );
}
