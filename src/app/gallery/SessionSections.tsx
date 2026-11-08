/*
 * The session screen's parts: the set row in its five states, the weight decision,
 * its collapsed summary, our own keypad, the rest bar and the pager.
 *
 * Every count, duration and weight is a literal from the artboard's renders. The
 * rest bar receives its labels from the caller by design (§6.4): it never reads the
 * clock, so here it simply receives fixed ones.
 */

import {
  LoadDecisionBar,
  Pager,
  RestTimerBar,
  SetRow,
  WeightKeypad,
  WeightSummary,
} from '../../design-system';
import { Demo, Note, Section, noop } from './parts';

export function SessionSections(): React.ReactElement {
  return (
    <>
      <Section
        name="SetRow"
        note="SERIE n, repeticiones objetivo, esfuerzo opcional, molestia opcional y un único objetivo de confirmación. Dos toques confirman; el esfuerzo y la molestia nunca bloquean. Una serie sin responder se ve sin responder, no con un valor por defecto."
      >
        <Demo state="pending (con objetivo de confirmación)">
          <SetRow index={1} targetReps={10} state="pending" onConfirm={noop} />
        </Demo>
        <Demo state="pending sin acción (degradado a lectura)">
          <SetRow index={1} targetReps={10} state="pending" />
        </Demo>
        <Demo state="active (stepper + Confirmar + chips de esfuerzo)">
          <SetRow
            index={2}
            targetReps={10}
            state="active"
            reps={8}
            onRepsChange={noop}
            onConfirm={noop}
            onEffortChange={noop}
            onShowDiscomfort={noop}
          />
        </Demo>
        <Demo state="active con esfuerzo elegido y molestia abierta">
          <SetRow
            index={2}
            targetReps={10}
            state="active"
            reps={9}
            effort="correcto"
            discomfort="molestia"
            showDiscomfort
            onRepsChange={noop}
            onConfirm={noop}
            onEffortChange={noop}
            onDiscomfortChange={noop}
          />
        </Demo>
        <Demo
          state="confirmed con esfuerzo y molestia"
          note="La forma completa de la fila confirmada: «10 / 10», el chip de esfuerzo con su punto y la marca de verificación."
        >
          <SetRow
            index={3}
            targetReps={10}
            state="confirmed"
            reps={10}
            effort="duro"
            discomfort="molestia"
            onConfirm={noop}
            onEffortChange={noop}
            onDiscomfortChange={noop}
          />
        </Demo>
        <Demo state="confirmed con récord">
          <SetRow
            index={4}
            targetReps={10}
            state="confirmed"
            reps={10}
            effort="duro"
            record
            onConfirm={noop}
            onEffortChange={noop}
          />
        </Demo>
        <Demo state="confirmed sin esfuerzo">
          <SetRow index={5} targetReps={10} state="confirmed" reps={10} onConfirm={noop} />
        </Demo>
        <Demo state="corrected">
          <SetRow
            index={6}
            targetReps={10}
            state="corrected"
            reps={8}
            effort="fácil"
            onConfirm={noop}
          />
        </Demo>
        <Demo state="skipped">
          <SetRow index={7} targetReps={10} state="skipped" />
        </Demo>
      </Section>

      <Section
        name="LoadDecisionBar"
        note="Tres acciones iguales; las dos primeras son un solo toque. «Otro peso» abre nuestro teclado, no el del sistema (§7.4)."
      >
        <Demo state="Con peso anterior">
          <LoadDecisionBar
            suggested="92,5"
            previous="90"
            onAccept={noop}
            onRepeat={noop}
            onOther={noop}
          />
        </Demo>
        <Demo state="Primera vez (sin peso anterior)">
          <LoadDecisionBar suggested="80" onAccept={noop} onOther={noop} />
        </Demo>
        <Demo state="Solo dos acciones (sin «Otro peso»)">
          <LoadDecisionBar suggested="92,5" previous="90" onAccept={noop} onRepeat={noop} />
        </Demo>
        <Demo state="Deshabilitada">
          <LoadDecisionBar suggested="92,5" previous="90" disabled onAccept={noop} onRepeat={noop} onOther={noop} />
        </Demo>
      </Section>

      <Section
        name="WeightSummary"
        note="La barra después de decidir: el peso una vez, dos teclas de 48 px para ajustarlo y la línea del objetivo con «Cambiar»."
      >
        <Demo state="Con objetivo y edición">
          <WeightSummary
            weight="92,5"
            targetLine="Objetivo · 3 × 10 a 3–4 RIR · descanso 180 s"
            onDecrement={noop}
            onIncrement={noop}
            onEdit={noop}
          />
        </Demo>
        <Demo state="Sin edición (las teclas quedan deshabilitadas)">
          <WeightSummary
            weight="90"
            targetLine="Objetivo · 3 × 10 a 3–4 RIR · descanso 180 s"
            onDecrement={undefined}
            onIncrement={undefined}
            onEdit={undefined}
          />
        </Demo>
      </Section>

      <Section
        name="WeightKeypad"
        note="Rejilla propia de 4 × 3 con teclas de 48 px, coma decimal, borrado y «Listo». Sin input de texto: sin teclado del sistema, sin cursor, sin dictado encima de la sesión."
      >
        <Demo state="Vacío">
          <WeightKeypad
            value=""
            label="Peso en kilogramos"
            onChange={noop}
            onSubmit={noop}
          />
        </Demo>
        <Demo state="Con valor">
          <WeightKeypad
            value="92,5"
            label="Peso en kilogramos"
            hint="Escribe con el teclado del Mac o toca las teclas. La coma separa los decimales."
            onChange={noop}
            onSubmit={noop}
          />
        </Demo>
        <Demo state="Deshabilitado">
          <WeightKeypad value="92,5" label="Peso en kilogramos" disabled onChange={noop} onSubmit={noop} />
        </Demo>
        <Note>
          Esta página no guarda estado, así que el teclado no puede demostrar la escritura en
          vivo: `value` es una prop y cada tecla llama a un `onChange` que aquí no hace nada.
        </Note>
      </Section>

      <Section
        name="RestTimerBar"
        note="60 px de contenido más el área segura, tiempo en cifras tabulares, «+15 s», «Saltar» y una línea de progreso de 2 px. El componente no lleva temporizador: recibe las etiquetas ya calculadas desde confirmedAt (§6.4)."
      >
        <Demo state="running (a mitad del descanso)">
          <RestTimerBar
            state="running"
            remainingLabel="1:45"
            progress={0.38}
            accessibleLabel="Descanso, quedan 1 minuto 45 segundos"
            onExtend={noop}
            onSkip={noop}
          />
        </Demo>
        <Demo state="overrun (terminado con «hace 1:12»)">
          <RestTimerBar
            state="finished"
            remainingLabel="0:00"
            progress={1}
            overrunLabel="hace 1:12"
            accessibleLabel="Descanso terminado, hace 1 minuto 12 segundos"
            onExtend={noop}
            onSkip={noop}
            onDismiss={noop}
          />
        </Demo>
        <Demo state="finished sin etiqueta de exceso">
          <RestTimerBar
            state="finished"
            remainingLabel="0:00"
            progress={1}
            accessibleLabel="Descanso terminado"
            onDismiss={noop}
          />
        </Demo>
      </Section>

      <Section
        name="Pager"
        note="Dos chevrones de 48 px con nombre, una línea de progreso y «2 / 6»; el grupo se anuncia como «Ejercicio 2 de 6». Deslizar es un atajo, nunca la única forma de cambiar de ejercicio."
      >
        <Demo state="Posición intermedia">
          <Pager position={2} total={6} onPrevious={noop} onNext={noop} />
        </Demo>
        <Demo state="Primero (chevron anterior deshabilitado)">
          <Pager position={1} total={6} onPrevious={noop} onNext={noop} />
        </Demo>
        <Demo state="Último (chevron siguiente deshabilitado)">
          <Pager position={6} total={6} onPrevious={noop} onNext={noop} />
        </Demo>
      </Section>
    </>
  );
}
