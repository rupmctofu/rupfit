/**
 * The Sesión screen — the one that matters.
 *
 * A full-height sheet over the tab bar (design-system §8): the exit control and the day
 * on top, the phase banner, the paged exercise cards, the pager, and one bottom bar that
 * changes with what the owner has to decide next — the load decision, the rest, or the
 * end of the session. The end of the session is not a dead end: it offers the summary of
 * the session that was just written (`#/resumen/<id>`) and, second, the way back to
 * Inicio.
 *
 * Three rules hold the file together:
 *
 * 1. **Nothing here touches storage or the clock.** The controller does both; `now`
 *    arrives from the hook and every number below is formatted from it.
 * 2. **Write first, show after.** The set row is confirmed by the reducer only once the
 *    write resolved, so a failed write leaves the set exactly where the thumb left it
 *    and the banner offers `Reintentar` (`sesion-error`).
 * 3. **Two taps per set.** The rep count is a stepper, effort and discomfort are
 *    optional chips, and `Confirmar` is the second tap (FR-6.7).
 *
 * The only local state is what the reducer deliberately does not own: the reps being
 * counted, the optional answers of the set in progress, and the keypad's draft weight
 * (editable between sets, FR-5.7).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Discomfort, Effort } from '../../core/domain';
import {
  activeExercise,
  isRestFinished,
  isSessionAnswered,
  restDeadline,
  restElapsedMs,
  restRemainingMs,
  summarise,
  type ExerciseState,
} from '../../core/session/model';
import {
  Banner,
  Card,
  DataStrip,
  EmptyState,
  ErrorBanner,
  Icon,
  LoadDecisionBar,
  Pager,
  PhaseBanner,
  PrimaryAction,
  RestTimerBar,
  SectionLabel,
  TextButton,
  WeightKeypad,
} from '../../design-system';
import type { StoragePort } from '../../storage';
import { ExerciseCard, type SetDraft } from './ExerciseCard';
import {
  historyFor,
  previousPoint,
  type Clock,
  type SessionJournal,
  type SessionMachine,
} from './controller';
import {
  discomfortFromChip,
  effortFromChip,
  formatOverrun,
  formatRest,
  formatRestSpoken,
  formatVolume,
  formatWeekdayTime,
  formatWeight,
  parseWeight,
  type DiscomfortChip,
  type EffortChip,
} from './format';
import { useSessionController } from './useSession';
import { summaryHash } from '../summary/route';
import './session.css';

/** Readaptation is a four-block programme (docs/progression-engine.md §8). */
const READAPTATION_WEEKS = 4;
/** The fallback step when the library entry is not known: the smallest plate pair. */
const DEFAULT_INCREMENT_KG = 2.5;

export interface SessionScreenProps {
  readonly storage: StoragePort;
  readonly clock: Clock;
  readonly journal?: SessionJournal | undefined;
  /** `Salir de la sesión`: back to Inicio, with the session left resumable. */
  readonly onExit: () => void;
  /**
   * `Ver el resumen`, once the session is terminal: the summary of the session that was
   * just written. Optional because the demo host (`DemoSession`) does not pass it and
   * the sheet knows where its own summary lives.
   */
  readonly onOpenSummary?: ((sessionId: string) => void) | undefined;
  /** The demo strip, when the screen is being reviewed with fixtures. */
  readonly topSlot?: React.ReactNode;
  /** Called once, after the boot, with the machine: the demo primes a scenario here. */
  readonly onReady?: ((machine: SessionMachine, now: number) => void) | undefined;
}

function defaultDraft(exercise: ExerciseState): SetDraft {
  const reps =
    exercise.recommendation?.suggestedTargetReps ?? exercise.prescription.repRange.lowerBound;
  const weightKg =
    exercise.usedWeightKg ??
    exercise.recommendedWeightKg ??
    exercise.recommendation?.suggestedWeightKg ??
    0;
  return { weightKg, reps, effort: null, discomfort: null, showDiscomfort: false };
}

function nextSlotOf(exercise: ExerciseState): number | null {
  for (let slot = 1; slot <= exercise.prescription.sets; slot += 1) {
    if (!exercise.sets.some((entry) => entry.slot === slot)) return slot;
  }
  return null;
}

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export function SessionScreen(props: SessionScreenProps): React.ReactElement {
  const { storage, clock, journal, onExit, onOpenSummary, topSlot, onReady } = props;
  const controller = useSessionController({
    storage,
    clock,
    ...(journal === undefined ? {} : { journal }),
  });
  const { runtime, now, screenState } = controller;
  const session = runtime.session;

  const [drafts, setDrafts] = useState<Record<string, SetDraft>>({});
  const [keypad, setKeypad] = useState<{ readonly exerciseSessionId: string; readonly value: string } | null>(
    null,
  );
  const trackRef = useRef<HTMLDivElement | null>(null);
  const guardRef = useRef(0);
  const settleRef = useRef<number | null>(null);

  const draftFor = useCallback(
    (exercise: ExerciseState): SetDraft => drafts[exercise.id] ?? defaultDraft(exercise),
    [drafts],
  );

  const patchDraft = useCallback((exercise: ExerciseState, patch: Partial<SetDraft>) => {
    setDrafts((current) => ({
      ...current,
      [exercise.id]: { ...(current[exercise.id] ?? defaultDraft(exercise)), ...patch },
    }));
  }, []);

  const active = session === null ? null : activeExercise(session);
  const total = session?.exercises.length ?? 0;

  const goTo = useCallback(
    (index: number) => {
      const current = runtime.session?.activeIndex ?? 0;
      if (index === current || index < 0 || index >= (runtime.session?.exercises.length ?? 0)) return;
      const event = index > current ? 'exercise-advanced' : 'exercise-returned';
      for (let step = 0; step < Math.abs(index - current); step += 1) {
        controller.dispatch({ type: event });
      }
    },
    [controller, runtime.session],
  );

  // The reducer owns the card on screen; the scroll container follows it.
  useEffect(() => {
    const track = trackRef.current;
    if (track === null || session === null) return;
    const left = session.activeIndex * track.clientWidth;
    if (Math.abs(track.scrollLeft - left) < 4) return;
    guardRef.current = Date.now() + 400;
    track.scrollTo({ left, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  }, [session?.activeIndex, session]);

  const onScroll = useCallback(() => {
    if (Date.now() < guardRef.current) return;
    if (settleRef.current !== null) window.clearTimeout(settleRef.current);
    settleRef.current = window.setTimeout(() => {
      const track = trackRef.current;
      if (track === null || track.clientWidth === 0) return;
      goTo(Math.round(track.scrollLeft / track.clientWidth));
    }, 120);
  }, [goTo]);

  useEffect(
    () => () => {
      if (settleRef.current !== null) window.clearTimeout(settleRef.current);
    },
    [],
  );

  const dismissRecovery = controller.dismissRecovery;
  const dispatch = controller.dispatch;

  const readyRef = useRef(false);
  useEffect(() => {
    if (readyRef.current || onReady === undefined) return;
    if (runtime.phase !== 'ready') return;
    readyRef.current = true;
    onReady(controller.machine, clock.now());
  }, [clock, controller.machine, onReady, runtime.phase]);

  const confirmSet = useCallback(
    (exercise: ExerciseState) => {
      const slot = nextSlotOf(exercise);
      if (slot === null) return;
      const draft = draftFor(exercise);
      dispatch({
        type: 'set-confirmed',
        exerciseSessionId: exercise.id,
        slot,
        weightKg: draft.weightKg,
        actualReps: draft.reps,
        effort: effortFromChip(draft.effort) as Effort | null,
        discomfort: discomfortFromChip(draft.discomfort) as Discomfort | null,
      });
    },
    [dispatch, draftFor],
  );

  const skipRemaining = useCallback(
    (exercise: ExerciseState) => {
      for (let slot = 1; slot <= exercise.prescription.sets; slot += 1) {
        if (exercise.sets.some((entry) => entry.slot === slot)) continue;
        dispatch({ type: 'set-skipped', exerciseSessionId: exercise.id, slot });
      }
    },
    [dispatch],
  );

  const openKeypad = useCallback((exercise: ExerciseState) => {
    setKeypad({ exerciseSessionId: exercise.id, value: formatWeight(draftFor(exercise).weightKg) });
  }, [draftFor]);

  const submitKeypad = useCallback(() => {
    if (keypad === null || session === null) return;
    const kg = parseWeight(keypad.value);
    setKeypad(null);
    if (kg === null) return;
    const exercise = session.exercises.find((candidate) => candidate.id === keypad.exerciseSessionId);
    if (exercise === undefined) return;
    if (exercise.decision === null) {
      dispatch({ type: 'weight-overridden', exerciseSessionId: exercise.id, kg });
      patchDraft(exercise, { weightKg: kg });
      return;
    }
    // FR-5.7: the decision is written once (I-8); between sets the weight is a draft
    // that travels with the next confirmed set.
    patchDraft(exercise, { weightKg: kg });
  }, [dispatch, keypad, patchDraft, session]);

  const stepWeight = useCallback(
    (exercise: ExerciseState, direction: number) => {
      const increment = runtime.exercises[exercise.id]?.loadIncrementKg ?? DEFAULT_INCREMENT_KG;
      const current = draftFor(exercise).weightKg;
      const next = Math.max(0, Math.round((current + direction * increment) * 100) / 100);
      patchDraft(exercise, { weightKg: next });
    },
    [draftFor, patchDraft, runtime.exercises],
  );

  // `Ver el resumen`, once the session is terminal. The id is the one the reducer just
  // wrote — `finish` settles the status only after the write resolved — so nothing is
  // read here and no effect is invented. The host decides the address when it has one.
  const openSummary = useCallback(
    (sessionId: string) => {
      if (onOpenSummary !== undefined) {
        onOpenSummary(sessionId);
        return;
      }
      // The demo runs on an in-memory port, so its fixture session never reaches
      // IndexedDB: the only summary that can read it back is the fixture one.
      const demo = window.location.hash.startsWith('#/sesion/demo');
      window.location.hash = summaryHash(demo ? 'demo' : sessionId);
    },
    [onOpenSummary],
  );

  const topBar = (
    <header className="session__top">
      <button type="button" className="ds-action session__exit" onClick={onExit} aria-label="Salir de la sesión">
        <Icon name="chevronDown" size={22} />
      </button>
      <span className="session__when">{formatWeekdayTime(now)}</span>
      <span className="session__top-spacer" aria-hidden="true" />
    </header>
  );

  if (session === null) {
    return (
      <div className="session" data-state={screenState}>
        {topSlot}
        {topBar}
        {screenState === 'failed' && runtime.error !== null ? (
          <div className="session__body">
            <ErrorBanner message={runtime.error} onRetry={controller.retry} />
          </div>
        ) : screenState === 'empty' ? (
          <div className="session__body">
            <EmptyState action={{ label: 'Volver a Inicio', onClick: onExit }}>
              Hoy no hay ninguna sesión programada.
            </EmptyState>
          </div>
        ) : (
          <div className="session__body">
            <p className="ds-meta">Abriendo la sesión…</p>
          </div>
        )}
      </div>
    );
  }

  const summary = summarise(session);
  const restDeadlineAt = restDeadline(session);
  const restFinished = isRestFinished(session, now);
  const restRunning = restDeadlineAt !== null;
  const restDurationMs = session.rest.durationSeconds === null
    ? 0
    : (session.rest.durationSeconds + session.rest.extensionSeconds) * 1000;
  const restProgress = restFinished ? 1 : restDurationMs === 0 ? 0 : restElapsedMs(session, now) / restDurationMs;

  const terminal = screenState === 'finished' || screenState === 'partial';
  const exerciseOnScreen = active;
  const previous = exerciseOnScreen === null
    ? null
    : previousPoint(historyFor(runtime, exerciseOnScreen.exerciseId, exerciseOnScreen.exerciseNameSnapshot));
  const suggestion = exerciseOnScreen?.recommendation?.suggestedWeightKg ?? null;
  const todayWeightKg =
    exerciseOnScreen === null
      ? null
      : exerciseOnScreen.usedWeightKg ?? exerciseOnScreen.recommendedWeightKg ?? suggestion;
  const decided = exerciseOnScreen !== null && exerciseOnScreen.decision !== null;
  const slot = exerciseOnScreen === null ? null : nextSlotOf(exerciseOnScreen);
  const lastSlot = exerciseOnScreen?.prescription.sets ?? 0;

  const recoveryNotice = ((): React.ReactElement | null => {
    if (screenState !== 'resumed' && screenState !== 'recovered') return null;
    const position = slot ?? lastSlot;
    const line =
      screenState === 'resumed'
        ? 'Sigue donde lo dejaste. Se recuperó también la serie en curso.'
        : 'Sigue donde lo dejaste. No se perdió ninguna serie.';
    return (
      <Banner
        title={`Sesión reanudada · serie ${position} de ${lastSlot}`}
        text={line}
        tone="info"
      />
    );
  })();

  const outcomeNotice = ((): React.ReactElement | null => {
    if (screenState === 'finished') {
      return (
        <Banner
          title="Sesión completada"
          text="Todo quedó registrado."
          tone="success"
        />
      );
    }
    if (screenState === 'partial') {
      return (
        <Banner
          title="Sesión guardada como parcial"
          text="Quedaron series sin registrar. Lo que hiciste está guardado."
          tone="warning"
        />
      );
    }
    return null;
  })();

  const bottomBar = ((): React.ReactElement => {
    if (terminal) {
      return (
        <div className="session__actions session__actions--split">
          <TextButton onClick={onExit}>Volver a Inicio</TextButton>
          <PrimaryAction onClick={() => openSummary(session.id)}>Ver el resumen</PrimaryAction>
        </div>
      );
    }

    if (screenState === 'resumed' || screenState === 'recovered') {
      return (
        <div className="session__actions session__actions--split">
          <button
            type="button"
            className="ds-action session__ghost"
            onClick={() => dispatch({ type: 'session-finished', outcome: 'partial' })}
          >
            Descartar y guardar parcial
          </button>
          <PrimaryAction onClick={dismissRecovery}>Seguir</PrimaryAction>
        </div>
      );
    }

    if (restRunning) {
      return (
        <RestTimerBar
          state={restFinished ? 'finished' : 'running'}
          remainingLabel={formatRest(restRemainingMs(session, now))}
          progress={restProgress}
          accessibleLabel={
            restFinished
              ? `Descanso terminado, ${formatOverrun(Math.max(0, now - (restDeadlineAt ?? now)))}`
              : formatRestSpoken(restRemainingMs(session, now))
          }
          {...(restFinished
            ? { overrunLabel: formatOverrun(Math.max(0, now - (restDeadlineAt ?? now))) }
            : {})}
          onExtend={() => dispatch({ type: 'rest-extended', seconds: 15 })}
          onSkip={() => dispatch({ type: 'rest-skipped' })}
          {...(restFinished ? { onDismiss: () => dispatch({ type: 'rest-skipped' }) } : {})}
        />
      );
    }

    if (exerciseOnScreen !== null && !decided) {
      if (suggestion === null) {
        return (
          <div className="session__actions">
            <PrimaryAction onClick={() => openKeypad(exerciseOnScreen)}>Elegir peso</PrimaryAction>
          </div>
        );
      }
      return (
        <LoadDecisionBar
          suggested={formatWeight(suggestion)}
          {...(previous === null ? {} : { previous: formatWeight(previous.weightKg) })}
          onAccept={() =>
            dispatch({ type: 'weight-accepted', exerciseSessionId: exerciseOnScreen.id })
          }
          {...(previous === null
            ? {}
            : {
                onRepeat: () =>
                  dispatch({
                    type: 'weight-held',
                    exerciseSessionId: exerciseOnScreen.id,
                    previousWeightKg: previous.weightKg,
                  }),
              })}
          onOther={() => openKeypad(exerciseOnScreen)}
        />
      );
    }

    const isLast = (session.activeIndex ?? 0) + 1 >= total;
    return (
      <div className="session__actions session__actions--split">
        <TextButton
          onClick={() =>
            dispatch({
              type: 'session-finished',
              outcome: isSessionAnswered(session) ? 'completed' : 'partial',
            })
          }
        >
          Terminar la sesión
        </TextButton>
        {/* Navigating to the next exercise is not the primary action while a set is still
            pending: `Confirmar` owns the accent, and two lime fills in one viewport is
            exactly the budget the design contract forbids. */}
        {isLast ? null : (
          <TextButton onClick={() => goTo((session.activeIndex ?? 0) + 1)}>Siguiente</TextButton>
        )}
      </div>
    );
  })();

  return (
    <div className="session" data-state={screenState}>
      {topSlot}
      {topBar}

      {/* The resume and outcome notices take the phase banner's slot, as the renders
          draw them: one quiet banner above the card, never two stacked. */}
      {session.phase.kind === 'readaptation' && recoveryNotice === null && outcomeNotice === null ? (
        <div className="session__notice">
          <PhaseBanner week={session.phase.week} totalWeeks={READAPTATION_WEEKS} />
        </div>
      ) : null}

      {runtime.error !== null ? (
        <div className="session__notice">
          <ErrorBanner message={runtime.error} onRetry={controller.retry} />
        </div>
      ) : null}

      {runtime.rejection !== null ? (
        <div className="session__notice">
          <Banner title={runtime.rejection} tone="warning" />
        </div>
      ) : null}

      {recoveryNotice === null ? null : <div className="session__notice">{recoveryNotice}</div>}
      {outcomeNotice === null ? null : <div className="session__notice">{outcomeNotice}</div>}

      {terminal ? (
        <div className="session__body">
          <Card>
            <SectionLabel>Resumen</SectionLabel>
            <DataStrip
              label="Totales de la sesión"
              items={[
                { label: 'Series', value: `${summary.setsConfirmed} / ${summary.setsPrescribed}` },
                { label: 'Volumen', value: formatVolume(summary.volumeKg), unit: 'kg' },
                { label: 'Duración', value: formatRest(summary.durationMs ?? 0) },
              ]}
            />
          </Card>
        </div>
      ) : null}

      <div className="session__track" ref={trackRef} onScroll={onScroll}>
        {session.exercises.map((exercise, index) => (
          <div className="session__slide" key={exercise.id}>
            <ExerciseCard
              exercise={exercise}
              detail={runtime.exercises[exercise.id]}
              history={historyFor(runtime, exercise.exerciseId, exercise.exerciseNameSnapshot)}
              todayWeightKg={
                exercise.usedWeightKg ??
                exercise.recommendedWeightKg ??
                exercise.recommendation?.suggestedWeightKg ??
                null
              }
              draft={draftFor(exercise)}
              interactive={!terminal && index === session.activeIndex}
              onRepsChange={(reps) => patchDraft(exercise, { reps })}
              onEffortChange={(effort: EffortChip | null) => patchDraft(exercise, { effort })}
              onDiscomfortChange={(discomfort: DiscomfortChip | null) =>
                patchDraft(exercise, { discomfort })
              }
              onShowDiscomfort={() => patchDraft(exercise, { showDiscomfort: true })}
              onConfirm={() => confirmSet(exercise)}
              onEditWeight={() => openKeypad(exercise)}
              onWeightStep={(direction) => stepWeight(exercise, direction)}
              onSkipRemaining={() => skipRemaining(exercise)}
            />
          </div>
        ))}
      </div>

      {terminal ? null : (
        <Pager
          position={(session.activeIndex ?? 0) + 1}
          total={total}
          onPrevious={() => goTo((session.activeIndex ?? 0) - 1)}
          onNext={() => goTo((session.activeIndex ?? 0) + 1)}
        />
      )}

      {keypad === null ? null : (
        <div className="session__keypad">
          <Card>
            <WeightKeypad
              value={keypad.value}
              onChange={(value) => setKeypad({ exerciseSessionId: keypad.exerciseSessionId, value })}
              onSubmit={submitKeypad}
              label="Peso en kilogramos"
              hint="Ajusta con la coma decimal"
            />
            <TextButton onClick={() => setKeypad(null)}>Cancelar</TextButton>
          </Card>
        </div>
      )}

      <div className="session__bar">{bottomBar}</div>
    </div>
  );
}
