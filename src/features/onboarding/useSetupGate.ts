/**
 * The React seam of the first-run gate: three reads, one pure decision, one reload.
 *
 * The shell needs to know whether to show Inicio or the setup *before* it renders either,
 * so this hook is the only read the shell performs on its own. It does not decide anything
 * — `setupOffer` does — and it holds no data beyond what the form prefills from.
 *
 * Two behaviours the screens depend on:
 *
 * - **`enabled` is false outside the tab routes.** `#/sesion` and `#/galeria` must not
 *   touch the store from the shell: the demo ports read fixtures and the session reads its
 *   own aggregate. When the gate is disabled the offer is `hidden`, so the shell renders
 *   the sheet it was asked for.
 * - **`reload()` re-runs the reads.** It is what the setup calls after a successful write,
 *   so the shell lets go of the form in the same tick that lands on Inicio.
 */

import { useCallback, useEffect, useState } from 'react';
import type { PlanDay, StoragePort, UserProfile } from '../../storage';
import { setupOffer, type SetupOffer } from './setup';

export interface SetupGate {
  readonly phase: 'loading' | 'ready' | 'failed';
  readonly offer: SetupOffer;
  /** The stored profile, for the form's initial values. `undefined` on a first run. */
  readonly profile: UserProfile | undefined;
  /** The stored plan, so the existing-store view can say what is already there. */
  readonly plan: readonly PlanDay[];
  readonly reload: () => void;
}

const HIDDEN: SetupOffer = { kind: 'hidden', reason: 'ready' };

interface Snapshot {
  readonly phase: SetupGate['phase'];
  readonly profile: UserProfile | undefined;
  readonly plan: readonly PlanDay[];
  readonly offer: SetupOffer;
}

const LOADING: Snapshot = { phase: 'loading', profile: undefined, plan: [], offer: { kind: 'hidden', reason: 'loading' } };

async function readSnapshot(storage: StoragePort): Promise<Snapshot> {
  const [profile, plan, inProgress] = await Promise.all([
    storage.profile.read(),
    storage.plan.all(),
    storage.sessions.inProgress(),
  ]);
  return {
    phase: 'ready',
    profile,
    plan,
    // The decision is made here, once, from the same snapshot the form will prefill from.
    offer: setupOffer({ phase: 'ready', profile, plan, inProgress }),
  };
}

export function useSetupGate(storage: StoragePort, enabled: boolean): SetupGate {
  const [attempt, setAttempt] = useState(0);
  const [snapshot, setSnapshot] = useState<Snapshot>(LOADING);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    // A reload after a ready snapshot keeps the screen it is showing: blanking the form for
    // one frame to re-read three keys would be a layout shift for no information (S4).
    setSnapshot((current) => (current.phase === 'ready' ? current : { ...current, phase: 'loading' }));

    readSnapshot(storage).then(
      (next) => {
        if (!cancelled) setSnapshot(next);
      },
      () => {
        // Unreadable is not empty (design-system §2.5): the screen that owns the error
        // says so, and the setup does not invite the owner to start over on top of a
        // store it could not read.
        if (!cancelled) {
          setSnapshot({
            phase: 'failed',
            profile: undefined,
            plan: [],
            offer: { kind: 'hidden', reason: 'failed' },
          });
        }
      },
    );

    return () => {
      cancelled = true;
    };
  }, [attempt, enabled, storage]);

  const reload = useCallback(() => setAttempt((value) => value + 1), []);

  return {
    phase: enabled ? snapshot.phase : 'ready',
    offer: enabled ? snapshot.offer : HIDDEN,
    profile: snapshot.profile,
    plan: snapshot.plan,
    reload,
  };
}
