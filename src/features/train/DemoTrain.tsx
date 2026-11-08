/*
 * `?demo=entrenar#/entrenar`: Entrenar over the fixture week, for review on the phone.
 *
 * Three states of the design's Entrenar row in one tap: the week with a session today,
 * the rest day with nothing scheduled, and a device with no routine at all. Nothing is
 * stored: the port is in memory, and opening the routine sheet changes nothing.
 */

import { useCallback, useMemo, useState } from 'react';
import { useAppServices } from '../../app/providers';
import { DemoBar, demoClock, demoNow, demoPort, demoRestNow, demoWeek, type DemoScenario } from '../home/demo';
import { TrainScreenWithPort } from './TrainScreen';
import '../home/demo.css';

const SCENARIOS: readonly { readonly id: DemoScenario; readonly label: string }[] = [
  { id: 'week', label: 'Con datos' },
  { id: 'rest', label: 'Descanso' },
  { id: 'first', label: 'Sin rutina' },
];

export function DemoTrain(): React.ReactElement {
  const [scenario, setScenario] = useState<DemoScenario>('week');
  const { clock: appClock } = useAppServices();
  const now = useMemo(
    () => (scenario === 'rest' ? demoRestNow(appClock.now()) : demoNow(appClock.now())),
    [appClock, scenario],
  );
  const storage = useMemo(() => demoPort(demoWeek(scenario, now)), [scenario, now]);
  const clock = useMemo(() => demoClock(now), [now]);
  // A fixture session is not in the real store: its summary is the fixture one, and a
  // start lands on the fixture sheet for the same reason.
  const openSummary = useCallback(() => {
    window.location.hash = '#/resumen/demo';
  }, []);
  const navigate = useCallback((href: string) => {
    window.location.hash = href.startsWith('#/sesion') ? '#/sesion/demo' : href;
  }, []);

  return (
    <>
      <DemoBar
        title="DEMO · datos de ejemplo, no se guarda nada"
        scenarios={SCENARIOS}
        active={scenario}
        onSelect={setScenario}
      />
      <TrainScreenWithPort
        key={scenario}
        storage={storage}
        clock={clock}
        onOpenSession={openSummary}
        onNavigate={navigate}
      />
    </>
  );
}
