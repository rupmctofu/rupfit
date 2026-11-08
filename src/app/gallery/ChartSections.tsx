/*
 * The hand-written SVG charts of §7.7, each one inside the card a screen puts it in,
 * with its ChartFrame: metric, window, direct last-point label, legend, a caption
 * sentence and the visually hidden data table that VoiceOver reads instead of the SVG.
 *
 * Charts are static images of data: nothing here animates on entry.
 */

import { BarChart, Card, ChartFrame, LineChart, Sparkline } from '../../design-system';
import { Demo, Note, Section } from './parts';

/** The measured e1RM of the artboard's `progreso-12w`, in kg. */
const E1RM = [87.5, 88, 90, 89, 92, 93, 95, 94, 97, 98, 99, 100];
const ESTIMATE = [86, 88.5, 91, 90.5, 93, 94, 96, 95.5, 97.5, 98, 98.5, 97];
const X_LABELS = ['sep', 'oct', 'nov'] as const;

const WEEKLY_VOLUME = [6900, 7100, 7050, 7480, 7900, 7800, 8240, 8560, 8700, 8900, 9010, 9120];
const WEEK_LABELS = [
  'sem 1',
  'sem 2',
  'sem 3',
  'sem 4',
  'sem 5',
  'sem 6',
  'sem 7',
  'sem 8',
  'sem 9',
  'sem 10',
  'sem 11',
  'sem 12',
] as const;

const LAST_SIX = [8240, 8560, 8700, 8900, 9010, 9120];

export function ChartSections(): React.ReactElement {
  return (
    <>
      <Section
        name="ChartFrame + LineChart"
        note="Una sola serie, sin relleno degradado y sin más rejilla que el eje. La etiqueta directa marca el último punto y el eje se adelgaza a tres etiquetas."
      >
        <Demo state="Solo línea">
          <Card>
            <ChartFrame
              metric="Sentadilla · fuerza"
              window="últimas 12 sem"
              summary="e1RM de 87,5 a 100 kg en 12 semanas."
              columns={['e1RM (kg)']}
              rows={[
                { label: 'sep', values: ['87,5'] },
                { label: 'oct', values: ['92'] },
                { label: 'nov', values: ['100'] },
              ]}
              legend={[{ label: 'e1RM', series: 1 }]}
              note="e1RM con fórmula v1. No es una prueba de 1RM."
            >
              <LineChart values={E1RM} xLabels={X_LABELS} lastLabel="100 kg" />
            </ChartFrame>
          </Card>
        </Demo>
        <Demo state="Línea con comparación discontinua">
          <Card>
            <ChartFrame
              metric="Sentadilla · fuerza"
              window="últimas 12 sem"
              summary="e1RM de 87,5 a 100 kg; la estimación acompaña la serie realizada."
              columns={['e1RM (kg)', 'estimación (kg)']}
              rows={[
                { label: 'sep', values: ['87,5', '86'] },
                { label: 'oct', values: ['92', '93'] },
                { label: 'nov', values: ['100', '97'] },
              ]}
              legend={[
                { label: 'e1RM', series: 1 },
                { label: 'estimación', series: 3, dashed: true },
              ]}
              note="La serie discontinua es una estimación: se dibuja distinta y se nombra en la leyenda."
            >
              <LineChart values={E1RM} comparison={ESTIMATE} xLabels={X_LABELS} lastLabel="100 kg" />
            </ChartFrame>
          </Card>
        </Demo>
        <Demo
          state="Serie con hueco (mediciones sin tendencia)"
          note="El hueco entre el 30 oct y el 6 nov no se une con una línea: unir dos mediciones separadas inventaría una tendencia."
        >
          <Card>
            <ChartFrame
              metric="Peso corporal"
              window="últimos 7 días"
              summary="Tres mediciones: 78,9 → 78,4 kg, con días sin medición entre ellas."
              columns={['peso (kg)']}
              rows={[
                { label: '30 oct', values: ['78,9'] },
                { label: '1 nov', values: ['78,6'] },
                { label: '6 nov', values: ['78,4'] },
              ]}
              legend={[{ label: 'medición', series: 2 }]}
            >
              <LineChart
                values={[78.9, 78.6, 78.4]}
                xLabels={['30 oct', '1 nov', '6 nov']}
                lastLabel="78,4"
                dotSeries={2}
                showLine={false}
              />
            </ChartFrame>
          </Card>
        </Demo>
        <Note>
          LineChart no tiene representación de hueco: la prop `values` es una lista de números,
          sin `null`, y un `NaN` rompería `extent()`. La única forma honesta de un hueco hoy es
          medir sin línea (con `showLine` en falso), que es lo que muestra esta demo. No se ha
          cambiado el componente.
        </Note>
      </Section>

      <Section
        name="ChartFrame + BarChart"
        note="Barras semanales con la última resaltada y su valor etiquetado: la barra de la derecha responde a «cómo voy ahora»."
      >
        <Demo state="Doce semanas, última resaltada">
          <Card>
            <ChartFrame
              metric="Volumen semanal"
              window="últimas 12 sem"
              summary="De 6.900 a 9.120 kg de volumen semanal."
              columns={['volumen (kg)']}
              rows={WEEK_LABELS.map((label, index) => ({
                label,
                values: [(WEEKLY_VOLUME[index] ?? 0).toLocaleString('es-ES')],
              }))}
            >
              <BarChart
                values={WEEKLY_VOLUME}
                lastLabel="9.120 kg"
                startLabel="hace 12 sem"
                endLabel="esta sem"
              />
            </ChartFrame>
          </Card>
        </Demo>
        <Demo state="Sin resaltado (seis sesiones)">
          <Card>
            <ChartFrame
              metric="Peso muerto · serie top"
              window="últimas 6 sesiones"
              summary="De 87,5 a 92,5 kg en las seis últimas sesiones."
              columns={['serie top (kg)']}
              rows={[
                { label: 'sesión 1', values: ['87,5'] },
                { label: 'sesión 2', values: ['87,5'] },
                { label: 'sesión 3', values: ['90'] },
                { label: 'sesión 4', values: ['90'] },
                { label: 'sesión 5', values: ['90'] },
                { label: 'sesión 6', values: ['92,5'] },
              ]}
            >
              <BarChart values={LAST_SIX} highlightLast={false} startLabel="87,5" endLabel="hoy" />
            </ChartFrame>
          </Card>
        </Demo>
      </Section>

      <Section
        name="Sparkline"
        note="La tendencia de 110 × 44 que va en el hueco de un MetricTile. Es decoración: aria-hidden, porque el número del tile ya dice el dato."
      >
        <Demo state="Con tendencia">
          <Sparkline values={WEEKLY_VOLUME} />
        </Demo>
        <Demo state="Un solo punto">
          <Sparkline values={[78.4]} />
        </Demo>
        <Demo state="Tendencia a la baja">
          <Sparkline values={[78.9, 78.8, 78.6, 78.5, 78.4]} />
        </Demo>
      </Section>
    </>
  );
}
