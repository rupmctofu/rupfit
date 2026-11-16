# Inicio con la semana en la mano: calendario arrastrable

Inicio deja de ofrecer solo el día que toca y muestra la semana entera: los cuatro entrenos
en su día, en verde los hechos, y el dueño los mueve de día y cambia cuál va en cada hueco.
La app sigue deduciendo la semana del partido (liga jueves, copa martes, sin partido); lo que
cambia es que el reparto deja de ser intocable.

## Specs

- **S1** — "me gustaría que cuando tú entres en la Apple, la parte de inicio me salga un
  calendario o de alguna manera puede haber yo los cuatro entrenos de esta semana que estén
  en verde los que ya he hecho". Inicio muestra los siete días de la semana con sus cuatro
  entrenos colocados, y los ya hechos se leen como hechos sin abrir nada.
- **S2** — "No sé si de alguna manera pueda arrastrar un entreno y configurármelo para decidir
  qué entreno voy a hacer esa semana". Arrastrar un entreno a otro día y soltarlo guarda el
  cambio; mientras se arrastra, el día de destino y los días que no aceptan el entreno se
  distinguen.
- **S3** — "poderme modificar el estilo o poderme modificar qué día hacer qué". Se puede
  cambiar qué entreno ocupa un día, no solo en qué día cae.
- **S4** — "Yo lo que quiero es que siga funcionando como ahora, que siga entendiendo que días
  tengo entrenos, pero que yo pueda modificar lo que quiero hacer". La semana se sigue
  deduciendo del partido (liga jueves, copa martes, sin partido): la app sigue sabiendo qué
  días tienen entreno, cuál es el partido y cuáles son descanso. La decisión del dueño manda
  sobre la plantilla; la regla de no cargar piernas el día después del partido avisa, no
  bloquea.
- **S5** — "¿La rutina fija debe sobrevivir a exportar/importar la copia y viajar en la
  sincronización?" — "Sí: copia de seguridad y nube". El reparto que fija el dueño se guarda
  en la copia versionada y en la sincronización, no solo en este dispositivo.
- **S6** — "¿Qué pasa con los días ya entrenados o ya pasados?" — "Solo los hechos
  bloqueados". Un día con entreno cerrado no se mueve; un día pasado sin entreno sí se puede
  reasignar.
- **S7** — El calendario real de AC FRIO no está en el repositorio. La app conoce el
  conmutador manual liga/copa/sin partido (S10 de `odd/tasks/match-aware-week.md`), no la
  lista de jornadas. Mientras no llegue esa lista, cada semana se marca a mano.
- **S8** — "El calendario con arrastre es un cambio visual importante. ¿Cómo prefieres
  revisarlo?" — "Primero el diseño en el lienzo". `design/week-calendar/` se revisa en el
  lienzo antes de escribir código de la app.
- **S9** — "puedes el dia de partido poner un iconito de un balon de futbol?". El día de
  partido lleva un balón dibujado con el set de iconos del sistema (trazo 1.8, 24 × 24),
  nunca un emoji ni un carácter Unicode.
- **S10** — Corrección de producto al implementar: el reparto del dueño es uno solo y manda;
  el día del partido lo pone el calendario de la liga y se lleva su jornada. Si en una
  semana de copa el partido cae sobre un día que tiene entreno, ese entreno queda sin día
  esa semana y la agenda lo muestra para colocarlo con un gesto, en vez de moverlo la app
  por su cuenta.
- **S11** — "quita el sabado y el domingo". La agenda de Inicio enseña de lunes a viernes. Un
  sábado o un domingo vuelve a aparecer solo si ese día tiene un entreno del reparto del dueño:
  la agenda puede ser corta, nunca puede esconder un entreno. La semana derivada sigue teniendo
  los siete días con fecha; lo que se acorta es la lista, no el modelo.

## Tasks

- **T1** — S8, S1-S3: tres direcciones de calendario en `design/week-calendar/`, abiertas en el lienzo. **Hecha** en `7231f5b`. El dueño eligió `02-agenda-semanal.html`; 01 y 03 quedan como alternativas.
- **T2** — S5, S6: `WeekLayout` persistente y viajero — clave `meta` `weekLayout` (sin décima tienda y sin subir `DB_VERSION`), escritura sellada y encolada, tabla `week_layout` en la nube, documento de copia con la colección opcional, migración SQL. **Hecha** en `8529dfb`; 13 pruebas nuevas, 1086 en total, ambos `tsc` limpios. La unidad de trabajo quedó en 678 líneas: es fontanería de una sola pieza y partirla dejaba el árbol sin compilar.
- **T3** — S1, S4, S6, S10: `src/features/week/agenda.ts` puro — siete días con fecha, hecho por día del plan dentro de la semana, aviso de piernas tras el partido, reparto por defecto sacado de las plantillas y la única operación de colocación. **Hecha** en `1372993`; 53 pruebas en `src/features/week`, 1121 en total.
- **T4** — S1-S3, S9: la agenda de siete renglones en Inicio — arrastre por captura de puntero, candado en los días hechos, balón en el partido, hoja «¿qué entrenas este día?», bloque de «sin día esta semana» y guardado del reparto. **Hecha** en `80bc8da`; +12 pruebas, 4 de la hoja vieja retiradas con el mecanismo que cubrían, 1130 en total. La rebanada es grande (≈1.270 líneas nuevas en dos archivos): es un módulo nuevo y una pantalla, y partirla no dejaba un árbol coherente.
- **T5** — S1: empezar la sesión del día elegido desde su renglón. **Hecha** dentro de T4: `Empezar` vive en el renglón de hoy y llama a `start.start(planDayId)`.
- **T6** — S1-S10: verificación independiente, README y `docs/`, y el cierre de la feature. **Hecha**: verificación en `773eda2..80bc8da` con un bloqueante real (la tarjeta del día), corregido en `6edaa31`; README y cierre en `98dc130`.
- **T7** — Composición corporal (Evolt), feature aparte: `odd/tasks/body-composition.md` cuando arranque. El dueño la aprobó después de T1; no entra en este documento más allá de esta línea.
- **T8** — S11: la agenda de lunes a viernes, con el fin de semana apareciendo solo si lleva un entreno. **Hecha** en `bce8129`.

## Log

- **L1** — "Me gustaría cambiar algunas partes de Rockfit, vale, me gustaría que cuando tú
  entres en la Apple, la parte de inicio me salga un calendario o de alguna manera puede
  haber yo los cuatro entrenos de esta semana que estén en verde los que ya he hecho y que
  puede seleccionar cualquier hacer y en qué día. No sé si de alguna manera pueda arrastrar
  un entreno y configurármelo para decidir qué entreno voy a hacer esa semana y poderme
  modificar el estilo o poderme modificar qué día hacer qué."
- **L2** — "Yo lo que quiero es que siga funcionando como ahora, que siga entendiendo que días
  tengo entrenos, pero que yo pueda modificar lo que quiero hacer, pero creo que ya puede
  sacar del calendario, creo que se lo pasé, que semanas entrenar, qué semanas se juega los
  martes y qué semana los juegos. Si no lo tienes, dime lo que te lo paso. De todos modos
  está en la web de Ace Frío o en la carpeta de hace frío que tienes también la raíz ahí está
  qué día se juega los martes y qué día se día se juega los juegos. Qué semana se juega a los
  juegos, perdón"
- **L3** — Decisiones del cuestionario: interacción "Arrastrar y soltar"; alcance "Cambiar la
  rutina fija"; estilo "Cambiar qué entreno va ese día"; días hechos "Solo los hechos
  bloqueados"; persistencia "Sí: copia de seguridad y nube"; revisión "Primero el diseño en el
  lienzo".
- **L4** — Respuesta al calendario: el repositorio no contiene las jornadas de AC FRIO; se
  pidió al dueño que las pase (foto, captura o lista `jornada · fecha · martes/jueves`).
- **L6** — `odd/tasks/week-calendar.md` T1 cerrada: el dueño elige la dirección 02, `design/
  week-calendar/02-agenda-semanal.html` (agenda de siete renglones); 01 y 03 quedan como
  alternativas. Handoff abierto en `in_progress` sobre ese artboard. Se implementa la agenda
  en Inicio con el sistema de diseño real, no el HTML del artboard.
- **L7** — "puedes el dia de partido poner un iconito de un balon de futbol?". Hecho: icono
  `ball` añadido a `src/design-system/components/Icon.tsx` y a la galería de `#/galeria`;
  tipar `Record<IconName, IconShape>` obligó a dibujarlo, y `tsc --noEmit` y las 1073 pruebas
  siguen en verde. En la agenda lo usa el renglón del partido.
- **L8** — "puedes poner una sección de Evolt, con una represetnación estetica de los datos? o
  no vale la pena?". Respuesta: vale la pena como mapa de composición corporal (segmentos,
  grasa, magra, puntuación 7,2 y aviso de grasa visceral), no como gráficas de tendencia hasta
  tener dos escaneos. El dueño eligió el mapa y una sección propia; se implementa después de la
  agenda, en su propio documento, porque es otro entregable.
- **L9** — T2 y T3 abiertas en paralelo, en superficies disjuntas y con el contrato de
  `agenda.ts` fijado en el encargo: el modelo de persistencia no necesita saber nada de la
  vista, y la derivación pura recibe el reparto como parámetro, de modo que ningún trabajador
  espera al otro. La UI (T4) va después porque importa ese contrato.
- **L10** — T2 cerrada y commiteada en `feat/week-calendar`: `7231f5b` (documentos y
  artboards), `588a5d5` (icono `ball`), `8529dfb` (persistencia). El árbol queda sucio solo
  por `.gitignore`, que ya estaba modificado antes de esta sesión y no es de este trabajo. T3
  se relanzó sobre las declaraciones ya presentes; el primer intento se detuvo sin escribir
  nada porque la dependencia aún no había llegado, y se detuvo bien.
- **L11** — Pregunta del dueño sobre por qué hay cuenta si «se borra todo»: la cuenta existe
  desde el ADR-0002 justamente para que borrar el icono no sea una pérdida. De paso salió
  que el README abría con «no account and no server», falso desde ese ADR, y que la misma
  afirmación seguía en `docs/design-system.md` §2.5 y en `docs/product-requirements.md`
  FR-16.1/16.2 (un MUST que el código de sincronización incumple). Corregidas las tres como
  enmienda del ADR-0002, sin reescribir el requisito: la copia exportada deja de ser «la
  única» en cuanto hay cuenta. Pedido por el dueño: «si, corrige».
- **L12** — T3 y T4 cerradas y empujadas. `1372993` la derivación, `80bc8da` la agenda en Inicio.
  Riesgos declarados por el trabajador de la UI y aceptados como pendientes, no como resueltos:
  conviven dos derivaciones de «hoy» (la agenda por reparto, la tarjeta del día por plantilla y
  `WeekRecord`), así que tras un arrastre pueden discrepar durante un renderizado; `HomeView.week`
  y `TodayView.swap` quedan calculados y sin dibujar, a la espera de una limpieza; y `Empezar`
  sobre un día que ya tiene sesión programada de otro entreno crea una segunda sesión, porque
  `planStart` solo reabre el mismo `planDayId`. Verificación independiente en curso antes de dar
  la feature por cerrada.
- **L13** — Veredicto del verificador independiente sobre `773eda2..80bc8da`: S1, S2/S3, S5, S6,
  S4/S10 (parte del fixture) y accesibilidad **probadas**; **rota** la parte de S4 que dice que
  la decisión del dueño manda, porque la tarjeta del día sigue calculando «hoy» con la plantilla
  y el `WeekRecord`. Reproducido: el renglón del miércoles dice `Descanso` y la tarjeta de abajo
  ofrece `Movilidad y core` con el único botón violeta, que arranca ese entreno hoy. L12 lo
  llamó «un renderizado»: era falso, persiste tras releer. Se abre ronda de corrección con tres
  pruebas durables del verificador (dos de la tarjeta, una del extremo de S6 que nadie cubría),
  retirada de los modelos de vista muertos y dos huecos de accesibilidad: el foco no vuelve al
  renglón al cerrar la hoja y el fondo no queda inerte. También se restaura un literal en
  `src/cloud/sync.test.ts`, donde contar con `SYNC_TABLES.length` dejaba pasar la desaparición
  de una tabla. Aviso que el verificador dejó y no se toca aquí: restaurar una copia vieja borra
  el reparto, porque `restore` limpia todos los almacenes — está probado y documentado.
- **L14** — "quita el sabado y el domingo". Se lee como S11: la agenda enseña de lunes a viernes y el fin de semana solo asoma si ese día tiene entreno tuyo o una sesión cerrada esa semana, para que acortar la lista no pueda esconder nada. Se hace después de la ronda de corrección de T6: toca los mismos archivos y dos escritores no pueden pisarse.
- **L15** — "quita el sabado y el domingo", hecho en `bce8129`: la lista acaba en viernes y un fin de semana vuelve solo si lleva un entreno del dueño. S11 se reescribió para decir exactamente eso: la cláusula de «sesión cerrada esa semana» que yo había añadido no se implementó, porque la agenda razona por día del plan y no por fecha de sesión, y dejarla escrita habría sido una promesa falsa en la especificación. La prueba de siete renglones se partió en dos (la lista acaba en viernes; un sábado con entreno vuelve) en vez de borrarse. Ronda de corrección de T6 cerrada en `6edaa31`: una sola respuesta a «qué toca hoy», modelos de vista muertos retirados, foco devuelto al renglón al cerrar la hoja, fondo inerte y el recuento de tablas de la nube como literal. 1131 pruebas, ambos `tsc` limpios.
