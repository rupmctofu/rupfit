/*
 * Entrenar — the week's routine and what happened in it (design-system §8).
 *
 * The title and the week, today when nothing is scheduled, the ordered template with one
 * state word per day, the readaptation block quoted quietly, and one entry to routine
 * management.
 *
 * The management sheet is **read only**, and it says so in one banner instead of
 * offering controls that do nothing: adding, removing, reordering or changing a
 * prescription needs a write path (`plan.save`) that the app tier has not built yet, and
 * a control that silently does nothing is worse than a sentence that explains why.
 *
 * Like Inicio: no `Date.now()`, no port construction — both arrive from `AppProvider`,
 * and a demo mounts the same screen with fixtures through the same props.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  Banner,
  Card,
  Chip,
  DataRow,
  EmptyState,
  ErrorBanner,
  SectionLabel,
  TextButton,
} from '../../design-system';
import type { StoragePort } from '../../storage';
import { useAppServices } from '../../app/providers';
import type { Clock } from '../session/controller';
import { summaryHash } from '../summary/route';
import { DemoTrain } from './DemoTrain';
import { demoFlagOf, useLocationKey } from '../home/useHash';
import { trainViewOf, type TrainDayView, type TrainInput, type TrainView } from './selectors';
import './train.css';

/** `?demo=entrenar` — the review surface, resolved here until the router owns it. */
export const DEMO_FLAG = 'entrenar';

/** Enough stored sessions to prove the weekday of every day of the current week. */
export const TRAIN_SESSION_WINDOW = 12;

type LoadPhase = 'loading' | 'ready' | 'failed';

interface Boot {
  readonly phase: LoadPhase;
  readonly input: TrainInput | null;
}

/** The reads Entrenar performs, in order, all of them through `StoragePort`. */
async function readTrain(storage: StoragePort, now: number): Promise<TrainInput> {
  await storage.open();
  const plan = await storage.plan.all();
  const sessions = await storage.sessions.recent(TRAIN_SESSION_WINDOW);
  const phaseState = await storage.meta.readPhaseState();
  return { now, plan, sessions, phaseState };
}

interface RoutineSheetProps {
  readonly view: TrainView;
  /** The day the sheet opened on; `null` means the whole routine. */
  readonly dayId: string | null;
  readonly onClose: () => void;
  readonly onOpenSession: (sessionId: string) => void;
}

function sessionActionLabel(day: TrainDayView): string {
  if (day.status.word === 'hecha') return 'Ver el resumen';
  if (day.status.word === 'hoy') return 'Abrir la sesión de hoy';
  return 'Abrir la sesión';
}

/** Routine management: the template, read only, one prescription line per exercise. */
function RoutineSheet({ view, dayId, onClose, onOpenSession }: RoutineSheetProps): React.ReactElement {
  const selected = dayId === null ? null : (view.days.find((day) => day.planDayId === dayId) ?? null);
  const days = selected === null ? view.days : [selected];
  const title = selected === null ? 'Tu rutina' : selected.title;

  return (
    <div className="train-sheet" role="dialog" aria-modal="true" aria-label={title}>
      <header className="train-sheet__top">
        <h1 className="ds-screen-title">{title}</h1>
        <button type="button" className="ds-action train-sheet__close" onClick={onClose}>
          Cerrar
        </button>
      </header>

      <div className="train-sheet__body">
        <Banner
          tone="info"
          title="Sólo lectura"
          text="La app todavía no puede añadir, quitar, reordenar ni cambiar series. Lo que ves es la plantilla guardada, tal cual se usará en la próxima sesión."
        />

        {days.length === 0 ? (
          <EmptyState>Todavía no hay ninguna rutina guardada.</EmptyState>
        ) : (
          days.map((day) => (
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
              {day.sessionId === null ? null : (
                <TextButton align="start" onClick={() => onOpenSession(day.sessionId as string)}>
                  {sessionActionLabel(day)}
                </TextButton>
              )}
            </Card>
          ))
        )}
      </div>
    </div>
  );
}

export interface TrainBodyProps {
  readonly view: TrainView;
  /** `null` when the sheet is closed; `{ dayId: null }` shows the whole routine. */
  readonly routine: { readonly dayId: string | null } | null;
  readonly onOpenRoutine: (dayId: string | null) => void;
  readonly onCloseRoutine: () => void;
  readonly onOpenSession: (sessionId: string) => void;
}

export function TrainBody(props: TrainBodyProps): React.ReactElement {
  const { view, routine, onOpenRoutine, onCloseRoutine, onOpenSession } = props;

  return (
    <div className="train">
      <header className="train__head">
        <h1 className="ds-screen-title">Entrenar</h1>
        <p className="ds-meta">{view.weekLabel}</p>
      </header>

      {view.planEmpty ? (
        <section className="train__section">
          <EmptyState action={{ label: 'Ver la rutina', onClick: () => onOpenRoutine(null) }}>
            Todavía no hay ninguna rutina guardada.
          </EmptyState>
        </section>
      ) : null}

      {view.today !== null && view.today.kind === 'rest' ? (
        <section className="train__section">
          <SectionLabel>Hoy</SectionLabel>
          <Card>
            <h2 className="ds-card-title">Descanso</h2>
            <p className="ds-body ds-body--muted">
              Hoy no hay ninguna sesión programada. Descansa, o adelanta un día desde la rutina.
            </p>
            <TextButton align="start" onClick={() => onOpenRoutine(null)}>
              Ver la rutina
            </TextButton>
          </Card>
        </section>
      ) : null}

      {view.days.length === 0 ? null : (
        <section className="train__section">
          <Card padding="list" label="Días de la rutina">
            {view.days.map((day) => (
              <DataRow
                key={day.planDayId}
                icon="dumbbell"
                title={day.title}
                subtitle={day.subtitle}
                status={{ word: day.status.word, tone: day.status.tone }}
                onSelect={() => onOpenRoutine(day.planDayId)}
                selectLabel={`${day.title}. ${day.subtitle}. ${day.status.word}`}
              />
            ))}
          </Card>
        </section>
      )}

      {view.phase === null ? null : (
        <section className="train__section">
          <Card>
            <div className="ds-row">
              <span className="ds-body">{view.phase.label}</span>
              <Chip>{view.phase.chip}</Chip>
            </div>
            <hr className="ds-hairline" />
            <p className="ds-caption">{view.phase.note}</p>
          </Card>
        </section>
      )}

      {view.days.length === 0 ? null : (
        <TextButton onClick={() => onOpenRoutine(null)}>Ver la rutina</TextButton>
      )}

      {routine === null ? null : (
        <RoutineSheet
          view={view}
          dayId={routine.dayId}
          onClose={onCloseRoutine}
          onOpenSession={onOpenSession}
        />
      )}
    </div>
  );
}

function TrainLoading(): React.ReactElement {
  return (
    <div className="train">
      <p className="ds-meta">Abriendo tu rutina…</p>
    </div>
  );
}

export interface TrainScreenWithPortProps {
  readonly storage: StoragePort;
  readonly clock: Clock;
  /** Overridden by the demo, whose fixture sessions are not in the real store. */
  readonly onOpenSession?: ((sessionId: string) => void) | undefined;
}

export function TrainScreenWithPort({
  storage,
  clock,
  onOpenSession,
}: TrainScreenWithPortProps): React.ReactElement {
  const [boot, setBoot] = useState<Boot>({ phase: 'loading', input: null });
  const [attempt, setAttempt] = useState(0);
  const [routine, setRoutine] = useState<{ readonly dayId: string | null } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setBoot({ phase: 'loading', input: null });
    readTrain(storage, clock.now()).then(
      (input) => {
        if (!cancelled) setBoot({ phase: 'ready', input });
      },
      () => {
        if (!cancelled) setBoot({ phase: 'failed', input: null });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [storage, clock, attempt]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  const openRoutine = useCallback((dayId: string | null) => setRoutine({ dayId }), []);
  const closeRoutine = useCallback(() => setRoutine(null), []);
  const openSessionRoute = useCallback((sessionId: string) => {
    window.location.hash = summaryHash(sessionId);
  }, []);
  const openSession = onOpenSession ?? openSessionRoute;

  if (boot.phase === 'failed') {
    return (
      <div className="train">
        <ErrorBanner message="No se pudo abrir tu rutina. Inténtalo otra vez." onRetry={retry} />
      </div>
    );
  }

  if (boot.input === null) {
    return <TrainLoading />;
  }

  return (
    <TrainBody
      view={trainViewOf(boot.input)}
      routine={routine}
      onOpenRoutine={openRoutine}
      onCloseRoutine={closeRoutine}
      onOpenSession={openSession}
    />
  );
}

/** The T5 entry for `#/entrenar`, with the real port. */
export function TrainScreen(): React.ReactElement {
  const { storage, clock } = useAppServices();
  const location = useLocationKey();
  const search = location.slice(0, Math.max(0, location.indexOf('#')));
  if (demoFlagOf(search) === DEMO_FLAG) return <DemoTrain />;
  return <TrainScreenWithPort storage={storage} clock={clock} />;
}
