# Composición corporal: el mapa del Evolt

Una sección nueva que dibuja lo que el escaneo del 13 de noviembre dice y la báscula no: el
reparto de masa magra y grasa por segmentos, el porcentaje de grasa y la puntuación del
informe. No es tendencia: es un mapa de un día, y solo se compara cuando haya dos.

## Specs

- **S1** — "puedes poner una sección de Evolt, con una represetnación estetica de los datos?".
  Una sección propia que representa la composición corporal de forma legible, no una tabla de
  cuarenta números.
- **S2** — "o no vale la pena?" — respuesta del padre y elección del dueño: "Sí, mapa de
  composición corporal". La sección se llama por lo que mide (composición corporal), no por la
  marca de la máquina: el Evolt es la procedencia del dato, y eso se dice una vez, no en el
  título.
- **S3** — Lo que se dibuja: masa magra y masa grasa por segmento (brazo izquierdo y derecho,
  pierna izquierda y derecha, torso), el porcentaje de grasa total, la masa magra total, el
  peso y la puntuación del informe. La grasa visceral se muestra como aviso, porque el informe
  la marca fuera de rango (nivel 10).
- **S4** — Sin gráficas de evolución mientras exista una sola medición: un punto no es una
  línea. Cuando haya dos escaneos, la sección compara; nunca antes.
- **S5** — Sin calorías: el informe trae BMR 1737 kcal y gasto total 2674 kcal, y el producto
  decidió que las calorías no se muestran (`design/system.md`, guardarraíles de datos).
- **S6** — El dato entra una vez y se queda: la medición se guarda con su procedencia
  (`imported` para el informe de la máquina), sobrevive a la copia de seguridad y viaja en la
  sincronización, como el resto del estado del dueño.
- **S7** — La primera medición es la del 13 de noviembre de 2026, guardada en
  `src/Evolt Exam/13-Nov-2026/`: 82,4 kg · masa magra 63,3 kg · grasa 19,1 kg (23,2 %) · masa
  muscular esquelética 35,2 kg · agua 45,6 kg · grasa visceral nivel 10 · cintura-cadera 0,87 ·
  puntuación 7,2. Segmentos magros: brazo izq. 3,57, brazo der. 3,50, pierna izq. 9,14, pierna
  der. 9,36, torso 27,36 kg. Segmentos grasos: 1,12, 1,11, 2,90, 2,88, 11,08 kg.

## Tasks

- **T1** — S6: modelo de la medición de composición corporal — registro persistente con sus
  segmentos, copia de seguridad y sincronización, con pruebas por capa. Route: worker. En curso: no.
- **T2** — S6, S7: entrada del dato sin teclear cuarenta números — leer el texto del informe
  pegado y proponer los valores, con la medición del 13 de noviembre como caso de prueba. Route: worker.
- **T3** — S1-S5: la sección de composición corporal — mapa por segmentos, porcentaje y
  puntuación, aviso de grasa visceral, sin tendencia y sin calorías. Diseño en
  `design/body-composition/` antes de programar. Route: inline (design) + worker.
- **T4** — S1-S6: verificación independiente y documentación. Route: verify.

## Log

- **L1** — "puedes poner una sección de Evolt, con una represetnación estetica de los datos? o
  no vale la pena?"
- **L2** — Decisión del dueño en el cuestionario: "Sí, mapa de composición corporal. Un bloque
  nuevo con el mapa por segmentos, el anillo del 23,2 % y la puntuación 7,2. Sin gráficas de
  tendencia hasta tener dos escaneos. Registro, copia y nube propios."
- **L3** — Orden acordado: la agenda semanal (`odd/tasks/week-calendar.md`) se cierra antes de
  empezar este documento. Los datos del informe están en las dos capturas de
  `src/Evolt Exam/13-Nov-2026/`; ninguna de las dos está en git todavía.
- **L4** — Excluido a propósito: calorías (BMR y gasto total) y cualquier cálculo derivado de
  ellas; el producto decidió no mostrarlas.
