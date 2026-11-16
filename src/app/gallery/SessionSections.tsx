/*
 * The session screen's parts: the set row in its five states, the weight decision,
 * its collapsed summary, our own keypad, and the pager.
 *
 * Every count, duration and weight is a literal from the artboard's renders.
 */

import {
  LoadDecisionBar,
  Pager,
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
        note="SERIE n, el peso de la serie, repeticiones objetivo, esfuerzo opcional, molestia opcional y un único objetivo de confirmación. La cifra es el numeral de la fila (28 px cuando es un resultado, 22 px cuando todavía es un objetivo; tabular en los dos casos): se lee a un brazo de distancia. Los cinco estados se distinguen por la forma y el peso, no solo por el color: pendiente es un anillo vacío con la cifra en tinta secundaria y un paso más pequeña; en curso sube de tono, el índice pasa a acento y las repeticiones se registran en el stepper; confirmada va en tinta plena a 28 px con la marca de éxito rellena; corregida lleva la misma marca dibujada como anillo de acento; saltada tacha su cifra. Dos toques confirman; el esfuerzo y la molestia nunca bloquean."
      >
        <Demo state="pending (con objetivo de confirmación)">
          <SetRow index={1} targetReps={10} weightLabel="92,5 kg" state="pending" onConfirm={noop} />
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
            weightLabel="92,5 kg"
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
            weightLabel="92,5 kg"
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
            weightLabel="92,5 kg"
            effort="fácil"
            onConfirm={noop}
          />
        </Demo>
        <Demo state="skipped">
          <SetRow index={7} targetReps={10} state="skipped" weightLabel="92,5 kg" />
        </Demo>
        <Note>
          Una fila confirmada con peso, esfuerzo, molestia y RÉCORD no cabe en una línea en la
          tarjeta de la sesión (269 px de columna a 390 px): la fila hace `flex-wrap`, así que
          sus chips y su marca bajan a una segunda línea en vez de empujar la tarjeta más allá
          del móvil.
        </Note>
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
        note="La barra después de decidir: el peso una vez — el numeral más grande de la sesión (60 px, tabular) —, dos teclas de 48 px para ajustarlo y la línea del objetivo con «Cambiar»."
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
