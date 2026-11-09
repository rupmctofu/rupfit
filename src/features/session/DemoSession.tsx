/**
 * `#/sesion/demo`: the session screen with fixtures, for review on the phone before
 * Inicio exists.
 *
 * It says so on screen, it writes nothing to IndexedDB (the port is in memory), and it
 * lets the owner step through every state of the design's Sesión row with one tap. The
 * scenario's seed is built against the instant it was opened, so the set timestamps are
 * real rather than frozen at a fixture value.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import { DEMO_SCENARIOS, demoJournal, demoScenario, demoStorage, type DemoScenarioId } from './demo';
import type { SessionMachine } from './controller';
import { SessionScreen } from './SessionScreen';

export interface DemoSessionProps {
  readonly onExit: () => void;
}

interface DemoRun {
  readonly id: DemoScenarioId;
  /** The instant the fixture was built at: the set timestamps derive from here. */
  readonly at: number;
}

export function DemoSession({ onExit }: DemoSessionProps): React.ReactElement {
  const [run, setRun] = useState<DemoRun>(() => ({ id: 'decision', at: Date.now() }));
  const primed = useRef(false);

  const scenario = demoScenario(run.id);
  const storage = useMemo(() => demoStorage(scenario, run.at), [scenario, run.at]);
  const journal = useMemo(() => demoJournal(scenario, run.at), [scenario, run.at]);
  const clock = useMemo(() => ({ now: () => Date.now() }), []);

  const open = (id: DemoScenarioId): void => {
    primed.current = false;
    setRun({ id, at: Date.now() });
  };

  // The scenarios that need one event to reach their state (a failed write, a finished
  // session) prime it here, exactly once, on the same machine the screen shows.
  const onReady = useCallback(
    (machine: SessionMachine, now: number) => {
      if (primed.current) return;
      primed.current = true;
      if (scenario.settled === true) machine.dismissRecovery();
      if (scenario.prime !== undefined) void scenario.prime(machine, now);
    },
    [scenario],
  );

  const demoBar = (
    <div className="session__demo">
      <p className="session__demo-title">DEMO · datos de ejemplo, no se guarda nada</p>
      <div className="session__demo-scenarios" role="group" aria-label="Escenario de la demo">
        {DEMO_SCENARIOS.map((candidate) => (
          <button
            key={candidate.id}
            type="button"
            className="ds-action session__demo-chip"
            aria-pressed={candidate.id === run.id}
            title={candidate.hint}
            onClick={() => open(candidate.id)}
          >
            {candidate.label}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <SessionScreen
      key={`${run.id}-${run.at}`}
      storage={storage}
      clock={clock}
      journal={journal}
      onExit={onExit}
      onReady={onReady}
      topSlot={demoBar}
    />
  );
}
