/**
 * The React seam over the machine: one machine per mount, one clock at the top, and a
 * `now` that ticks.
 *
 * The screen below this hook receives `now` as a parameter and never reads the clock
 * itself; the only interval in the session screen lives here. The tick exists for the
 * top bar's time — there is no countdown to drive, because the session has no rest
 * timer (S5) and nothing on it depends on the clock for state.
 */

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { SessionEvent } from '../../core/session/model';
import type { StoragePort } from '../../storage';
import {
  createSessionMachine,
  screenStateOf,
  type Clock,
  type SessionJournal,
  type SessionMachine,
  type SessionRuntime,
  type ScreenState,
} from './controller';
import { createSessionStorageJournal } from './journal';

export interface UseSessionOptions {
  readonly storage: StoragePort;
  readonly clock: Clock;
  readonly journal?: SessionJournal | undefined;
  /** The tick of the top bar. One second, never less. */
  readonly tickMs?: number | undefined;
}

export interface SessionController {
  /** The machine itself, for the demo's primed events. Not used by the screen's UI. */
  readonly machine: SessionMachine;
  readonly runtime: SessionRuntime;
  readonly now: number;
  readonly screenState: ScreenState;
  dispatch(event: SessionEvent): void;
  retry(): void;
  dismissRecovery(): void;
}

export function useSessionController(options: UseSessionOptions): SessionController {
  const { storage, clock, journal, tickMs = 1000 } = options;

  // One machine per mount. The demo remounts the screen per scenario with a `key`, so
  // a new scenario never inherits the previous one's writes.
  const [machine] = useState(() =>
    createSessionMachine({ storage, clock, journal: journal ?? createSessionStorageJournal() }),
  );

  const runtime = useSyncExternalStore(machine.subscribe, machine.runtime, machine.runtime);
  const [now, setNow] = useState(() => clock.now());

  useEffect(() => {
    void machine.boot();
  }, [machine]);

  useEffect(() => {
    const read = (): void => setNow(clock.now());
    read();
    const interval = window.setInterval(read, tickMs);
    // A locked screen suspends timers; the first thing after waking is a fresh read.
    const onVisibility = (): void => {
      if (document.visibilityState === 'visible') read();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [clock, tickMs]);

  const dispatch = useCallback(
    (event: SessionEvent) => {
      void machine.dispatch(event, clock.now());
    },
    [machine, clock],
  );

  const retry = useCallback(() => {
    void machine.retry(clock.now());
  }, [machine, clock]);

  const dismissRecovery = useCallback(() => {
    machine.dismissRecovery();
  }, [machine]);

  const screenState = useMemo(() => screenStateOf(runtime), [runtime]);

  return { machine, runtime, now, screenState, dispatch, retry, dismissRecovery };
}
