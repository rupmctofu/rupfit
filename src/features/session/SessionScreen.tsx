/**
 * The Sesión screen — the one that matters.
 *
 * A full-height sheet over the tab bar (design-system §8): one compact header — the workout's
 * name, its progress and the exit control — the phase banner, the exercise on screen (its
 * artwork, its name and its material), the paged exercise cards, the pager, and one bottom bar
 * that changes with what the owner has to decide next — the load decision, the next set, or
 * the end of the session. The end of the session is not a dead end: it offers the summary
 * of the session that was just written (`#/resumen/<id>`) and, second, the way back to
 * Inicio.
 *
 * The numbers are the screen (T6): the planned sets and the target reps at the rep numeral
 * (44 px) inside the card, the load at the load numeral (60 px) right under them, and the set
 * rows one hairline below. Everything is tabular, so a count that changes never moves the
 * thing beside it.
 *
 * There is no rest timer here (S5): a confirmed set never blocks the session, never opens
 * a countdown and never asks to be dismissed — the next set is registrable immediately.
 * The prescribed rest of the exercise stays visible as the card's text line
 * (`descanso 180 s`, `targetLine`), because it is information, not a gate.
 *
 * **Getting out** (odd/tasks/finish-session.md S2–S6) is the one control at the top of the
 * screen, and it says both things it can do: `Salir y seguir luego` leaves the session open
 * and resumable, `Terminar la sesión` closes it with what is written. The sheet it opens is
 * reachable in every state — undecided, not a single set, mid-exercise, after the walk —
 * because it does not depend on the bottom bar being free. The bottom bar keeps its single
 * job (the load decision, or `Registrar serie`, or `Siguiente`) and holds no third way out.
 * Closing asks once only when there is something to lose, and the status it reaches is the
 * transition table's answer (`finishEvent`), never a rule invented here.
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
 *    tap (FR-6.7). The detailed path stays for whoever wants it; the fast path below is
 *    one answer for the whole exercise (S4, S8, T6).
 *
 * The only local state is what the reducer deliberately does not own: the reps being
 * counted, the optional answers of the set in progress, and the keypad's draft weight
 * (editable between sets, FR-5.7).
 *
 * **Correcting a set** (odd/tasks/edit-set.md S1–S6) is the same screen one level deeper:
 * a 500 ms press on a confirmed row opens that row in place (`SetEditor`), the answers ride
 * on the same `SetDraft` the active row uses, the kilos borrow the one pinned keypad, and
 * the pinned bar swaps `Registrar serie` for `Guardar` / `Cancelar`. `Guardar` writes once
 * through the machine the sheet already writes through — one `persist-set` event for one
 * set — and `Cancelar` writes nothing at all. No new control per row appears anywhere: the
 * only visible change on an untouched screen is one quiet line under the sets (S4).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Discomfort, Effort, Exercise } from '../../core/domain';
import {
  activeExercise,
  isSessionAnswered,
  summarise,
  type ExerciseState,
  type SessionEvent,
  type SessionState,
} from '../../core/session/model';
import {
  Banner,
  Card,
  Chip,
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
} from '../../design-system';
import { deleteSessionConfirmation, type StoragePort } from '../../storage';
import {
  EQUIPMENT_ICON,
  EQUIPMENT_LABEL,
  MUSCLE_LABEL,
  ExerciseCard,
  type SetDraft,
} from './ExerciseCard';
import { ExerciseIllustration } from './ExerciseIllustration';
import { illustrationKeyOf } from './illustrationKey';
import {
  CORRECTION_HINT,
  correctSet,
  isCorrectable,
  showsCorrectionHint,
  type SetCorrection,
} from './editSet';
import { swipeDirection, type SwipePoint } from './swipe';
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
  formatDiscomfort,
  formatEffort,
  formatRest,
  formatVolume,
  formatWeekdayTime,
  formatWeight,
  parseWeight,
  type DiscomfortChip,
  type EffortChip,
} from './format';
import {
  availableVerdicts,
  verdictRefusal,
  verdictSets,
  VERDICT_LABEL,
  type ExerciseVerdict,
} from './verdict';
import { useSessionController } from './useSession';
import { summaryHash } from '../summary/route';
import './session.css';

/** Readaptation is a four-block programme (docs/progression-engine.md §8). */
const READAPTATION_WEEKS = 4;
/** The fallback step when the library entry is not known: the smallest plate pair. */
const DEFAULT_INCREMENT_KG = 2.5;

/**
 * The equipment words and icons, and the muscle labels, live with the card that draws them
 * (`ExerciseCard.tsx`): the hero, the set rows and the substitution picker all name the same
 * library row, and one copy of the table is the only way they cannot drift apart.
 */
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

/** The weight of the day for the verdict: the one the hero and the card already show. */
function verdictWeightKg(exercise: ExerciseState): number | null {
  return (
    exercise.usedWeightKg ??
    exercise.recommendedWeightKg ??
    exercise.recommendation?.suggestedWeightKg ??
    null
  );
}

/**
 * One tap of the fast path (S4, S8): the verdict's sets, written in order through the
 * ordinary `set-confirmed` event — the same one `Registrar serie` sends, so the reducer,
 * the port and the effects are unchanged. The caller supplies the dispatch, which keeps
 * this a seam rather than a second write path.
 *
 * A slot that already has an answer is left alone: a verdict closes what is left of the
 * exercise and never rewrites a set the owner confirmed by hand (S8).
 */
export async function writeVerdict(
  dispatch: (event: SessionEvent) => Promise<unknown>,
  exercise: ExerciseState,
  verdict: ExerciseVerdict,
): Promise<void> {
  const result = verdictSets(exercise.prescription, verdictWeightKg(exercise), verdict);
  if (!result.ok) return;

  for (const set of result.sets) {
    if (exercise.sets.some((entry) => entry.slot === set.slot)) continue;
    await dispatch({
      type: 'set-confirmed',
      exerciseSessionId: exercise.id,
      slot: set.slot,
      weightKg: set.weightKg,
      actualReps: set.actualReps,
      effort: set.effort,
      discomfort: null,
    });
  }
}

/** `Guardar`, in one function: the rule first, then exactly one write. */
export interface CorrectionWriteResult {
  readonly written: boolean;
  /** Spanish, when the rule refused: nothing was dispatched at all. */
  readonly refusal: string | null;
}

/**
 * S6: `Guardar` is one write of the session. The correction is validated by the pure rule
 * (T1) — the same one the editor is opened with — and then sent as the single
 * `set-corrected` event the reducer understands, which the machine turns into the one
 * `persist-set` write the store receives. `Cancelar` never reaches this function.
 */
export async function writeCorrection(
  dispatch: (event: SessionEvent) => Promise<unknown>,
  session: SessionState,
  exerciseSessionId: string,
  slot: number,
  correction: SetCorrection,
): Promise<CorrectionWriteResult> {
  const outcome = correctSet(session, exerciseSessionId, slot, correction);
  if (!outcome.ok) return { written: false, refusal: outcome.message };

  await dispatch({
    type: 'set-corrected',
    exerciseSessionId,
    slot,
    weightKg: correction.weightKg,
    actualReps: correction.actualReps,
    effort: correction.effort,
    discomfort: correction.discomfort,
  });

  return { written: true, refusal: null };
}

/**
 * S4: one quiet line, and it is not a control. It lives under the set list of the card on
 * screen while something is done and nothing is being edited.
 */
export function CorrectionHint(): React.ReactElement {
  return <p className="ds-caption session__correction-hint">{CORRECTION_HINT}</p>;
}

export interface VerdictRowProps {
  readonly exercise: ExerciseState;
  readonly onVerdict: (verdict: ExerciseVerdict) => void;
}

/**
 * The fast path, placed where the owner finishes the exercise: one row of answers under
 * the set rows (S4, S8). `Fui sobrado` is absent on a slot prescribed by time, and with no
 * load on the card yet the row becomes the line that asks for the weight first (S3):
 * nothing is written, and no kilos are invented.
 */
export function VerdictRow(props: VerdictRowProps): React.ReactElement {
  const { exercise, onVerdict } = props;
  const refusal = verdictRefusal(exercise.prescription, verdictWeightKg(exercise));

  if (refusal !== null) {
    return (
      <p className="ds-caption session-verdict__note" role="status">
        {refusal}
      </p>
    );
  }

  return (
    <div className="session-verdict" role="group" aria-label="Respuesta del ejercicio">
      <div className="session-verdict__answers">
        {availableVerdicts(exercise.prescription).map((verdict) => (
          <button
            key={verdict}
            type="button"
            className="ds-action session-verdict__answer"
            onClick={() => onVerdict(verdict)}
          >
            {VERDICT_LABEL[verdict]}
          </button>
        ))}
      </div>
    </div>
  );
}

/** The confirmed set the screen has open in its editor, and the answers it is holding. */
interface EditingSetState {
  readonly exerciseSessionId: string;
  readonly slot: number;
  readonly draft: SetDraft;
}

/** The draft of the editor, in the words the store takes: the chips are the UI's. */
function correctionOf(draft: SetDraft): SetCorrection {
  return {
    weightKg: draft.weightKg,
    actualReps: draft.reps,
    effort: effortFromChip(draft.effort) as Effort | null,
    discomfort: discomfortFromChip(draft.discomfort) as Discomfort | null,
  };
}

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/* -------------------------------------------------------------- the way out (T1) */

/**
 * S3: the exit is one control that says both things it can do, in the words the app
 * already uses — `Salir de la sesión`, the name the top control had, and `Terminar la
 * sesión`, the label the bottom bar used to hold.
 */
export const EXIT_LEAVE_LABEL = 'Salir y seguir luego';
export const EXIT_FINISH_LABEL = 'Terminar la sesión';
/**
 * S3: the third way out, and the only one that removes something. It is offered only for a
 * session that exists because it was opened by accident — still open, not a single set
 * confirmed — because that is the only session with nothing a close could save.
 */
export const EXIT_DISCARD_LABEL = 'Descartar sesión';
/** The control's own name: one control, and it announces both outcomes before it opens. */
export const EXIT_CONTROL_LABEL = 'Salir de la sesión o terminarla';

/**
 * The sentence a failed discard leaves in the sheet: the store still has the session, so
 * the sheet stays open on it and says so instead of walking away from a write that lost.
 */
export const DISCARD_FAILED_MESSAGE =
  'No se pudo descartar la sesión: sigue ahí y puedes volver a intentarlo.';

/**
 * What the sheet says when a discard is asked of a session that no longer qualifies — a
 * guard, not a state: the row is not drawn for a session with a confirmed set or a settled
 * one, so this sentence only answers a tap that raced the store.
 */
export const DISCARD_REFUSED_MESSAGE =
  'Solo se puede descartar una sesión abierta y sin ninguna serie confirmada.';

/** Where the sheet is: the three named actions, or the one question before a close/discard. */
export type SheetStep = 'actions' | 'confirm' | 'discard';
/** S5: what `Terminar la sesión` does the moment it is chosen. */
export type FinishStep = 'confirm' | 'close';

export interface ExitAction {
  readonly id: 'leave' | 'finish' | 'discard';
  readonly label: string;
}

/** A session is still open while the transition table has not settled it (§7). */
export function canFinishSession(session: SessionState | null): boolean {
  if (session === null) return false;
  return (
    session.status !== 'completed' &&
    session.status !== 'partial' &&
    session.status !== 'abandoned'
  );
}

/**
 * S2/S3: what the exit offers right now. Leaving is always there — it is the way out of a
 * screen opened by accident — and closing is there whenever a session is still open,
 * including with no weight decided and not a single set logged. Nothing but a settled
 * session hides an action (S2): whether the close asks first is `finishStepFor`'s business
 * (S5), never the offer's.
 *
 * S3 adds one row, and defaulted on purpose: `canDiscard` is a session with nothing to
 * save, so every caller that has not asked about a discard keeps the two rows it had, and
 * a session with a confirmed set or a settled one can never offer the destructive one.
 */
export function exitOffer(canFinish: boolean, canDiscard = false): readonly ExitAction[] {
  return [
    { id: 'leave', label: EXIT_LEAVE_LABEL },
    ...(canFinish ? [{ id: 'finish' as const, label: EXIT_FINISH_LABEL }] : []),
    // Destructive last: the sheet's final row is the one that removes a record, never the
    // one that saves it.
    ...(canDiscard ? [{ id: 'discard' as const, label: EXIT_DISCARD_LABEL }] : []),
  ];
}

/**
 * S3: a session that only exists because it was opened by accident. It has to be still open
 * (a settled one is a record, not a mistake) and it cannot have a single confirmed set —
 * from the first one on, there is work to keep and discarding would throw it away.
 */
export function canDiscardSession(session: SessionState | null): boolean {
  if (session === null) return false;
  if (!canFinishSession(session)) return false;
  return summarise(session).setsConfirmed === 0;
}

/**
 * S3: what the discard asks before it writes — the owner is not asked to type, but the
 * sentence the store demands is shown in full, so nothing is removed without that exact
 * word on screen first. `confirmation` is `deleteSessionConfirmation(dayNameSnapshot)`.
 */
export function discardQuestion(confirmation: string): string {
  return `¿Descartar esta sesión? No hay ninguna serie confirmada que guardar: se borra con ${confirmation}.`;
}

/** The two methods of `storage.sessions` a discard needs, named for what they must do. */
export interface SessionDiscardPort {
  readonly markDeletionPending: (id: string) => Promise<void>;
  readonly delete: (id: string, input: { readonly confirmation: string }) => Promise<void>;
}

/**
 * I-5's two calls, in the only order the repository accepts (see `src/storage/constants.ts`
 * and `docs/architecture.md` I-5). The session feature cannot reuse
 * `features/progress/deleteFlow.ts` — a feature folder may not import another one
 * (`docs/architecture.md` §4) — so the order is restated here rather than moved, and the
 * sentence is still the store's own `deleteSessionConfirmation`, never a literal.
 */
export async function discardStoredSession(
  port: SessionDiscardPort,
  session: Pick<SessionState, 'id' | 'dayNameSnapshot'>,
): Promise<void> {
  await port.markDeletionPending(session.id);
  await port.delete(session.id, {
    confirmation: deleteSessionConfirmation(session.dayNameSnapshot),
  });
}

export interface DiscardOutcome {
  /** True only once the store removed the session and the owner left the screen. */
  readonly discarded: boolean;
  /** The sentence the sheet keeps when the discard did not happen; `null` on success. */
  readonly failure: string | null;
}

/**
 * S3: the whole discard, and the only door into it. A session with a confirmed set, or one
 * the table already settled, writes nothing at all; a failed write leaves the owner on the
 * session the store kept, with a sentence, and never navigates.
 */
export async function discardSession(input: {
  readonly port: SessionDiscardPort;
  readonly session: SessionState | null;
  readonly onExit: () => void;
}): Promise<DiscardOutcome> {
  const { session } = input;
  if (session === null) return { discarded: false, failure: DISCARD_REFUSED_MESSAGE };
  if (!canDiscardSession(session)) return { discarded: false, failure: DISCARD_REFUSED_MESSAGE };
  try {
    await discardStoredSession(input.port, session);
  } catch {
    return { discarded: false, failure: DISCARD_FAILED_MESSAGE };
  }
  input.onExit();
  return { discarded: true, failure: null };
}

/**
 * S5: closing asks once only when there is something written to lose. A session with no
 * confirmed set has nothing the question could protect, so one tap is the whole gesture.
 */
export function finishStepFor(session: SessionState): FinishStep {
  return summarise(session).setsConfirmed > 0 ? 'confirm' : 'close';
}

/**
 * S4: the close is the transition table's own event, with the outcome read from what the
 * session actually answered. No second rule lives here, and the table is what decides
 * whether a close is possible at all: a session with nothing confirmed is still
 * `scheduled`, and `session-finished` is refused from there (`notStarted`), so the screen
 * shows that sentence instead of inventing a status the table does not have.
 */
export function finishEvent(session: SessionState): SessionEvent {
  return {
    type: 'session-finished',
    outcome: isSessionAnswered(session) ? 'completed' : 'partial',
  };
}

/**
 * `3 de 10 series` — the session's progress in the header, read off the reducer's own tally
 * (`summarise`). Nothing is invented and nothing is stored: it is the same pair the terminal
 * summary shows, written while the session is still open. Module-local on purpose: it is a
 * sentence this screen writes, not an API another one calls.
 */
function headlineProgress(session: SessionState): string {
  const { setsConfirmed, setsPrescribed } = summarise(session);
  return `${String(setsConfirmed)} de ${String(setsPrescribed)} ${
    setsPrescribed === 1 ? 'serie' : 'series'
  }`;
}

export interface ExitActions {
  /** `Salir y seguir luego`: the host navigates away and the session stays resumable. */
  readonly leave: () => void;
  /** `Terminar la sesión`: one dispatch of the table's event, through the controller. */
  readonly finish: () => Promise<void>;
}

/**
 * S3/S4: the two named actions as the screen wires them — the host's own callback for the
 * way out, and the controller's own event for the close. Nothing here writes, so leaving
 * can never lose a set; nothing here invents, so closing can never add one.
 */
export function exitActionsFor(input: {
  readonly session: SessionState | null;
  readonly dispatch: (event: SessionEvent) => Promise<unknown> | void;
  readonly onExit: () => void;
}): ExitActions {
  return {
    leave: () => input.onExit(),
    finish: async () => {
      if (input.session === null) return;
      await input.dispatch(finishEvent(input.session));
    },
  };
}

export interface SessionExitProps {
  readonly open: boolean;
  readonly step: SheetStep;
  /** Confirmed sets of the open session: S5's only input, and the question's own number. */
  readonly setsConfirmed: number;
  /** False when there is nothing to close: no session yet, or one the table settled. */
  readonly canFinish: boolean;
  readonly onOpen: () => void;
  readonly onClose: () => void;
  readonly onLeave: () => void;
  /** `Terminar la sesión` among the two actions: the offer's own row. */
  readonly onFinish: () => void;
  /** `Terminar la sesión` in the question, once the owner has already chosen to close. */
  readonly onConfirm: () => void;
  /** S3: whether the session can only be thrown away — open, and not a single set. */
  readonly canDiscard?: boolean;
  /** S3: the word the store demands, `BORRAR <day>`, shown in the discard question. */
  readonly discardConfirmation?: string;
  /** S3: the sentence a failed discard leaves in the sheet, still open on the session. */
  readonly discardFailure?: string | null;
  /** `Descartar sesión` in the question: the only tap that removes a session. */
  readonly onDiscard?: () => void;
}

/**
 * S2/S3: the one top control and the sheet it opens, built like the day sheet — a
 * `role="dialog"` with `aria-modal`, focus moved into it when it opens (and when the
 * question replaces the two actions), Tab cycling inside it, Escape closing it, and the
 * focus going back to the control that opened it when it closes. S5: the question is a
 * group inside the same sheet, never a second dialog over a set.
 */
export function SessionExit(props: SessionExitProps): React.ReactElement {
  const {
    open,
    step,
    setsConfirmed,
    canFinish,
    onOpen,
    onClose,
    onLeave,
    onFinish,
    onConfirm,
  } = props;
  // S3's three inputs, defaulted so a sheet that has not asked about a discard is the two
  // rows it always had: the row is drawn only when the session can actually be thrown away.
  const canDiscard = props.canDiscard ?? false;
  const discardConfirmation = props.discardConfirmation ?? '';
  const discardFailure = props.discardFailure ?? null;
  const onDiscard = props.onDiscard ?? onClose;
  const trigger = useRef<HTMLButtonElement | null>(null);
  const sheet = useRef<HTMLDivElement | null>(null);
  const wasOpen = useRef(false);
  const asking = step === 'confirm';
  const discarding = step === 'discard';
  const sets = `${String(setsConfirmed)} ${setsConfirmed === 1 ? 'serie' : 'series'}`;

  // The day sheet's own focus behaviour, plus the way back: closing returns the keyboard
  // to the control that opened the sheet instead of leaving it loose on the card.
  useEffect(() => {
    if (open) {
      wasOpen.current = true;
      sheet.current?.focus();
      return;
    }
    if (!wasOpen.current) return;
    wasOpen.current = false;
    trigger.current?.focus();
  }, [open, step]);

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== 'Tab') return;
    // The trap: the sheet is a dialog over a session that is still visible, so Tab must
    // not walk out of it into the cards behind.
    const focusable = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>('button, [href], [tabindex="0"]'),
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (first === undefined || last === undefined) return;
    if (
      event.shiftKey &&
      (document.activeElement === first || document.activeElement === event.currentTarget)
    ) {
      event.preventDefault();
      last.focus();
      return;
    }
    if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <>
      <button
        type="button"
        ref={trigger}
        className="ds-action session__exit"
        onClick={onOpen}
        aria-label={EXIT_CONTROL_LABEL}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <Icon name="chevronDown" size={22} />
      </button>

      {open ? (
        <>
          {/* The shade is the thumb's shortcut out, never the only one: `Cerrar` and
              Escape are the accessible half of the same gesture. */}
          <div className="session-exit__shade" aria-hidden="true" onClick={onClose} />
          <div className="session-exit">
            <div
              className="session-exit__sheet"
              role="dialog"
              aria-modal="true"
              aria-label="Salir de la sesión"
              tabIndex={-1}
              ref={sheet}
              onKeyDown={onKeyDown}
            >
              <span className="session-exit__grab" aria-hidden="true" />
              <div className="session-exit__head">
                <h2 className="ds-card-title">Salir de la sesión</h2>
                <TextButton onClick={onClose}>Cerrar</TextButton>
              </div>

              {discarding ? (
                /*
                 * S3: the one question before a session is removed. The word the store
                 * demands (I-5) is written in full — the owner does not type it, so this is
                 * the last place it can be seen — and a failure keeps the question, and the
                 * session, exactly where they are.
                 */
                <div
                  className="session-exit__question"
                  role="group"
                  aria-label="Confirmar el descarte de la sesión"
                >
                  <p className="ds-body">{discardQuestion(discardConfirmation)}</p>
                  {discardFailure === null ? null : (
                    <p className="ds-meta" role="alert">
                      {discardFailure}
                    </p>
                  )}
                  <div className="session-exit__actions">
                    <PrimaryAction onClick={onDiscard}>{EXIT_DISCARD_LABEL}</PrimaryAction>
                    <TextButton onClick={onClose}>Cancelar</TextButton>
                  </div>
                </div>
              ) : asking ? (
                <div
                  className="session-exit__question"
                  role="group"
                  aria-label="Confirmar el cierre de la sesión"
                >
                  <p className="ds-body">{`¿Terminar la sesión? Se guarda lo que llevas: ${sets}.`}</p>
                  <div className="session-exit__actions">
                    <PrimaryAction onClick={onConfirm}>{EXIT_FINISH_LABEL}</PrimaryAction>
                    <TextButton onClick={onClose}>Cancelar</TextButton>
                  </div>
                </div>
              ) : (
                <>
                  <p className="ds-meta">
                    {canDiscard
                      ? 'Puedes dejarla abierta y seguir otro día, o descartarla: no hay ninguna serie confirmada.'
                      : canFinish
                        ? 'Puedes dejarla abierta y seguir otro día, o cerrarla con lo que lleves.'
                        : 'Esta sesión ya está cerrada: salir te deja en Inicio.'}
                  </p>
                  <div className="session-exit__actions">
                    {exitOffer(canFinish, canDiscard).map((action) => (
                      <button
                        key={action.id}
                        type="button"
                        className="ds-action session-exit__action"
                        onClick={
                          action.id === 'leave'
                            ? onLeave
                            : action.id === 'discard'
                              ? onDiscard
                              : onFinish
                        }
                      >
                        {action.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </>
      ) : null}
    </>
  );
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
  const machine = controller.machine;
  const session = runtime.session;

  const [drafts, setDrafts] = useState<Record<string, SetDraft>>({});
  /**
   * The confirmed set that is open in its editor (S2), if any. One at a time, and it is
   * the only thing on the card that answers while it is open.
   */
  const [editing, setEditing] = useState<EditingSetState | null>(null);
  /** A refusal of the rule, shown next to the editor instead of an edit. */
  const [editRefusal, setEditRefusal] = useState<string | null>(null);
  const [keypad, setKeypad] = useState<{
    readonly exerciseSessionId: string;
    readonly value: string;
    /** Which draft the pad is feeding: the next set's weight, or the correction. */
    readonly target: 'draft' | 'correction';
  } | null>(null);
  /**
   * `Sugerir otro ejercicio` (S4): the exercise session being swapped and the library the
   * alternatives are read from. The library is read on demand — the session only knows the
   * rows it prescribes — and a failed read leaves an empty list with its own sentence
   * instead of a picker that promises nothing.
   */
  const [swapping, setSwapping] = useState<{ readonly exerciseSessionId: string } | null>(null);
  /**
   * The exit sheet (S2, S3): closed until the top control is tapped, on the named actions
   * until closing is chosen with something to lose (S5) or until an empty session is
   * answered with a discard (S3). `discardFailure` is the sentence a failed write leaves in
   * the sheet, and it is nulled on every way into the sheet.
   */
  const [exit, setExit] = useState<{
    readonly open: boolean;
    readonly step: SheetStep;
    readonly discardFailure: string | null;
  }>({
    open: false,
    step: 'actions',
    discardFailure: null,
  });
  const [library, setLibrary] = useState<readonly Exercise[]>([]);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const guardRef = useRef(0);
  const settleRef = useRef<number | null>(null);
  /** The card whose verdict is being written: a second tap must not interrupt the first. */
  const writingRef = useRef<string | null>(null);

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

  /* ------------------------------------------------------------ the way out (S2–S6) */

  const exitActions = useMemo(
    () => exitActionsFor({ session, dispatch, onExit }),
    [dispatch, onExit, session],
  );

  const openExit = useCallback(() => {
    setExit({ open: true, step: 'actions', discardFailure: null });
  }, []);

  const closeExit = useCallback(() => {
    setExit({ open: false, step: 'actions', discardFailure: null });
  }, []);

  /** `Salir y seguir luego`: the host leaves and the session stays open and resumable. */
  const leaveSession = useCallback(() => {
    setExit({ open: false, step: 'actions', discardFailure: null });
    exitActions.leave();
  }, [exitActions]);

  /** `Terminar la sesión`, confirmed or on its own: the table's event, then the sheet goes. */
  const closeAndFinish = useCallback(() => {
    setExit({ open: false, step: 'actions', discardFailure: null });
    void exitActions.finish();
  }, [exitActions]);

  /**
   * S5: closing with sets confirmed asks once; with nothing logged the single tap closes.
   * The close is `finishEvent`, so a session with no confirmed set is refused by the
   * transition table and the screen shows the table's own sentence instead of a status it
   * does not have.
   */
  const chooseFinish = useCallback(() => {
    if (session === null) return;
    if (finishStepFor(session) === 'confirm') {
      setExit({ open: true, step: 'confirm', discardFailure: null });
      return;
    }
    closeAndFinish();
  }, [closeAndFinish, session]);

  /**
   * S3: `Descartar sesión` asks once, and the question shows the word the store demands.
   * Nothing is written here; the row is only offered for a session with nothing to save.
   */
  const chooseDiscard = useCallback(() => {
    if (!canDiscardSession(session)) return;
    setExit({ open: true, step: 'discard', discardFailure: null });
  }, [session]);

  /**
   * S3: the only tap that removes a session. The sheet closes only when the store actually
   * removed it and the host is leaving; a failure leaves it open, on the same question,
   * with the sentence and with the way to try again.
   */
  const confirmDiscard = useCallback(() => {
    if (session === null) return;
    void discardSession({
      port: storage.sessions,
      session,
      onExit: () => {
        setExit({ open: false, step: 'actions', discardFailure: null });
        onExit();
      },
    }).then((outcome) => {
      if (outcome.discarded) return;
      setExit({ open: true, step: 'discard', discardFailure: outcome.failure });
    });
  }, [onExit, session, storage]);

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

  // `Lo hice` / `Fallé` / `Fui sobrado` (S4, S8): one tap, and the sets of the exercise
  // are confirmed in order by the same event the pinned bar sends. The machine takes one
  // write at a time, so the sets are awaited one after another; the guard keeps a second
  // tap from starting a second run while the first is still writing.
  const answerVerdict = useCallback(
    (exercise: ExerciseState, verdict: ExerciseVerdict) => {
      if (writingRef.current !== null) return;
      writingRef.current = exercise.id;
      setSwapping(null);
      void writeVerdict((event) => machine.dispatch(event, clock.now()), exercise, verdict).finally(
        () => {
          writingRef.current = null;
        },
      );
    },
    [clock, machine],
  );

  const openKeypad = useCallback((exercise: ExerciseState) => {
    setKeypad({
      exerciseSessionId: exercise.id,
      value: formatWeight(draftFor(exercise).weightKg),
      target: 'draft',
    });
  }, [draftFor]);

  /* ------------------------------------------------------- correcting a set (S2–S6) */

  /**
   * The 500 ms press landed: open that row in place. The gate is the same pure rule the
   * save uses, so a row can never open an editor whose `Guardar` would be refused (S5) and
   * an unanswered slot can never be "corrected" (S6).
   */
  const openCorrection = useCallback(
    (exercise: ExerciseState, slot: number) => {
      if (session === null || !isCorrectable(session, exercise.id, slot)) return;
      const entry = exercise.sets.find((candidate) => candidate.slot === slot);
      if (entry === undefined || entry.status !== 'confirmed') return;

      setSwapping(null);
      setKeypad(null);
      setEditRefusal(null);
      setEditing({
        exerciseSessionId: exercise.id,
        slot,
        draft: {
          weightKg: entry.set.weightKg,
          reps: entry.set.actualReps,
          effort: formatEffort(entry.set.effort),
          discomfort: formatDiscomfort(entry.set.discomfort),
          showDiscomfort: entry.set.discomfort !== null,
        },
      });
    },
    [session],
  );

  const patchCorrection = useCallback((patch: Partial<SetDraft>) => {
    setEditing((current) =>
      current === null ? null : { ...current, draft: { ...current.draft, ...patch } },
    );
  }, []);

  /** `Cancelar`: nothing was written, and the row is the confirmed row it always was. */
  const cancelCorrection = useCallback(() => {
    setEditing(null);
    setKeypad(null);
    setEditRefusal(null);
  }, []);

  const openCorrectionKeypad = useCallback(() => {
    if (editing === null) return;
    setKeypad({
      exerciseSessionId: editing.exerciseSessionId,
      value: formatWeight(editing.draft.weightKg),
      target: 'correction',
    });
  }, [editing]);

  /**
   * `Guardar` (S6): one write, and the editor closes once the rule let it through. A failed
   * write is the sheet's ordinary failure: the row keeps what it had and the banner says so.
   */
  const saveCorrection = useCallback(() => {
    if (editing === null || session === null) return;
    const { exerciseSessionId, slot, draft } = editing;
    setKeypad(null);

    void writeCorrection(
      (event) => machine.dispatch(event, clock.now()),
      session,
      exerciseSessionId,
      slot,
      correctionOf(draft),
    ).then((result) => {
      if (result.refusal !== null) {
        setEditRefusal(result.refusal);
        return;
      }
      setEditRefusal(null);
      setEditing(null);
    });
  }, [clock, editing, machine, session]);

  const submitKeypad = useCallback(() => {
    if (keypad === null || session === null) return;
    const kg = parseWeight(keypad.value);
    setKeypad(null);
    if (kg === null) return;
    // The pad is one pad: while a correction is open it feeds the correction's kilos and
    // nothing else, so the sheet never shows two weight pads (S2).
    if (keypad.target === 'correction') {
      patchCorrection({ weightKg: kg });
      return;
    }
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
  }, [dispatch, keypad, patchCorrection, patchDraft, session]);

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

  /**
   * The header (T6, S1): the workout's own name, how far through the session it is, and the
   * one control that opens the way out. Three things, one row, nothing else — the workout
   * below owns the screen.
   *
   * The session's progress is written here (`3 de 10 series`, off the reducer's own tally)
   * and drawn in the hero, where the ring's arcs count the exercises. Two scales of one fact,
   * and neither of them is a control.
   */
  const topBar = (
    <header className="session__top">
      <SessionExit
        open={exit.open}
        step={exit.step}
        canFinish={canFinishSession(session)}
        setsConfirmed={session === null ? 0 : summarise(session).setsConfirmed}
        canDiscard={canDiscardSession(session)}
        discardConfirmation={
          session === null ? '' : deleteSessionConfirmation(session.dayNameSnapshot)
        }
        discardFailure={exit.discardFailure}
        onOpen={openExit}
        onClose={closeExit}
        onLeave={leaveSession}
        onFinish={chooseFinish}
        onConfirm={closeAndFinish}
        onDiscard={confirmDiscard}
      />
      <div className="session__identity">
        <p className="session__day">{session === null ? 'Sesión' : session.dayNameSnapshot}</p>
        <p className="session__meta">
          {session === null
            ? formatWeekdayTime(now)
            : `${formatWeekdayTime(now)} · ${headlineProgress(session)}`}
        </p>
      </div>
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
  const decided = exerciseOnScreen !== null && exerciseOnScreen.decision !== null;
  const slot = exerciseOnScreen === null ? null : nextSlotOf(exerciseOnScreen);
  const lastSlot = exerciseOnScreen?.prescription.sets ?? 0;

  // ---------------------------------------------------------------- the visual core
  const heroDetail = exerciseOnScreen === null ? undefined : runtime.exercises[exerciseOnScreen.id];
  // The artwork the library already maps to this exercise, or nothing at all: a row the
  // library no longer has falls back to its equipment icon instead of somebody else's
  // drawing (`illustrationKeyOf`).
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

  // `Terminar la sesión` lives in the top control's sheet now (S2, S3): the bottom bar
  // keeps its single job, and the close is reachable in every state, not only in the
  // branches where the bar happens to be free.
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
    // A correction owns the pinned bar while it is open: `Guardar` and `Cancelar` are where
    // the thumb already is, and `Registrar serie` is gone — a mis-tap there would write a
    // new set over a half-corrected one.
    if (editing !== null) {
      return (
        <div className="session__actions session__actions--split">
          <TextButton onClick={cancelCorrection}>Cancelar</TextButton>
          <PrimaryAction onClick={saveCorrection}>Guardar</PrimaryAction>
        </div>
      );
    }

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
    // confirmed set alike, so nothing has to be dismissed before the next one. It is the
    // bar's only action: closing the session is the top control's job (S2, S6).
    if (exerciseOnScreen !== null && slot !== null) {
      const draft = draftFor(exerciseOnScreen);
      return (
        <div className="session__actions">
          <PrimaryAction onClick={() => confirmSet(exerciseOnScreen)}>
            Registrar serie
            <span className="ds-visually-hidden">
              {` ${String(slot)} de ${String(lastSlot)}, ${String(draft.reps)} repeticiones`}
            </span>
          </PrimaryAction>
        </div>
      );
    }

    const isLast = (session.activeIndex ?? 0) + 1 >= total;
    if (isLast) {
      // Nothing is left to answer in this exercise and there is no next one: the verdict row
      // above the bar and the exit control at the top are the two things left to do, and
      // neither belongs in a pinned bar (S6). The bar stays empty instead of inventing a
      // third way out.
      return <div className="session__actions" />;
    }

    // The exercise is answered and another one is waiting: continuing *is* the next decision,
    // so it takes the pinned fill — one accent, one action, where the thumb already is. It is
    // the bar's only control here, so the screen still shows exactly one accent fill.
    return (
      <div className="session__actions">
        <PrimaryAction onClick={() => goTo((session.activeIndex ?? 0) + 1)}>Siguiente</PrimaryAction>
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

      {/* T6: the exercise on screen, read at a glance — the artwork the library already maps
          to it (`illustrationKeyOf`), its name, its material and its muscle group. The
          numbers live in the card below and the session's progress in the header, so the
          first viewport is identity, prescription and set rows instead of a 34dvh circle. */}
      {terminal || exerciseOnScreen === null ? null : (
        <section
          className="session-hero"
          aria-label="Ejercicio actual"
          onPointerDown={onHeroPointerDown}
          onPointerUp={onHeroPointerUp}
          onPointerCancel={onHeroPointerCancel}
        >
          <div className="session-hero__dial">
            <SessionRing segments={ringSegments(session)}>
              {/* The centre of the circle is the movement itself: the artwork the library
                  already maps to it, or its equipment when the row names none. Nothing else
                  — the numbers are in the card and the name is beside it. */}
              <div className="session-hero__art">
                {heroIllustration === null ? (
                  heroDetail === undefined ? null : (
                    <Icon
                      className="session-hero__icon"
                      name={EQUIPMENT_ICON[heroDetail.equipment]}
                      size={40}
                    />
                  )
                ) : (
                  <ExerciseIllustration
                    className="session-hero__picture"
                    illustration={heroIllustration}
                    label={exerciseOnScreen.exerciseNameSnapshot}
                  />
                )}
              </div>
            </SessionRing>
          </div>
          <div className="session-hero__copy">
            <h2 className="session-hero__name">{exerciseOnScreen.exerciseNameSnapshot}</h2>
            {heroDetail === undefined ? null : (
              <div className="session-hero__chips">
                <Chip>{MUSCLE_LABEL[heroDetail.primaryMuscle]}</Chip>
                <Chip icon={EQUIPMENT_ICON[heroDetail.equipment]}>
                  {EQUIPMENT_LABEL[heroDetail.equipment]}
                </Chip>
              </div>
            )}
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
              // While one row is open in its editor the card answers for that row only
              // (S2): nothing else on it can be confirmed by accident.
              interactive={!terminal && index === session.activeIndex && editing === null}
              // The hero above already names the exercise on screen and its material; that
              // card starts at its numbers. A neighbour slid halfway into view still names
              // itself, and so does every card once the hero is gone (a finished session), so
              // no slide is ever a set list without a title.
              heroShown={!terminal && exerciseOnScreen !== null && index === session.activeIndex}
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
              {...(!terminal && index === session.activeIndex && editing === null
                ? { onCorrectSet: (slot: number) => openCorrection(exercise, slot) }
                : {})}
              {...(editing !== null && editing.exerciseSessionId === exercise.id
                ? {
                    editing: {
                      slot: editing.slot,
                      draft: editing.draft,
                      onRepsChange: (reps: number) => patchCorrection({ reps }),
                      onEffortChange: (effort: EffortChip | null) =>
                        patchCorrection({ effort }),
                      onDiscomfortChange: (discomfort: DiscomfortChip | null) =>
                        patchCorrection({ discomfort }),
                      onShowDiscomfort: () => patchCorrection({ showDiscomfort: true }),
                      onEditWeight: openCorrectionKeypad,
                    },
                  }
                : {})}
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
            {/* S4: one quiet line under the set list, while a set is done and nothing is
                being edited. It teaches the gesture once and adds no control (S2). */}
            {index === session.activeIndex && showsCorrectionHint(session, editing !== null) ? (
              <CorrectionHint />
            ) : null}
            {/* The rule refused the correction, in the owner's words, next to the row. */}
            {editing === null || editRefusal === null ? null : (
              <p className="ds-caption session-verdict__note" role="status">
                {editRefusal}
              </p>
            )}
            {/* S4/S8: one answer per exercise, after its set rows, where the owner
                finishes it. The other slides stay read-only, as they already do. */}
            {terminal ||
            index !== session.activeIndex ||
            editing !== null ||
            nextSlotOf(exercise) === null ? null : (
              <VerdictRow
                exercise={exercise}
                onVerdict={(verdict) => answerVerdict(exercise, verdict)}
              />
            )}
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
          <WeightKeypad
            value={keypad.value}
            onChange={(value) =>
              setKeypad({ ...keypad, value })
            }
            onSubmit={submitKeypad}
            label="Peso en kilogramos"
            hint="Ajusta con la coma decimal"
          />
          <TextButton onClick={() => setKeypad(null)}>Cancelar</TextButton>
        </div>
      )}

      <div className="session__bar">{bottomBar}</div>
    </div>
  );
}
