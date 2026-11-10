/**
 * The Sesión screen — the one that matters.
 *
 * A full-height sheet over the tab bar (design-system §8): the exit control and the day
 * on top, the phase banner, the paged exercise cards, the pager, and one bottom bar that
 * changes with what the owner has to decide next — the load decision, the next set, or
 * the end of the session. The end of the session is not a dead end: it offers the summary
 * of the session that was just written (`#/resumen/<id>`) and, second, the way back to
 * Inicio.
 *
 * There is no rest timer here (S5): a confirmed set never blocks the session, never opens
 * a countdown and never asks to be dismissed — the next set is registrable immediately.
 * The prescribed rest of the exercise stays visible as the card's text line
 * (`descanso 180 s`, `targetLine`), because it is information, not a gate.
 *
 * Three rules hold the file together:
 *
 * 1. **Nothing here touches storage or the clock.** The controller does both; `now`
 *    arrives from the hook and every number below is formatted from it.
 * 2. **Write first, show after.** The set row is confirmed by the reducer only once the
 *    write resolved, so a failed write leaves the set exactly where the thumb left it
 *    and the banner offers `Reintentar` (`sesion-error`).
 * 3. **Two taps per set.** The rep count is a stepper, effort and discomfort are
 *    optional chips, and the pinned `Registrar serie` of the open row is the second
 *    tap (FR-6.7).
 *
 * The only local state is what the reducer deliberately does not own: the reps being
 * counted, the optional answers of the set in progress, and the keypad's draft weight
 * (editable between sets, FR-5.7).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Discomfort, Effort, Equipment, Exercise } from '../../core/domain';
import {
  activeExercise,
  isSessionAnswered,
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
  SectionLabel,
  TextButton,
  WeightKeypad,
  type IconName,
} from '../../design-system';
import type { StoragePort } from '../../storage';
import { ExerciseCard, type SetDraft } from './ExerciseCard';
import { ExerciseIllustration } from './ExerciseIllustration';
import { swipeDirection, type SwipePoint } from './swipe';
import { illustrationKeyOf } from './illustrationKey';
import { ringSegments } from './ring';
import { SessionRing } from './SessionRing';
import {
  canSubstitute,
  candidateById,
  substitutionCandidates,
  substitutionHint,
} from './substitution';
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
  formatRest,
  formatVolume,
  formatWeekdayTime,
  formatWeight,
  parseWeight,
  prescriptionLine,
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

/** The equipment of the library row, in the words the picker and the card use. */
const EQUIPMENT_LABEL: Record<Equipment, string> = {
  barbell: 'Barra',
  dumbbell: 'Mancuerna',
  machine: 'Máquina',
  cable: 'Polea',
  bodyweight: 'Peso corporal',
  band: 'Banda',
};

const EQUIPMENT_ICON: Record<Equipment, IconName> = {
  barbell: 'barbell',
  dumbbell: 'dumbbell',
  machine: 'machine',
  cable: 'cable',
  bodyweight: 'person',
  band: 'band',
};

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
  const substitute = controller.substitute;
  const session = runtime.session;

  const [drafts, setDrafts] = useState<Record<string, SetDraft>>({});
  const [keypad, setKeypad] = useState<{ readonly exerciseSessionId: string; readonly value: string } | null>(
    null,
  );
  /**
   * `Sugerir otro ejercicio` (S4): the exercise session being swapped and the library the
   * alternatives are read from. The library is read on demand — the session only knows the
   * rows it prescribes — and a failed read leaves an empty list with its own sentence
   * instead of a picker that promises nothing.
   */
  const [swapping, setSwapping] = useState<{ readonly exerciseSessionId: string } | null>(null);
  const [library, setLibrary] = useState<readonly Exercise[]>([]);
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

  const openSwapping = useCallback(
    (exercise: ExerciseState) => {
      setSwapping({ exerciseSessionId: exercise.id });
    },
    [],
  );

  // The library is read once per mount: `Sugerir otro ejercicio` resolves the row's
  // `alternatives` against it, and the session itself only carries the rows it prescribes.
  // A failed read leaves an empty list, and the action simply does not appear.
  useEffect(() => {
    let live = true;
    void storage.exercises
      .all()
      .then((rows) => {
        if (live) setLibrary(rows);
      })
      .catch(() => {
        if (live) setLibrary([]);
      });
    return () => {
      live = false;
    };
  }, [storage]);

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

  // The hero is also the gesture: a horizontal drag moves one exercise, exactly the move
  // the pager chevrons make, and `goTo` already refuses to leave the session's bounds.
  // Only the decision lives in `swipe.ts`; the drag itself is here, where `goTo` is.
  const swipeOriginRef = useRef<SwipePoint | null>(null);
  const onHeroPointerDown = useCallback((event: React.PointerEvent<HTMLElement>) => {
    swipeOriginRef.current = { x: event.clientX, y: event.clientY };
  }, []);
  const onHeroPointerUp = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      const origin = swipeOriginRef.current;
      swipeOriginRef.current = null;
      if (origin === null) return;
      const direction = swipeDirection(origin, { x: event.clientX, y: event.clientY });
      if (direction === null) return;
      goTo((runtime.session?.activeIndex ?? 0) + (direction === 'next' ? 1 : -1));
    },
    [goTo, runtime.session],
  );
  const onHeroPointerCancel = useCallback(() => {
    swipeOriginRef.current = null;
  }, []);

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
      // A confirmed set ends the possibility of a swap (S6): the picker never stays open on
      // an exercise the write would refuse.
      setSwapping(null);
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

  // ---------------------------------------------------------------- the visual core
  const segments = ringSegments(session);
  const heroDetail = exerciseOnScreen === null ? undefined : runtime.exercises[exerciseOnScreen.id];
  const heroIllustration = illustrationKeyOf(heroDetail);
  const swappingExercise =
    swapping === null
      ? null
      : session.exercises.find((exercise) => exercise.id === swapping.exerciseSessionId) ?? null;
  const swappingDetail =
    swappingExercise === null ? undefined : runtime.exercises[swappingExercise.id];
  const candidates =
    swappingDetail === undefined
      ? []
      : substitutionCandidates(swappingDetail, library, runtime.availableEquipment);
  const equipmentScoped = runtime.availableEquipment.length > 0;

  const chooseAlternative = (id: string): void => {
    const picked = candidateById(candidates, id);
    if (picked === null || swapping === null) return;
    setSwapping(null);
    substitute(swapping.exerciseSessionId, picked);
  };

  // `Terminar la sesión` is the sheet's quiet exit in every state that is not the
  // pinned confirm: the outcome is derived from what was answered, never from a second tap.
  const finishSession = (): void => {
    dispatch({
      type: 'session-finished',
      outcome: isSessionAnswered(session) ? 'completed' : 'partial',
    });
  };

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

    // The open set is what the owner is doing right now: its one strong action sits in
    // the pinned bar, where the thumb already is, instead of at the end of a row that
    // has to hold `Serie n`, the rep stepper, the weight and the button at 390 px. The
    // row keeps the weight and the reps; the bar registers them — before and after a
    // confirmed set alike, so nothing has to be dismissed before the next one.
    if (exerciseOnScreen !== null && slot !== null) {
      const draft = draftFor(exerciseOnScreen);
      return (
        <div className="session__actions session__actions--stack">
          <PrimaryAction onClick={() => confirmSet(exerciseOnScreen)}>
            Registrar serie
            <span className="ds-visually-hidden">
              {` ${String(slot)} de ${String(lastSlot)}, ${String(draft.reps)} repeticiones`}
            </span>
          </PrimaryAction>
          <TextButton onClick={finishSession} className="session__finish">
            Terminar la sesión
          </TextButton>
        </div>
      );
    }

    const isLast = (session.activeIndex ?? 0) + 1 >= total;
    return (
      <div className="session__actions session__actions--split">
        <TextButton onClick={finishSession}>Terminar la sesión</TextButton>
        {/* Navigating to the next exercise is not the primary action: the pinned
            `Registrar serie` owns the accent, and two accent fills in one viewport is
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
        <div className="session__body">          <Card>
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

      {/* S2: the visual core of the session. Outside the paged track on purpose — the
          ring, the current variant, its name and its prescribed work are read at a
          glance, one hand, 390 px, with no scrolling at all. The paged cards below keep
          the sets, the compare tiles and the history. */}
      {terminal || exerciseOnScreen === null ? null : (
        <section
          className="session-hero"
          aria-label="Ejercicio actual"
          onPointerDown={onHeroPointerDown}
          onPointerUp={onHeroPointerUp}
          onPointerCancel={onHeroPointerCancel}
        >
          <SessionRing segments={segments}>
            {/* S3: the drawing of this variant, or the implement. A row the library no
                longer has shows nothing rather than somebody else's exercise. */}
            {heroIllustration !== null ? (
              <ExerciseIllustration
                illustration={heroIllustration}
                label={exerciseOnScreen.exerciseNameSnapshot}
                className="session-hero__art"
              />
            ) : heroDetail === undefined ? null : (
              <span className="session-hero__icon">
                <Icon name={EQUIPMENT_ICON[heroDetail.equipment]} size={40} />
              </span>
            )}
          </SessionRing>
          <div className="session-hero__text">
            <h2 className="session-hero__name">{exerciseOnScreen.exerciseNameSnapshot}</h2>
            <p className="session-hero__prescription">
              {prescriptionLine(exerciseOnScreen.prescription)}
            </p>
            <p className="ds-caption session-hero__weight">
              {todayWeightKg === null
                ? 'Peso de hoy por decidir'
                : `Hoy ${formatWeight(todayWeightKg)} kg`}
            </p>
          </div>
        </section>
      )}

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
              // The hero above already names the exercise, its prescription and the weight
              // of the day; the card starts at the chips when it is on screen.
              heroShown
              onRepsChange={(reps) => patchDraft(exercise, { reps })}
              onEffortChange={(effort: EffortChip | null) => patchDraft(exercise, { effort })}
              onDiscomfortChange={(discomfort: DiscomfortChip | null) =>
                patchDraft(exercise, { discomfort })
              }
              onShowDiscomfort={() => patchDraft(exercise, { showDiscomfort: true })}
              onEditWeight={() => openKeypad(exercise)}
              onWeightStep={(direction) => stepWeight(exercise, direction)}
              onSkipRemaining={() => skipRemaining(exercise)}
              substitutedFromName={runtime.substitutions[exercise.id]?.exerciseNameSnapshot}
              {...(!terminal &&
              index === session.activeIndex &&
              canSubstitute(exercise, true) &&
              substitutionCandidates(
                runtime.exercises[exercise.id],
                library,
                runtime.availableEquipment,
              ).length > 0
                ? { onSuggestAlternative: () => openSwapping(exercise) }
                : {})}
            />
          </div>
        ))}
      </div>

      {terminal ? null : (
        <Pager
          position={(session.activeIndex ?? 0) + 1}
          total={total}
          count={false}
          onPrevious={() => goTo((session.activeIndex ?? 0) - 1)}
          onNext={() => goTo((session.activeIndex ?? 0) + 1)}
        />
      )}

      {swapping === null || terminal ? null : (
        <div className="session__substitute">
          <Card>
            <SectionLabel>Sugerir otro ejercicio</SectionLabel>
            <p className="ds-caption">
              {substitutionHint(candidates.length, equipmentScoped)}
            </p>
            {candidates.map((candidate) => (
              <button
                key={candidate.id}
                type="button"
                className="ds-action session-substitute__option"
                onClick={() => chooseAlternative(candidate.id)}
              >
                <span className="session-substitute__name">{candidate.name}</span>
                <span className="ds-caption">{EQUIPMENT_LABEL[candidate.equipment]}</span>
              </button>
            ))}
            <TextButton onClick={() => setSwapping(null)}>Cancelar</TextButton>
          </Card>
        </div>
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
