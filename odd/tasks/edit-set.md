# Corregir una serie ya registrada

Una serie confirmada deja de estar en piedra: se mantiene pulsada y se corrige en el sitio —
kilos, repeticiones y cómo fue—, sin añadir un botón por fila a la pantalla que más prisa tiene.

## Specs

- **S1** — "he hecho una serie de hombro. y la anterior me había parecido fácil Le he subido el
  peso a la siguiente y me he olvidado de cambiarlo de fácil. Entonces me gustaría que las series
  también, si mantuviera pulsado o algo, se pudiera editar". Una serie confirmada se puede
  corregir después de confirmarla, dentro de la sesión abierta.
- **S2** — "Alguna manera editarlos en callar mil botones": nada de un control nuevo por fila. La
  serie se abre manteniéndola pulsada (500 ms), nunca con un toque normal: en mitad de una serie
  el dedo cae donde no debe y un editor accidental es peor que un dato mal.
- **S3** — Se corrige lo que se registró: kilos, repeticiones, cómo fue (`effort`) y molestia. Es
  la marca de cómo fue la que el motor lee para proponer la carga de la semana siguiente, así que
  corregirla es corregir la próxima sesión, no solo el historial.
- **S4** — Una sola frase discreta bajo las series mientras haya alguna hecha y nada en edición:
  «Mantén una serie para corregirla». Se descubre una vez y no añade un control visible.
- **S5** — Solo en una sesión abierta. Una sesión cerrada o parcial se corrige desde su resumen y
  su histórico, no desde esta pantalla, para que la sesión en curso tenga una sola verdad.
- **S6** — Corregir no reordena ni renumera: la serie conserva su número, su posición y sus demás
  campos. Guardar es un solo `put` de la sesión; cancelar no escribe nada.

## Tasks

- **T1** — Regla pura: dado el registro de la sesión, el índice de la serie y la corrección, la
  sesión resultante — con sus pruebas (conserva el número, no toca otras series, rechaza índices
  fuera de rango y sesiones que no están abiertas). Route: inline.
- **T2** — La fila: pulsación larga en una serie confirmada abre el editor; el editor reutiliza el
  teclado de peso y el contador de repeticiones que ya existen; guardar escribe, cancelar no.
  Route: worker.
- **T3** — La frase de descubrimiento y sus estados (con series hechas, sin ellas, en edición).
  Route: worker.
- **T4** — Verificación, despliegue y cierre. Route: verify.

## Log

- **L1** — "Vale, he hecho una serie de hombro. y la anterior me había parecido fácil Le he subido
  el peso a la siguiente y me he olvidado de cambiarlo de fácil. Entonces me gustaría que las
  series también, si mantuviera pulsado o algo, se pudiera editar. Alguna manera editarlos en
  callar mil botones."
- **L2** — Decisión del padre, sin preguntar porque el pedido ya trae el gesto: pulsación larga de
  500 ms, una única frase de descubrimiento bajo la lista, y el editor reutiliza el teclado y el
  contador existentes en lugar de estrenar controles.
