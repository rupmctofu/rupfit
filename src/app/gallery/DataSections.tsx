/*
 * The data blocks of the artboard: one metric, the strip of Resumen, the
 * última-vez / peso-de-hoy pair and the stepper that replaces a number input.
 */

import {
  CompareTile,
  DataStrip,
  MetricTile,
  Sparkline,
  Stepper,
} from '../../design-system';
import { Demo, Pair, Section, noop } from './parts';

const WEEKLY_VOLUME = [6900, 7100, 7050, 7480, 7900, 7800, 8240, 8560, 8700, 8900, 9010, 9120];

export function DataSections(): React.ReactElement {
  return (
    <>
      <Section
        name="MetricTile"
        note="Una métrica por bloque: etiqueta, valor con unidad, un delta que es una palabra con su signo y una sola línea de procedencia."
      >
        <Demo state="Con delta y caption">
          <MetricTile
            label="Volumen semanal"
            value="9.120"
            unit="kg"
            delta="+7,5 kg"
            caption="Últimas 12 semanas"
          />
        </Demo>
        <Demo state="Delta en tono danger">
          <MetricTile
            label="Peso corporal"
            value="78,4"
            unit="kg"
            delta="−1,2 kg"
            deltaTone="danger"
            caption="Media de 7 días"
          />
        </Demo>
        <Demo state="Con sparkline en el hueco">
          <MetricTile
            label="Volumen semanal"
            value="9.120"
            unit="kg"
            delta="+7,5 kg"
            caption="Últimas 12 semanas"
            aside={<Sparkline values={WEEKLY_VOLUME} />}
          />
        </Demo>
        <Demo state="size=metric (numeral de 44 px)">
          <MetricTile
            label="Peso de hoy"
            value="92,5"
            unit="kg"
            size="metric"
            caption="Decidido a las 18:04"
          />
        </Demo>
      </Section>

      <Section
        name="DataStrip"
        note="La fila de dos o tres celdas del Resumen, con separadores de un píxel y un solo nombre de grupo."
      >
        <Demo state="Tres celdas">
          <DataStrip
            label="Totales de la sesión"
            items={[
              { label: 'Duración', value: '55', unit: 'min' },
              { label: 'Series', value: '18/18' },
              { label: 'Volumen', value: '9.120', unit: 'kg', tone: 'accent' },
            ]}
          />
        </Demo>
        <Demo state="Dos celdas">
          <DataStrip
            label="Resumen parcial"
            items={[
              { label: 'Series', value: '14', unit: 'de 18' },
              { label: 'Récords', value: '2', tone: 'muted' },
            ]}
          />
        </Demo>
      </Section>

      <Section
        name="CompareTile"
        note="Última vez frente a peso de hoy. La variante «today» es la única superficie accent-muted del sistema."
      >
        <Demo state="Las dos variantes juntas">
          <Pair>
            <CompareTile label="Última vez" value="90" unit="kg" caption="hace 7 días" />
            <CompareTile label="Peso de hoy" value="92,5" unit="kg" caption="Aceptado" today />
          </Pair>
        </Demo>
        <Demo state="Solo la variante por defecto">
          <CompareTile label="Última vez" value="90" unit="kg" caption="hace 7 días" />
        </Demo>
      </Section>

      <Section
        name="Stepper"
        note="Las repeticiones se incrementan, nunca se escriben: no hay input numérico, ni teclado del sistema, ni cursor encima de la sesión."
      >
        <Demo state="shape=square (fila de serie)">
          <Stepper label="Repeticiones" value={8} min={0} max={99} unit="reps" onChange={noop} />
        </Demo>
        <Demo state="shape=round (peso)">
          <Stepper
            label="Peso de hoy"
            value={90}
            min={0}
            max={400}
            step={2.5}
            unit="kg"
            shape="round"
            incrementLabel="Subir 2,5 kg"
            decrementLabel="Bajar 2,5 kg"
            onChange={noop}
          />
        </Demo>
        <Demo state="Deshabilitado">
          <Stepper label="Repeticiones" value={10} unit="reps" disabled onChange={noop} />
        </Demo>
        <Demo state="En el tope inferior (la tecla de menos se deshabilita sola)">
          <Stepper label="Repeticiones" value={0} min={0} max={99} unit="reps" onChange={noop} />
        </Demo>
      </Section>
    </>
  );
}
