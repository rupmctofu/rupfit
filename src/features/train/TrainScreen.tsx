/*
 * Ejercicios — the routine the owner can train from, and the real session for today
 * (design-system §8, odd/tasks/dark-premium-redesign.md T8).
 *
 * The tab is called `Ejercicios`, so the screen opens the way the reference's chosen
 * direction does: the session that really exists today (or no session at all), then the
 * routine days as the surface's body, then the readaptation block quoted quietly. A rest
 * day is one sentence under the routine, never the hero of the screen; a day that says
 * nothing keeps saying nothing (`pendiente` is not repeated down the list).
 *
 * Since T8 the composition is the redesign's: the screen names itself at `--text-display`,
 * today's session is the protagonist card one tonal step above the canvas (its one action
 * inside it, as on Inicio), and every routine day is a card of its own — the whole card is
 * the target, and the state that carries a fact is a chip. Depth is a tonal step plus the
 * hairline; nothing here floats.
 *
 * One filled violet action at most: `Abrir la sesión de hoy`, and only when a session for
 * today exists. Every other action of the screen — including opening a day to reorder,
 * edit or start it — lives in the routine sheet, where it already did.
 *
 * The library is browsable where it always was: inside that sheet's `Añadir un ejercicio`
 * block, which lists every library row with its own prescription line. It is not hoisted
 * onto the screen, because a read-only dump of the 68 seeded rows is a list with no action
 * and no purpose; the sheet is the surface that can use it.
 *
 * The management sheet is a real editor (`RoutineEditor.tsx`): it reorders, adds,
 * removes and re-prescribes through `plan.save`, one day per call. Its rules live in
 * `editor.ts`; this file boots the screen, reads what the sheet needs, and performs the
 * one write. Nothing of that changed in T8: every handler, read and write is the one that
 * was here before.
 *
 * Like Inicio: no `Date.now()`, no port construction — both arrive from `AppProvider`,
 * and a demo mounts the same screen with fixtures through the same props.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  Banner,
  Card,
  Chip,
  EmptyState,
  ErrorBanner,
  Icon,
  PrimaryAction,
  SectionLabel,
  TextButton,
} from '../../design-system';
import type { PlanDay, StoragePort } from '../../storage';
import { useAppServices } from '../../app/providers';
import type { Clock } from '../session/controller';
import { useStartSession, type StartNotice } from '../session/startSession';
import { summaryHash } from '../summary/route';
import { DemoTrain } from './DemoTrain';
import { formatExerciseCount } from '../home/format';
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

  // Today's session is opened through the template day it belongs to: `planStart` opens
  // the session already scheduled for today instead of writing a second one. A session
  // whose day has since left the template keeps its title on screen and offers no
  // action, because there is no day left to name.
  const todaySession = view.today !== null && view.today.kind === 'session' ? view.today : null;
  const todayDay =
    todaySession === null
      ? null
      : (view.days.find((day) => day.sessionId === todaySession.sessionId) ?? null);
  const todayClosed = todayDay !== null && todayDay.status.word === 'hecha';

  return (
    <div className="train">
      {/* The screen's own name, at the top of the type scale (T3's `--text-display`):
          Ejercicios is the tab the owner opens to decide what he trains, so it names
          itself once and lets the cards below carry the weight. */}
      <header className="train__head">
        <h1 className="ds-display-title">Ejercicios</h1>
        <p className="ds-meta">{view.weekLabel}</p>
      </header>

      {view.planEmpty ? (
        <section className="train__section">
          <EmptyState action={{ label: 'Ver la rutina', onClick: () => onOpenRoutine(null) }}>
            Todavía no hay ninguna rutina guardada.
          </EmptyState>
        </section>
      ) : null}

      {/* The real session for today, carried by the session and not by the template: when
          the two disagree, the session wins and no day is claimed that has not been
          scheduled. It is the one place the screen spends the violet fill. */}
      {todaySession === null ? null : (
        <section className="train__section">
          <SectionLabel icon={<Icon name="calendar" size={14} />}>Hoy</SectionLabel>
          {/* The protagonist, as on Inicio: one step above the canvas, the day at the large
              card title, and its one action inside the card it starts. */}
          <Card className="train-today">
            <h2 className="ds-card-title ds-card-title--large train-today__title">
              {todaySession.title}
            </h2>
            {todayDay === null || todayClosed ? null : (
              <p className="ds-meta">{formatExerciseCount(todayDay.items.length)}</p>
            )}

            {todayDay === null ? null : todayClosed ? (
              <TextButton
                align="start"
                className="train-today__action"
                onClick={() => onOpenSession(todaySession.sessionId)}
              >
                Ver el resumen
              </TextButton>
            ) : (
              <PrimaryAction
                icon="play"
                className="train-today__action"
                disabled={starting}
                onClick={() => onStartDay(todayDay.planDayId)}
              >
                {starting ? 'Abriendo…' : 'Abrir la sesión de hoy'}
              </PrimaryAction>
            )}
          </Card>

          {/* Why nothing opened. The sheet repeats the same sentence when it is open, so
              this one only belongs to the screen behind it. */}
          {routine !== null || startNotice === null ? null : startNotice.tone === 'danger' ? (
            <ErrorBanner
              message={startNotice.message}
              {...(todayDay === null
                ? {}
                : { onRetry: () => onStartDay(todayDay.planDayId) })}
            />
          ) : (
            <Banner tone="warning" title={startNotice.message} />
          )}
        </section>
      )}

      {/* One card per routine day: the week is the body of the screen, and each day is a
          surface the thumb can aim at instead of a line inside one long list. The card is
          the whole target, and it is still the same `onOpenRoutine(day.planDayId)` the row
          called; only the shape and the state's carrier changed. */}
      {view.days.length === 0 ? null : (
        <section className="train__section">
          <SectionLabel>Tu rutina</SectionLabel>
          <ul className="train-days">
            {view.days.map((day) => {
              // `pendiente` is the ordinary state of a fresh week, so three identical words
              // in a fixed right-hand column said nothing and cost the titles their line.
              // Only the states that carry a fact are written: `hoy` and `hecha`, now as the
              // system's chips, which tint their own hue inside `chips.css` — the accent
              // budget of a screen file stays the screen file's business. `statusOf` still
              // decides all three.
              const quiet = day.status.word === 'pendiente';
              const tone =
                day.status.tone === 'success'
                  ? 'success'
                  : day.status.tone === 'accent'
                    ? 'accent'
                    : 'neutral';
              return (
                <li key={day.planDayId} className="train-days__item">
                  <Card padding="none">
                    <button
                      type="button"
                      className="ds-action train-day"
                      onClick={() => onOpenRoutine(day.planDayId)}
                      aria-label={
                        quiet
                          ? `${day.title}. ${day.subtitle}.`
                          : `${day.title}. ${day.subtitle}. ${day.status.word}`
                      }
                    >
                      <span className="train-day__badge" aria-hidden="true">
                        <Icon name="dumbbell" size={20} />
                      </span>
                      <span className="train-day__text">
                        <span className="ds-card-title train-day__title">{day.title}</span>
                        <span className="ds-meta">{day.subtitle}</span>
                      </span>
                      {quiet ? null : (
                        <Chip className="train-day__status" tone={tone}>
                          {day.status.word}
                        </Chip>
                      )}
                      <span className="train-day__chevron" aria-hidden="true">
                        <Icon name="chevronRight" size={20} />
                      </span>
                    </button>
                  </Card>
                </li>
              );
            })}
          </ul>
          <TextButton onClick={() => onOpenRoutine(null)}>Ver y editar la rutina</TextButton>
        </section>
      )}

      {/* A rest day is not the headline of the screen: the routine days above are. One
          quiet sentence, after them, and no card to announce it. */}
      {view.today !== null && view.today.kind === 'rest' ? (
        <p className="ds-meta train__no-session">
          Hoy no hay ninguna sesión programada. Descansa, o adelanta un día desde tu rutina.
        </p>
      ) : null}

      {view.phase === null ? null : (
        <section className="train__section">
          <Card className="train-phase">
            <div className="ds-row">
              <span className="ds-body">{view.phase.label}</span>
              <Chip>{view.phase.chip}</Chip>
            </div>
            <hr className="ds-hairline" />
            <p className="ds-caption">{view.phase.note}</p>
          </Card>
        </section>
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
