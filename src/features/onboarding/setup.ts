/**
 * When the app is allowed to ask for a starting point — the pure half of the gate.
 *
 * The whole first-run problem is in one sentence: the store is empty, every screen still
 * exists, and each of them refuses for a different reason (`noProfile`, `noPlan`). Asking
 * the owner four questions once is better than four refusals, so the shell asks `setupOffer`
 * whether to replace the tab with the setup, and this function owns the answer.
 *
 * Three rules it keeps:
 *
 * 1. **A session in progress wins** (I-9). A profile missing from an open session means the
 *    owner started training before there was a profile to train with; replacing that sheet
 *    with a form would lose the session that is already half written.
 * 2. **"Unreadable" is not "empty"** (design-system §2.5). A failed read hides the setup and
 *    lets the screen that owns the error say so; treating it as a first run would invite the
 *    owner to overwrite the store they cannot currently read.
 * 3. **A profile with no plan is still an unfinished start.** Perfil can write a profile on
 *    its own (`Crear perfil`), and a profile without a plan cannot start a session
 *    (`START_COPY.noPlan`). Offering the setup there is what keeps that state repairable.
 *
 * No React, no storage call, no clock: the decision is a value, so the shell's branch is
 * one fixture away from a test.
 */

import type { PlanDay, UserProfile, WorkoutSession } from '../../storage';

/** Why the setup is being offered. Both reasons change the first line of the screen. */
export type SetupReason = 'noProfile' | 'noPlan';

export type SetupOffer =
  | { readonly kind: 'setup'; readonly reason: SetupReason }
  /**
   * `loading` and `failed` are the snapshot's own states; `sessionInProgress` is a session
   * the setup must not interrupt; `ready` is the ordinary case — the store can train.
   */
  | { readonly kind: 'hidden'; readonly reason: 'loading' | 'failed' | 'sessionInProgress' | 'ready' };

export type SetupSnapshotPhase = 'loading' | 'ready' | 'failed';

export interface SetupInput {
  readonly phase: SetupSnapshotPhase;
  readonly profile: UserProfile | undefined;
  readonly plan: readonly PlanDay[];
  readonly inProgress: WorkoutSession | undefined;
}

export function setupOffer(input: SetupInput): SetupOffer {
  if (input.phase === 'loading') return { kind: 'hidden', reason: 'loading' };
  if (input.phase === 'failed') return { kind: 'hidden', reason: 'failed' };
  if (input.inProgress !== undefined) return { kind: 'hidden', reason: 'sessionInProgress' };
  if (input.profile === undefined) return { kind: 'setup', reason: 'noProfile' };
  if (input.plan.length === 0) return { kind: 'setup', reason: 'noPlan' };
  return { kind: 'hidden', reason: 'ready' };
}

/** The route the setup lives at, so an existing store can be sent to it explicitly. */
export const SETUP_HASH = '#/empezar';
