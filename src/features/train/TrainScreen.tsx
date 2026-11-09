/*
 * Entrenar — the week's routine and what happened in it (design-system §8).
 *
 * The title and the week, today when nothing is scheduled, the ordered template with one
 * state word per day — written only when the day has something to say — the readaptation
 * block quoted quietly, and one entry to routine management.
 *
 * The management sheet is a real editor (`RoutineEditor.tsx`): it reorders, adds,
 * removes and re-prescribes through `plan.save`, one day per call. Its rules live in
 * `editor.ts`; this file boots the screen, reads what the sheet needs, and performs the
 * one write.
 *
 * Like Inicio: no `Date.now()`, no port construction — both arrive from `AppProvider`,
 * and a demo mounts the same screen with fixtures through the same props.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  Card,
  Chip,
  DataRow,
  EmptyState,
  ErrorBanner,
  SectionLabel,
  TextButton,
} from '../../design-system';
import type { PlanDay, StoragePort } from '../../storage';
import { useAppServices } from '../../app/providers';
import type { Clock } from '../session/controller';
import { useStartSession, type StartNotice } from '../session/startSession';
import { summaryHash } from '../summary/route';
import { DemoTrain } from './DemoTrain';
import { demoFlagOf, useLocationKey } from '../home/useHash';
import { RoutineSheet, type EditorSource, type SaveDayResult } from './RoutineEditor';
import { trainViewOf, type TrainInput, type TrainView } from './selectors';
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
  // The library is here for the editor's add list: the screen reads it once, so opening
  // the editor is instant and the component does no I/O of its own.
  const library = await storage.exercises.all();
  const phaseState = await storage.meta.readPhaseState();
  return { now, plan, sessions, library, phaseState };
}

export interface TrainBodyProps {
  readonly view: TrainView;
  /** The stored template, the library and the history: everything the editor touches. */
  readonly source: EditorSource;
  /** `null` when the sheet is closed; `{ dayId: null }` shows the whole routine. */
  readonly routine: { readonly dayId: string | null } | null;
  readonly onOpenRoutine: (dayId: string | null) => void;
  readonly onCloseRoutine: () => void;
  readonly onSaveDay: (day: PlanDay) => Promise<SaveDayResult>;
  readonly onOpenSession: (sessionId: string) => void;
  readonly onStartDay: (planDayId: string) => void;
  readonly starting: boolean;
  readonly startNotice: StartNotice | null;
}

export function TrainBody(props: TrainBodyProps): React.ReactElement {
  const {
    view,
    source,
    routine,
    onOpenRoutine,
    onCloseRoutine,
    onSaveDay,
    onOpenSession,
    onStartDay,
    starting,
    startNotice,
  } = props;

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
          {/* A rest day is not the headline of the screen: the three routine days are.
              It used to be a card with a 22 px `Nada programado` title above them. */}
          <p className="ds-body ds-body--muted">
            Hoy no hay ninguna sesión programada. Descansa, o adelanta un día desde la rutina.
          </p>
        </section>
      ) : null}

      {view.days.length === 0 ? null : (
        <section className="train__section">
          <Card padding="list" label="Días de la rutina">
            {view.days.map((day) => {
              // S3: `pendiente` is the ordinary state of a fresh week, so three identical
              // words in a fixed right-hand column said nothing and cost the titles their
              // line (`Peso muerto / Tracción` wrapped). Only the states that carry a fact
              // are written: `hoy` and `hecha`. `statusOf` still decides all three.
              const quiet = day.status.word === 'pendiente';
              return (
                <DataRow
                  key={day.planDayId}
                  icon="dumbbell"
                  title={day.title}
                  subtitle={day.subtitle}
                  {...(quiet ? {} : { status: { word: day.status.word, tone: day.status.tone } })}
                  onSelect={() => onOpenRoutine(day.planDayId)}
                  selectLabel={
                    quiet
                      ? `${day.title}. ${day.subtitle}.`
                      : `${day.title}. ${day.subtitle}. ${day.status.word}`
                  }
                />
              );
            })}
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
          source={source}
          onClose={onCloseRoutine}
          onSaveDay={onSaveDay}
          onOpenSession={onOpenSession}
          onStartDay={onStartDay}
          starting={starting}
          startNotice={startNotice}
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
  /** Overridden by the demo, whose created session is not in the real store either. */
  readonly onNavigate?: ((href: string) => void) | undefined;
}

export function TrainScreenWithPort({
  storage,
  clock,
  onOpenSession,
  onNavigate,
}: TrainScreenWithPortProps): React.ReactElement {
  const [boot, setBoot] = useState<Boot>({ phase: 'loading', input: null });
  const [attempt, setAttempt] = useState(0);
  const [routine, setRoutine] = useState<{ readonly dayId: string | null } | null>(null);
  const start = useStartSession({ storage, clock, onNavigate });

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
  const { dismiss } = start;
  const closeRoutine = useCallback(() => {
    setRoutine(null);
    // Closing the sheet clears the reason the last start did nothing: it belongs to the
    // sheet, not to the screen behind it.
    dismiss();
  }, [dismiss]);
  const openSessionRoute = useCallback((sessionId: string) => {
    window.location.hash = summaryHash(sessionId);
  }, []);
  const openSession = onOpenSession ?? openSessionRoute;

  /**
   * The editor's one write: `plan.save` for the day, in one call, which the repository
   * performs in one transaction (`plan.save` replaces the day's items and deletes the
   * ones the draft dropped). On success the screen's copy of the plan is replaced by what
   * was just written, so the sheet and the list show the stored template without a
   * second read; on failure nothing is patched and the sheet keeps its draft to retry.
   */
  const saveDay = useCallback(
    async (day: PlanDay): Promise<SaveDayResult> => {
      try {
        await storage.plan.save(day);
      } catch {
        return {
          ok: false,
          message:
            'No se pudo guardar la rutina. Lo que estaba guardado sigue como estaba: puedes reintentar sin volver a editar.',
        };
      }

      setBoot((current) =>
        current.input === null
          ? current
          : {
              ...current,
              input: {
                ...current.input,
                plan: current.input.plan.map((stored) => (stored.id === day.id ? day : stored)),
              },
            },
      );
      return { ok: true };
    },
    [storage],
  );

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
      source={{ plan: boot.input.plan, library: boot.input.library, sessions: boot.input.sessions }}
      routine={routine}
      onOpenRoutine={openRoutine}
      onCloseRoutine={closeRoutine}
      onSaveDay={saveDay}
      onOpenSession={openSession}
      onStartDay={start.start}
      starting={start.busy}
      startNotice={start.notice}
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
