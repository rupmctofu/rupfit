/**
 * When the first-run setup is offered — the pure half of `useSetupGate`.
 *
 * The four states of the design's "what can the app honestly do right now" question are
 * decided here, from one snapshot, so the shell holds no branch worth testing. Two of
 * them are refusals to ask: a store that is still loading must not flash a form over the
 * screen it is about to show, and a store whose read failed must not be treated as empty
 * — "no profile" and "we could not look" are different answers (design-system §2.5).
 */

import { describe, expect, it } from 'vitest';
import type { PlanDay, UserProfile } from '../../storage';
import { seedPlanDays } from '../../core/seed';
import { setupOffer, type SetupInput } from './setup';

const PROFILE: UserProfile = {
  id: 'profile-1',
  displayName: 'Rup',
  massUnit: 'kilograms',
  weightGoal: 'maintain',
  weeklyTrainingDays: 3,
  availableEquipment: ['barbell'],
  autoStartRestTimer: true,
};

const PLAN: readonly PlanDay[] = seedPlanDays();

function input(overrides: Partial<SetupInput> = {}): SetupInput {
  return {
    phase: 'ready',
    profile: PROFILE,
    plan: PLAN,
    inProgress: undefined,
    ...overrides,
  };
}

describe('setupOffer', () => {
  it('offers the setup when the store holds no profile', () => {
    expect(setupOffer(input({ profile: undefined }))).toEqual({
      kind: 'setup',
      reason: 'noProfile',
    });
  });

  it('offers the setup when a profile exists but there is no plan to train', () => {
    // The state Perfil's own "Crear perfil" produces, and the state a half-finished first
    // run would leave behind. Without this branch the app would refuse to start a session
    // and offer nothing that could fix it.
    expect(setupOffer(input({ plan: [] }))).toEqual({ kind: 'setup', reason: 'noPlan' });
  });

  it('hides the setup once the store can train: a profile and a plan', () => {
    expect(setupOffer(input())).toEqual({ kind: 'hidden', reason: 'ready' });
  });

  it('hides the setup while the snapshot is still loading, instead of flashing a form', () => {
    expect(setupOffer(input({ phase: 'loading', profile: undefined, plan: [] }))).toEqual({
      kind: 'hidden',
      reason: 'loading',
    });
  });

  it('hides the setup when the read failed: unreadable is not empty', () => {
    expect(setupOffer(input({ phase: 'failed', profile: undefined, plan: [] }))).toEqual({
      kind: 'hidden',
      reason: 'failed',
    });
  });

  it('never replaces a session in progress, even with no profile to show for it (I-9)', () => {
    const offer = setupOffer(
      input({
        profile: undefined,
        plan: [],
        inProgress: {
          id: 'session-1',
          planDayId: 'seed-day-lower',
          dayNameSnapshot: 'SENTADILLA / PIERNA',
          scheduledDate: 0,
          startedAt: 0,
          endedAt: null,
          phase: { kind: 'readaptation', week: 1 },
          status: 'inProgress',
          exercises: [],
        },
      }),
    );

    expect(offer).toEqual({ kind: 'hidden', reason: 'sessionInProgress' });
  });
});
