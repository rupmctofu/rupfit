/*
 * `?demo=inicio#/inicio`: Inicio over the fixture week, for review on the phone.
 *
 * One tap per state of the design's Inicio row — the week with history, an empty store,
 * the day already trained, and a rest day — and nothing it shows is ever stored: the port
 * is in memory and the clock is the fixture instant.
 */

import { useCallback, useMemo, useState } from 'react';
import { useAppServices } from '../../app/providers';
import { DemoBar, demoClock, demoNow, demoPort, demoRestNow, demoWeek, type DemoScenario } from './demo';
import { HomeScreenWithPort, NO_EVIDENCE } from './HomeScreen';
import './demo.css';

const SCENARIOS: readonly { readonly id: DemoScenario; readonly label: string }[] = [
  { id: 'week', label: 'Con datos' },
  { id: 'first', label: 'Sin historial' },
  { id: 'done', label: 'Ya hecha' },
  { id: 'rest', label: 'Descanso' },
  { id: 'evicted', label: 'Datos perdidos' },
];

/** The marker the real app cannot read yet (§7.8): two weeks ago, one export made. */
const DAY_MS = 24 * 60 * 60 * 1000;

export function DemoHome(): React.ReactElement {
  const [scenario, setScenario] = useState<DemoScenario>('week');
  // The anchor instant comes from the provider too: a demo chooses *which* week to
  // draw, then freezes the clock at it, so nothing on the screen drifts while reviewed.
  const { clock: appClock } = useAppServices();
  const now = useMemo(
    () => (scenario === 'rest' ? demoRestNow(appClock.now()) : demoNow(appClock.now())),
    [appClock, scenario],
  );
  // Memoised: a fresh port on every render would restart the screen's read loop.
  const storage = useMemo(() => demoPort(demoWeek(scenario, now)), [scenario, now]);
  const clock = useMemo(() => demoClock(now), [now]);
  // Memoised as well: the read effect depends on this identity, not on its contents.
  const evidence = useMemo(
    () => (scenario === 'evicted' ? { lostData: true, lastExportAt: now - 14 * DAY_MS } : NO_EVIDENCE),
    [scenario, now],
  );

  // A fixture session id does not exist in the real store, so the summary of the demo
  // opens the demo summary instead of walking into an honest "no longer there".
  const navigate = useCallback((href: string) => {
    window.location.hash = href.startsWith('#/resumen/') ? '#/resumen/demo' : href;
  }, []);

  return (
    <>
      <DemoBar
        title="DEMO · datos de ejemplo, no se guarda nada"
        scenarios={SCENARIOS}
        active={scenario}
        onSelect={setScenario}
      />
      <HomeScreenWithPort
        key={scenario}
        storage={storage}
        clock={clock}
        evidence={evidence}
        onNavigate={navigate}
      />
    </>
  );
}
