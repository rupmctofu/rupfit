/*
 * The Resumen sheet's reads, its one write, and its route.
 *
 * `#/resumen/<id>` reads the session the flow just finished; `#/resumen/demo` reads a
 * fixture through the same code path, which is why the demo is a port and a clock rather
 * than a second screen. `Hecho` closes the sheet, and closes the session with it **only
 * when the session is still open** — `sessions.finish` refuses a terminal status from
 * `scheduled` (port.ts §7), so a scheduled day is never written by a summary nobody
 * trained.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { EmptyState } from '../../design-system';
import type { StoragePort } from '../../storage';
import { useAppServices } from '../../app/providers';
import type { Clock } from '../session/controller';
import { demoClock, demoNow, demoPort, demoWeek, DemoBar, type DemoScenario } from '../home/demo';
import { SummaryScreen } from './SummaryScreen';
import { summaryOutcome, summaryViewOf, type SummaryInput } from './selectors';
import type { SummaryTarget } from './route';
import './summary.css';

/** How much history a record comparison reads. Records are rare; reads are local. */
export const SUMMARY_HISTORY = 20;

const NOT_FOUND = 'Esa sesión ya no está en el dispositivo.';

interface Boot {
  readonly phase: 'loading' | 'ready' | 'missing' | 'failed';
  readonly input: SummaryInput | null;
}

async function readSummary(storage: StoragePort, sessionId: string, now: number): Promise<SummaryInput | null> {
  await storage.open();
  const session = await storage.sessions.byId(sessionId);
  if (session === undefined) return null;
  const history = await storage.sessions.recent(SUMMARY_HISTORY);
  const library = await storage.exercises.all();
  return { session, history, library, now };
}

export interface SummarySheetProps {
  readonly storage: StoragePort;
  readonly clock: Clock;
  readonly sessionId: string;
  readonly topSlot?: React.ReactNode;
}

/** The sheet itself: reads, the `Hecho` write, and the retry of both. */
export function SummarySheet({ storage, clock, sessionId, topSlot }: SummarySheetProps): React.ReactElement {
  const [boot, setBoot] = useState<Boot>({ phase: 'loading', input: null });
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setBoot({ phase: 'loading', input: null });
    readSummary(storage, sessionId, clock.now()).then(
      (input) => {
        if (cancelled) return;
        setBoot(input === null ? { phase: 'missing', input: null } : { phase: 'ready', input });
      },
      () => {
        if (!cancelled) setBoot({ phase: 'failed', input: null });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [storage, clock, sessionId, attempt]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  const done = useCallback(() => {
    if (boot.input === null) {
      window.location.hash = '#/inicio';
      return;
    }
    const session = boot.input.session;
    // Only an open session is written here. A scheduled or terminal one has either
    // nothing to close or a finish that another screen already committed.
    if (session.status !== 'inProgress') {
      window.location.hash = '#/inicio';
      return;
    }

    if (busy) return;
    setBusy(true);
    setError(null);
    storage.sessions
      .finish(session.id, summaryOutcome(session), clock.now())
      .then(
        () => {
          window.location.hash = '#/inicio';
        },
        () => {
          setBusy(false);
          setError('No se pudo cerrar la sesión. Inténtalo otra vez.');
        },
      )
      .finally(() => setBusy(false));
  }, [boot.input, busy, clock, storage]);

  const input = boot.input;
  if (boot.phase !== 'ready' || input === null) {
    return (
      <div className="summary">
        {topSlot}
        {boot.phase === 'loading' ? (
          <p className="ds-meta">Leyendo la sesión…</p>
        ) : (
          <EmptyState
            action={{ label: 'Volver a Inicio', onClick: () => { window.location.hash = '#/inicio'; } }}
          >
            {boot.phase === 'missing' ? NOT_FOUND : 'No se pudo leer la sesión. Inténtalo otra vez.'}
          </EmptyState>
        )}
        {boot.phase === 'failed' ? (
          <button type="button" className="ds-action summary__retry" onClick={retry}>
            Reintentar
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <SummaryScreen
      view={summaryViewOf(input)}
      onDone={done}
      error={error}
      onRetry={done}
      busy={busy}
      {...(topSlot === undefined ? {} : { topSlot })}
    />
  );
}

const DEMO_SCENARIOS: readonly { id: DemoScenario; label: string }[] = [
  { id: 'done', label: 'Completa' },
  { id: 'partial', label: 'Parcial' },
];

/** `#/resumen/demo`: the same sheet, over the fixture week, writing nothing. */
function DemoSummary(): React.ReactElement {
  const [scenario, setScenario] = useState<DemoScenario>('done');
  const { clock: appClock } = useAppServices();
  const now = useMemo(() => demoNow(appClock.now()), [appClock]);
  // Memoised per scenario: a fresh port on every render would restart the read loop.
  const storage = useMemo(() => demoPort(demoWeek(scenario, now)), [scenario, now]);
  const clock = useMemo(() => demoClock(now), [now]);

  // The strip goes inside the sheet, not above it: the sheet covers the viewport, so a
  // bar outside it would be hidden behind it (§8 — the summary is a sheet, not a tab).
  return (
    <SummarySheet
      key={scenario}
      storage={storage}
      clock={clock}
      sessionId="demo-session-1"
      topSlot={
        <DemoBar
          title="DEMO · datos de ejemplo, no se guarda nada"
          scenarios={DEMO_SCENARIOS}
          active={scenario}
          onSelect={setScenario}
        />
      }
    />
  );
}

export interface SummaryEntryProps {
  readonly target: SummaryTarget;
  readonly storage: StoragePort;
  readonly clock: Clock;
}

export function SummaryEntry({ target, storage, clock }: SummaryEntryProps): React.ReactElement {
  if (target.kind === 'demo') return <DemoSummary />;
  return <SummarySheet storage={storage} clock={clock} sessionId={target.sessionId} />;
}
