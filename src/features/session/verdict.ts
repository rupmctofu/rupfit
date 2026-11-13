/**
 * The one-answer verdict of an exercise — S2, S3, S4, S8 (T6).
 *
 * The owner does not report set by set: the prescription already arrives complete (sets,
 * reps and the suggested load, S2/S3), so the only question left is how the exercise
 * went. `Lo hice`, `Fallé`, `Fui sobrado` — and that is the entire interaction (S8).
 *
 * A verdict writes nothing new. It is the prescribed set list, filled in with the numbers
 * the answer implies, so `set-confirmed` stays the only writer of a set and the engine and
 * the history keep reading exactly what they read after five manual confirmations
 * (S4 → §5.4, §7). Nothing here is stored, no migration is needed, and no model changes.
 *
 * Pure by construction: no React, no storage, no clock. Given the same prescription, the
 * same load and the same answer, it returns the same sets.
 */

import { EFFORT, type Effort, type ExercisePrescription } from '../../core/domain';

/** The three answers of S4, in the order the row shows them. */
export type ExerciseVerdict = 'done' | 'failed' | 'easy';

export const VERDICT_LABEL: Record<ExerciseVerdict, string> = {
  done: 'Lo hice',
  failed: 'Fallé',
  easy: 'Fui sobrado',
};

/** One set a verdict implies, ready to travel as the payload of `set-confirmed`. */
export interface VerdictSet {
  /** 1-based prescription slot, exactly as the sheet numbers its rows. */
  readonly slot: number;
  readonly weightKg: number;
  readonly actualReps: number;
  readonly effort: Effort;
}

export type VerdictResult =
  | { readonly ok: true; readonly sets: readonly VerdictSet[] }
  | { readonly ok: false; readonly message: string };

/** S3: the load is already on the card. Without one there is nothing to write. */
export const NO_LOAD_MESSAGE =
  'Elige primero el peso: este ejercicio todavía no tiene uno sugerido.';

/** A timed slot has no kilos and no range to reach the top of. */
export const TIMED_VERDICT_MESSAGE =
  'En un ejercicio por tiempo solo puedes responder «Lo hice» o «Fallé».';

/**
 * A slot is prescribed by time when it carries `durationSeconds` instead of repetitions.
 * That used to mean conditioning slots only (odd/tasks/training-program.md L11); since
 * odd/tasks/five-day-plan.md S1 the planks of the mobility day are timed too, so the field
 * is still the whole test but it is no longer a synonym for conditioning.
 */
export function isTimed(prescription: ExercisePrescription): boolean {
  return prescription.durationSeconds !== undefined;
}

/**
 * The answers a slot accepts, in display order. `Fui sobrado` is excluded on a timed slot:
 * there is no load to raise and no top of a rep range to overshoot.
 */
export function availableVerdicts(prescription: ExercisePrescription): readonly ExerciseVerdict[] {
  return isTimed(prescription) ? ['done', 'failed'] : ['done', 'failed', 'easy'];
}

/**
 * Why the verdict cannot be written yet, in Spanish, or `null` when it can. The load is
 * the only prerequisite: §S3 puts the suggestion on the card before the owner arrives, and
 * a missing one is a first-time exercise whose weight the owner has to choose.
 */
export function verdictRefusal(
  prescription: ExercisePrescription,
  suggestedWeightKg: number | null,
): string | null {
  if (isTimed(prescription)) return null;
  if (suggestedWeightKg === null || !Number.isFinite(suggestedWeightKg) || suggestedWeightKg < 0) {
    return NO_LOAD_MESSAGE;
  }
  return null;
}

/**
 * The set records the answer implies:
 *
 * - `lo hice` — every prescribed set at the bottom of the range, at the suggested load,
 *   with the effort the target asks for;
 * - `fallé` — the prescribed sets with the last one short of the bottom and marked as a
 *   failure, so §7's "first miss" and "two consecutive misses" fire exactly as they would
 *   after a real session;
 * - `fui sobrado` — every set at the top of the range, marked easy, which is §7's
 *   "top of the range" increase.
 */
export function verdictSets(
  prescription: ExercisePrescription,
  suggestedWeightKg: number | null,
  verdict: ExerciseVerdict,
): VerdictResult {
  const refusal = verdictRefusal(prescription, suggestedWeightKg);
  if (refusal !== null) return { ok: false, message: refusal };

  const timed = isTimed(prescription);
  if (timed && verdict === 'easy') return { ok: false, message: TIMED_VERDICT_MESSAGE };

  // A timed slot has no load to put on the bar: zero is the honest record, not a guess.
  const weightKg = timed ? 0 : (suggestedWeightKg ?? 0);
  const bottom = prescription.repRange.lowerBound;
  const top = prescription.repRange.upperBound;

  const sets: VerdictSet[] = [];
  for (let slot = 1; slot <= prescription.sets; slot += 1) {
    const last = slot === prescription.sets;
    sets.push({
      slot,
      weightKg,
      actualReps: repsOf(verdict, last, bottom, top),
      effort: effortOf(verdict, last),
    });
  }

  return { ok: true, sets };
}

/**
 * The reps of one set. `fallé` misses the bottom by exactly one rep on the last set —
 * §7 counts a miss by comparing against the bottom, so one rep is enough and invents no
 * collapse; a prescription whose bottom is already zero cannot miss, and stays at zero.
 */
function repsOf(verdict: ExerciseVerdict, last: boolean, bottom: number, top: number): number {
  if (verdict === 'easy') return top;
  if (verdict === 'failed' && last) return Math.max(0, bottom - 1);
  return bottom;
}

/**
 * The effort of one set. `fallé` marks the set that failed; the sets that came before it
 * were completed, so they carry the ordinary effort instead of inheriting the failure.
 */
function effortOf(verdict: ExerciseVerdict, last: boolean): Effort {
  if (verdict === 'easy') return EFFORT.easy;
  if (verdict === 'failed' && last) return EFFORT.failure;
  return EFFORT.correct;
}
