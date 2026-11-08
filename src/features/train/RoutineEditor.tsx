/**
 * Entrenar's routine sheet: the week as stored, and the editor that changes it
 * (FR-3.2, FR-3.3, S4 S5 S6).
 *
 * The sheet used to be read only, and said so, because the app tier had no write path
 * for a plan (`docs/roadmap.md` §"Open work recorded at this state", item 1). This is
 * that path: reorder within a day, add an exercise from the library, remove one, and
 * change an item's sets, reps and target RIR — one day at a time, so that saving is one
 * `plan.save` call and therefore one transaction that either happens or does not.
 *
 * Four rules show up in the copy and in the controls:
 *
 * 1. **Editing changes what comes next, never what happened.** The banner says it in one
 *    sentence, and it is true because a stored session carries its own prescription
 *    snapshot and its frozen recommendation (I-2). Nothing here writes a session.
 * 2. **Removing an exercise is not deleting it.** The library row stays, so history
 *    keeps its id and its name snapshot (I-4); an exercise that a stored session already
 *    trained is marked `con historial` so the removal is an informed one.
 * 3. **A day with exercises cannot be left empty.** `removeItem` refuses the last item
 *    with a sentence instead of writing a template that prescribes nothing.
 * 4. **No `confirm()`, no prompt.** Leaving with unsaved edits is a banner with three
 *    real buttons, and a failed save keeps the draft on screen with a retry.
 *
 * Every decision lives in `editor.ts`; this file is layout, state and Spanish copy. The
 * clock is not read here (this screen has no time-sensitive rule) and no port is
 * constructed: the write arrives as `onSaveDay`.
 */

import { useCallback, useMemo, useState } from 'react';
import {
  Banner,
  Card,
  Chip,
  DataRow,
  EmptyState,
  ErrorBanner,
  PrimaryAction,
  SectionLabel,
  Stepper,
  TextButton,
} from '../../design-system';
import type { Exercise, PlanDay, WorkoutSession } from '../../storage';
import { targetLine } from '../session/format';
import { createIdFactory, type StartNotice } from '../session/startSession';
import {
  addExercise,
  addableExercises,
  canMoveItemDown,
  canMoveItemUp,
  defaultPrescription,
  editableDayOf,
  isDirty,
  moveItemDown,
  moveItemUp,
  planDayOf,
  removeItem,
  setRepRange,
  setSets,
  setTargetRIR,
  trainedBefore,
  validateDraft,
  RIR_BOUNDS,
  REPS_BOUNDS,
  SETS_BOUNDS,
  type EditableDay,
  type EditableItem,
  type EditorOutcome,
} from './editor';
import { formatDayName, type TrainDayView, type TrainView } from './selectors';
import './train.css';

/** What the sheet needs to edit anything: the stored template, the library, the history. */
export interface EditorSource {
  readonly plan: readonly PlanDay[];
  readonly library: readonly Exercise[];
  readonly sessions: readonly WorkoutSession[];
}

/** The write result, so the sheet never sees a storage error as a rejection. */
export type SaveDayResult = { readonly ok: true } | { readonly ok: false; readonly message: string };

/** The one sentence that keeps a plan edit away from history (I-2). */
export const PLAN_EDIT_NOTE =
  'Guardar cambia lo que prescribirán las próximas sesiones. Una sesión ya empezada, o ya cerrada, conserva su prescripción: no se toca.';

export const PLAN_SAVED_NOTE = 'Rutina guardada. Las próximas sesiones se prescribirán con estos cambios.';

export interface RoutineSheetProps {
  readonly view: TrainView;
  /** The day the sheet opened on; `null` means the whole routine. */
  readonly dayId: string | null;
  readonly source: EditorSource;
  readonly onClose: () => void;
  /** One `plan.save` per day; the draft is only handed over when it validates. */
  readonly onSaveDay: (day: PlanDay) => Promise<SaveDayResult>;
  readonly onOpenSession: (sessionId: string) => void;
  /** Entrenar names the day it starts, instead of letting the rotation decide. */
  readonly onStartDay: (planDayId: string) => void;
  readonly starting: boolean;
  readonly startNotice: StartNotice | null;
}

function sessionActionLabel(day: TrainDayView): string {
  if (day.status.word === 'hecha') return 'Ver el resumen';
  if (day.status.word === 'hoy') return 'Abrir la sesión de hoy';
  return 'Empezar este día';
}

export function RoutineSheet(props: RoutineSheetProps): React.ReactElement {
  const { view, dayId, source, onClose, onSaveDay, onOpenSession, onStartDay, starting, startNotice } = props;

  const [editing, setEditing] = useState<{ readonly stored: PlanDay; readonly draft: EditableDay } | null>(
    null,
  );
  const [expanded, setExpanded] = useState<string | null>(null);
  const [guard, setGuard] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);

  const newId = useMemo(() => createIdFactory(), []);

  const selected = dayId === null ? null : (view.days.find((day) => day.planDayId === dayId) ?? null);
  const days = selected === null ? view.days : [selected];
  const title = selected === null ? 'Tu rutina' : selected.title;
  const draft = editing?.draft ?? null;
  // The sheet can be opened on the whole routine, so the edited day names itself.
  const editTitle = draft === null ? title : formatDayName(draft.name);
  const dirty = editing === null ? false : isDirty(editing.stored, editing.draft);

  const apply = useCallback((outcome: EditorOutcome): void => {
    if (!outcome.ok) {
      setGuard(outcome.message);
      return;
    }
    setGuard(null);
    setSaved(null);
    setEditing((current) => (current === null ? current : { stored: current.stored, draft: outcome.day }));
  }, []);

  const startEditing = useCallback((day: PlanDay): void => {
    setEditing({ stored: day, draft: editableDayOf(day) });
    setExpanded(null);
    setGuard(null);
    setSaveError(null);
    setSaved(null);
    setLeaving(false);
  }, []);

  const discard = useCallback((): void => {
    setEditing(null);
    setExpanded(null);
    setGuard(null);
    setSaveError(null);
    setLeaving(false);
  }, []);

  const save = useCallback(async (): Promise<void> => {
    if (editing === null) return;
    const checked = validateDraft(editing.draft);
    if (!checked.ok) {
      setGuard(checked.message);
      return;
    }

    setSaving(true);
    setSaveError(null);
    const result = await onSaveDay(planDayOf(editing.draft));
    setSaving(false);

    if (!result.ok) {
      // The draft stays: a failed save is retried, not retyped.
      setSaveError(result.message);
      return;
    }
    setSaved(PLAN_SAVED_NOTE);
    setEditing(null);
    setExpanded(null);
    setLeaving(false);
  }, [editing, onSaveDay]);

  const requestLeave = useCallback((): void => {
    if (editing === null) {
      onClose();
      return;
    }
    if (!dirty) {
      discard();
      return;
    }
    setLeaving(true);
  }, [dirty, discard, editing, onClose]);

  return (
    <div
      className="train-sheet"
      role="dialog"
      aria-modal="true"
      aria-label={editing === null ? title : `Editar ${editTitle}`}
    >
      <header className="train-sheet__top">
        <h1 className="ds-screen-title">{editing === null ? title : `Editar ${editTitle}`}</h1>
        <button
          type="button"
          className="ds-action train-sheet__close"
          onClick={editing === null ? onClose : requestLeave}
        >
          {editing === null ? 'Cerrar' : 'Volver'}
        </button>
      </header>

      <div className="train-sheet__body">
        <Banner tone="info" title={editing === null ? 'Editar la rutina' : 'Antes de guardar'} text={PLAN_EDIT_NOTE} />

        {saved === null ? null : <Banner tone="success" title={saved} />}

        {/* Why nothing opened. A failed write offers `Reintentar`; a missing profile sends
            the owner to the tab that can fix it, because a retry cannot. */}
        {startNotice === null ? null : startNotice.tone === 'danger' ? (
          <ErrorBanner message={startNotice.message} />
        ) : (
          <Banner tone="warning" title={startNotice.message} />
        )}

        {editing === null ? (
          <RoutineReadList
            days={days}
            plan={source.plan}
            onOpenSession={onOpenSession}
            onStartDay={onStartDay}
            onEdit={startEditing}
            starting={starting}
          />
        ) : draft === null ? null : (
          <>
            {leaving ? (
              <Card>
                <h2 className="ds-card-title">Hay cambios sin guardar</h2>
                <p className="ds-body ds-body--muted">
                  Si vuelves ahora, la rutina guardada se queda como estaba y lo que has cambiado se
                  pierde.
                </p>
                <div className="train-edit__footer">
                  <TextButton align="start" onClick={() => setLeaving(false)}>
                    Seguir editando
                  </TextButton>
                  <TextButton align="start" disabled={saving} onClick={() => void save()}>
                    Guardar y volver
                  </TextButton>
                  <TextButton align="start" onClick={discard}>
                    Descartar los cambios
                  </TextButton>
                </div>
              </Card>
            ) : null}

            {guard === null ? null : <Banner tone="warning" title="No se puede hacer eso" text={guard} />}
            {saveError === null ? null : (
              <ErrorBanner message={saveError} onRetry={() => void save()} />
            )}

            <Card label={`Editar el día ${editTitle}`}>
              <div className="ds-row">
                <h2 className="ds-card-title">{editTitle}</h2>
                <Chip>
                  {draft.items.length === 1 ? '1 ejercicio' : `${String(draft.items.length)} ejercicios`}
                </Chip>
              </div>

              {draft.items.length === 0 ? (
                <p className="ds-meta">
                  Este día no tiene ejercicios. Añade uno abajo: un día vacío no prescribe nada y no
                  se puede guardar.
                </p>
              ) : (
                <ol className="train-edit__items">
                  {draft.items.map((item) => (
                    <li key={item.id} className="train-edit__item">
                      <div className="train-edit__head">
                        <span className="train-edit__text">
                          <span className="ds-body">{item.exerciseName}</span>
                          <span className="ds-caption">{targetLine(item.prescription)}</span>
                        </span>
                        {trainedBefore(source.sessions, item) ? (
                          <Chip tone="neutral" dot>
                            con historial
                          </Chip>
                        ) : null}
                      </div>

                      <div className="train-edit__actions">
                        <TextButton
                          align="start"
                          disabled={!canMoveItemUp(draft, item.id)}
                          onClick={() => apply(moveItemUp(draft, item.id))}
                        >
                          Subir
                        </TextButton>
                        <TextButton
                          align="start"
                          disabled={!canMoveItemDown(draft, item.id)}
                          onClick={() => apply(moveItemDown(draft, item.id))}
                        >
                          Bajar
                        </TextButton>
                        <TextButton
                          align="start"
                          onClick={() => setExpanded(expanded === item.id ? null : item.id)}
                        >
                          {expanded === item.id ? 'Cerrar' : 'Cambiar series y reps'}
                        </TextButton>
                        <TextButton align="start" onClick={() => apply(removeItem(draft, item.id))}>
                          Quitar
                        </TextButton>
                      </div>

                      {expanded === item.id ? (
                        <PrescriptionEditor
                          item={item}
                          onChange={(change) => apply(change(draft))}
                        />
                      ) : null}
                    </li>
                  ))}
                </ol>
              )}

              <p className="ds-caption">
                Quitar un ejercicio lo quita de este día, no de la biblioteca: las sesiones que ya lo
                hicieron se quedan como están.
              </p>
            </Card>

            <section className="train__section">
              <SectionLabel>Añadir un ejercicio</SectionLabel>
              {source.library.length === 0 ? (
                <Card>
                  <p className="ds-body ds-body--muted">
                    La biblioteca está vacía. Los ejercicios llegan con la rutina o desde una copia
                    importada; desde aquí se eligen, no se crean.
                  </p>
                </Card>
              ) : addableExercises(draft, source.library).length === 0 ? (
                <Card>
                  <p className="ds-body ds-body--muted">
                    Este día ya tiene todos los ejercicios activos de la biblioteca.
                  </p>
                </Card>
              ) : (
                <Card padding="list" label="Ejercicios de la biblioteca">
                  {addableExercises(draft, source.library).map((exercise) => (
                    <DataRow
                      key={exercise.id}
                      title={exercise.name}
                      subtitle={targetLine(defaultPrescription(exercise))}
                      onSelect={() => apply(addExercise(draft, exercise, newId))}
                      selectLabel={`Añadir ${exercise.name} a ${editTitle}`}
                    />
                  ))}
                </Card>
              )}
            </section>

            <div className="train-edit__footer">
              <PrimaryAction
                disabled={!dirty || saving}
                onClick={() => void save()}
                className="train-edit__save"
              >
                {saving ? 'Guardando…' : 'Guardar la rutina'}
              </PrimaryAction>
              <TextButton align="start" disabled={saving} onClick={discard}>
                Descartar los cambios
              </TextButton>
              <p className="ds-caption">
                {dirty ? 'Hay cambios sin guardar.' : 'No hay cambios que guardar.'}
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** The stored template, with the one control that opens the editor for a day. */
interface RoutineReadListProps {
  readonly days: readonly TrainDayView[];
  readonly plan: readonly PlanDay[];
  readonly onOpenSession: (sessionId: string) => void;
  readonly onStartDay: (planDayId: string) => void;
  readonly onEdit: (day: PlanDay) => void;
  readonly starting: boolean;
}

function RoutineReadList({
  days,
  plan,
  onOpenSession,
  onStartDay,
  onEdit,
  starting,
}: RoutineReadListProps): React.ReactElement {
  if (days.length === 0) {
    return <EmptyState>Todavía no hay ninguna rutina guardada.</EmptyState>;
  }

  return (
    <>
      {days.map((day) => {
        const stored = plan.find((candidate) => candidate.id === day.planDayId);
        return (
          <Card key={day.planDayId} label={day.title}>
            <div className="ds-row">
              <h2 className="ds-card-title">{day.title}</h2>
              <Chip>{day.items.length === 1 ? '1 ejercicio' : `${String(day.items.length)} ejercicios`}</Chip>
            </div>
            {day.items.length === 0 ? (
              <p className="ds-meta">Este día todavía no tiene ejercicios.</p>
            ) : (
              <ol className="train-sheet__items">
                {day.items.map((item, index) => (
                  <li key={`${day.planDayId}-${String(index)}`} className="train-sheet__item">
                    <span className="ds-body">{item.name}</span>
                    <span className="ds-caption">{item.prescription}</span>
                  </li>
                ))}
              </ol>
            )}

            {stored === undefined ? null : (
              <TextButton align="start" onClick={() => onEdit(stored)}>
                Editar este día
              </TextButton>
            )}

            {day.status.word === 'hecha' && day.sessionId !== null ? (
              <TextButton align="start" onClick={() => onOpenSession(day.sessionId as string)}>
                {sessionActionLabel(day)}
              </TextButton>
            ) : day.items.length === 0 ? null : (
              /* A day that is not finished is opened by `planStart`, which reuses the
                 session already scheduled for today and creates one when there is none. */
              <TextButton align="start" disabled={starting} onClick={() => onStartDay(day.planDayId)}>
                {starting ? 'Empezando…' : sessionActionLabel(day)}
              </TextButton>
            )}
          </Card>
        );
      })}
    </>
  );
}

/**
 * The five steppers of one item's prescription. Each one clamps against its own pair
 * instead of producing an inverted range, so a tap cannot create a state the pure
 * validation would then have to refuse.
 */
interface PrescriptionEditorProps {
  readonly item: EditableItem;
  readonly onChange: (change: (day: EditableDay) => EditorOutcome) => void;
}

function PrescriptionEditor({ item, onChange }: PrescriptionEditorProps): React.ReactElement {
  const { prescription } = item;
  const reps = prescription.repRange;
  const rir = prescription.targetRIR;

  return (
    <div className="train-edit__prescription">
      <Stepper
        label={`${item.exerciseName}: series`}
        value={prescription.sets}
        min={SETS_BOUNDS.min}
        max={SETS_BOUNDS.max}
        unit="series"
        onChange={(next) => onChange((day) => setSets(day, item.id, next))}
      />
      <Stepper
        label={`${item.exerciseName}: repeticiones, mínimo`}
        value={reps.lowerBound}
        min={REPS_BOUNDS.min}
        max={REPS_BOUNDS.max}
        unit="reps"
        onChange={(next) =>
          onChange((day) =>
            setRepRange(day, item.id, { lowerBound: next, upperBound: Math.max(next, reps.upperBound) }),
          )
        }
      />
      <Stepper
        label={`${item.exerciseName}: repeticiones, máximo`}
        value={reps.upperBound}
        min={REPS_BOUNDS.min}
        max={REPS_BOUNDS.max}
        unit="reps"
        onChange={(next) =>
          onChange((day) =>
            setRepRange(day, item.id, { lowerBound: Math.min(next, reps.lowerBound), upperBound: next }),
          )
        }
      />
      <Stepper
        label={`${item.exerciseName}: RIR, mínimo`}
        value={rir.lowerBound}
        min={RIR_BOUNDS.min}
        max={RIR_BOUNDS.max}
        unit="RIR"
        onChange={(next) =>
          onChange((day) =>
            setTargetRIR(day, item.id, { lowerBound: next, upperBound: Math.max(next, rir.upperBound) }),
          )
        }
      />
      <Stepper
        label={`${item.exerciseName}: RIR, máximo`}
        value={rir.upperBound}
        min={RIR_BOUNDS.min}
        max={RIR_BOUNDS.max}
        unit="RIR"
        onChange={(next) =>
          onChange((day) =>
            setTargetRIR(day, item.id, { lowerBound: Math.min(next, rir.lowerBound), upperBound: next }),
          )
        }
      />
      <p className="ds-caption">
        De {String(SETS_BOUNDS.min)} a {String(SETS_BOUNDS.max)} series, de {String(REPS_BOUNDS.min)} a{' '}
        {String(REPS_BOUNDS.max)} repeticiones y de {String(RIR_BOUNDS.min)} a {String(RIR_BOUNDS.max)} RIR:
        nunca al fallo.
      </p>
    </div>
  );
}
