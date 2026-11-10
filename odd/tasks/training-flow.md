# Rupfit — flujo de entrenamiento: botón central, sesión visual, sin descansos

Cerrar la parte funcional del rediseño: un acceso central real al entreno, una pantalla de sesión que se lee de un vistazo, imágenes por ejercicio, sustitución dentro de la sesión y la retirada de los temporizadores obligatorios.
No se reconstruye la app: se conectan las piezas existentes (rutas, `planStart`, `SessionScreen`, biblioteca).

## Specs

**S1 — Botón central «Tu Entreno» (verbatim):**
«En el navbar inferior debe existir un botón central, claramente diferenciado, llamado **«Tu Entreno»**. Al pulsarlo: debe abrir directamente la pantalla de entrenamiento. Si existe una sesión en curso, debe recuperarla y mostrar el ejercicio que toca. Si todavía no hay una sesión iniciada, debe mostrar la sesión que corresponde según la planificación y permitir empezarla. No debe perder el progreso de una sesión ya iniciada. Debe funcionar desde cualquier pantalla principal.»
«No crees una navegación paralela.»

**S2 — Sesión visual (verbatim):**
«Un indicador circular de progreso. El círculo debe estar dividido en segmentos, uno por ejercicio de la sesión. Los segmentos deben reflejar cuáles están completados, cuál es el actual y cuáles quedan pendientes. En el centro del círculo debe aparecer una imagen o ilustración del ejercicio actual. Debajo o junto a esa visualización debe aparecer el nombre concreto del ejercicio. Debe mostrarse claramente el peso, las series y las repeticiones prescritas. Debe poder registrarse el trabajo realizado de forma rápida y cómoda.»

**S3 — Imágenes por ejercicio (verbatim):**
«Cada ejercicio debe contar con una imagen o ilustración que permita identificarlo visualmente. No utilices imágenes genéricas que puedan representar ejercicios distintos. La imagen debe corresponder a la variante concreta del ejercicio.» Reutilizable desde la biblioteca.

**S4 — Sugerir otro ejercicio (verbatim):**
«En la pantalla del ejercicio debe existir una opción para solicitar una alternativa cuando una máquina o material esté ocupado.» Mismos músculos o función biomecánica equivalente, con el material disponible. «La sustitución debe afectar a esa sesión, no modificar permanentemente la planificación sin autorización del usuario.» «El usuario debe poder seleccionar la alternativa sin perder el registro histórico del ejercicio original.»

**S5 — Fuera temporizadores (verbatim):**
«No debe haber descansos obligatorios entre series. No debe bloquearse la sesión por un temporizador. No debe ser necesario pulsar un botón para que el entrenamiento pueda continuar. El registro de series debe ser independiente del tiempo de descanso.»

**S6 — Integridad (verbatim):**
«No perder sesiones anteriores.» «No cambiar identificadores de ejercicios sin una migración controlada.» «Mantener la compatibilidad con IndexedDB y el funcionamiento offline.» «Las alternativas de ejercicios no deben mezclar accidentalmente los historiales de dos ejercicios distintos.»

**S7 — Identidad visual (verbatim):**
«Modo oscuro. Fondo carbón o negro. Superficies en grises oscuros. […] Estética deportiva, minimalista y premium.» El acento es el lila acordado en la conversación posterior (decisión del propietario, 2026-11-09: mantiene el lila y no vuelve al lima).

**S8 — Verificación real (verbatim):**
«No des por terminado ningún requisito porque exista visualmente: debe funcionar.» Comprobar el botón central, iniciar y recuperar sesión, persistencia de historial, sustitución sin pérdida y que el fútbol no altera la rotación.

## Tasks

- T1 — Botón central «Tu Entreno» en el navbar: única acción de acento del shell, recupera sesión en curso o inicia la que toca, mismo estado y rutas que Inicio. Specs S1, S8. Ruta: worker (`src/app/`). Commit: sí.
- T2 — Retirar los temporizadores de descanso de la sesión y su interruptor de Perfil, sin tocar el registro de series. Specs S5, S6. Ruta: worker (`src/features/session/`, `src/features/profile/`). Commit: sí.
- T3 — Sesión visual: anillo segmentado por ejercicio, ilustración del ejercicio actual, nombre, peso, series y repeticiones, registro rápido. Specs S2, S3. Ruta: worker (`src/features/session/`) + ilustraciones inline. Commit: sí.
- T4 — Imagen por ejercicio en la biblioteca (campo opcional aditivo) y su uso en el anillo y el detalle. Specs S3, S6. Ruta: inline (dominio/almacenamiento) + worker (UI). Commit: sí.
- T5 — «Sugerir otro ejercicio» dentro de la sesión: propone alternativas compatibles, sustituye solo esa sesión y conserva el historial de cada ejercicio. Specs S4, S6. Ruta: worker (`src/features/session/`, `src/features/progress/`). Commit: sí.
- T6 — Verificación funcional y de datos: botón central, iniciar/recuperar, persistencia, sustitución, fútbol y rotación; tests, typecheck, build y capturas. Specs S8. Ruta: inline + verifier. Commit: sí.

## Log

**L1 — Petición original del usuario (verbatim, extracto):**
```
Quiero que revises la aplicación actual y completes los cambios estructurales y funcionales que hemos definido. No quiero que te limites a retocar elementos visuales: necesito que la navegación, la experiencia de entrenamiento, la programación de ejercicios y la lógica de las sesiones funcionen correctamente.
```

**L2 — Contradicción de acento resuelta por el propietario.** El documento pide verde lima; la conversación inmediatamente anterior pidió fondo oscuro con lilas y ya está aplicado. Decisión: **se mantiene el lila**; no se revierten los tokens.

**L3 — Lo ya implementado se conserva.** Semana de tres días, fútbol como actividad, prescripción por perfiles, readaptación y biblioteca con alternativas se dieron por hechas en `odd/tasks/training-program.md` y no se rehacen.

**L4 — Arte trazado en evaluación (2026-11-10).** El propietario aporta dos SVG trazados para juzgar el arte de ejercicios en la app:

```
te he dejado svg's para provar si te va mejor así
```

Medido antes de tocar nada: `squat.svg` 479 KB, 455 `path` rellenos, 99 rellenos distintos; `deathliftr.svg` 724 KB con gradiente. Ambos son autotrazados de una imagen generada: pesan más que los JPG que sustituyen y contradicen el presupuesto del pictograma (<= 20 KB, <= 40 nodos, una tinta). Decisión del propietario: **cablearlos tal cual** para decidir con la app delante. Se implementan como excepción acotada (`src/features/session/tracedArtwork.ts`) sobre las claves `squat-back` y `deadlift-barbell`; el resto de variantes conserva su pictograma inline. Retirar el módulo y los dos archivos de `public/art/` devuelve el comportamiento anterior.

**L5 — El anillo se llena, no engorda; menos texto; y deslizar para avanzar (2026-11-10).** El propietario cambia el comportamiento del héroe de la sesión:

```
quiero que salga el círculo que no se haga más grande cuando es el ejercicio que toca, porque ahora veo que es mucho más grande, simplemente que se ponga en el tono lila clarito, que cuando pasemos al segundo ejercicio se enciendan en lila clarito tanto el primero como el segundo y así progresivamente al tercero, cuarto, etc. Luego que de abajo de la imagen elimina texto te dicho elimina texto que no sea estrictamente necesario. A mí que me diga ejercicio uno de seis actual cero de seis completados no me dice absolutamente nada, ya me lo dicen las barras de progreso que ponga peso muerto convencional tampoco me aporta nada que se quede en peso muerto tres descanso está bien y justo debajo me gustaría que estuvieran los botones de también aceptar noventa y dos, cinco kg lo veo redundante, lo veo demasiado explicativo sustituirlo con un icono. La barra de progreso de abajo también uno de seis también quitar eso. Quiero que pueda hacer slide hacia el lado para pasar al siguiente ejercicio.
```

Decisiones de implementación:

- **Grosor uniforme y encendido por posición.** `RING_STROKE_WIDTH` sustituye la tabla por estado; `RingSegment.reached` es `finished || index <= activeIndex`, así que el primero se enciende al ser el actual y sigue encendido al avanzar, tenga o no series contestadas. Hallazgo durante la verificación: `--pending` declarado después de `--reached` ganaba por orden y dejaba los alcanzados en gris; el CSS ahora declara `--pending` antes y lo documenta.
- **El acento deja de ser exclusivo de `Registrar serie`.** El anillo usa `--color-accent-text` (nunca el relleno) y entra en la lista blanca de `tests/accent-budget.test.ts` con su argumento: estado activo y dato principal. El guardián no se relaja; se argumenta.
- **Texto podado.** Se elimina la línea `Ejercicio n de m · actual · k de m completados`, se conserva el nombre, la prescripción y el peso del día, y el paginador pierde el numeral `1 / 6` mediante `Pager`'s `count={false}`.
- **Botón de aceptar como icono.** `LoadDecisionBar` dibuja una marca cuando no se le pasa `acceptLabel`; el nombre accesible sigue siendo `Aceptar {peso} {unidad}` y un `acceptLabel` explícito mantiene su texto.
- **Deslizar para avanzar.** `swipe.ts` decide (`next`/`previous`/`null`, umbral 48 px, dominio horizontal, sin desplazamiento = nada) y el héroe aplica el gesto llamando a `goTo`, que ya acota los extremos.
- **Nombre acortado en la biblioteca (decisión del propietario).** `seed-ex-peso-muerto` pasa de `Peso muerto convencional` a `Peso muerto`. La semilla sólo corre con el almacén vacío: una instalación existente conserva el nombre antiguo hasta reiniciar datos o migrarlos, y no se toca el almacén sin autorización explícita.

**L6 — Del trazado a un presupuesto medible (2026-11-10).** El propietario pregunta por generar o revectorizar arte con ComfyUI y con las apps de diseño instaladas, y pide revectorizar en nuestro estilo. Lo comprobado: `~/.pi/agent/mcp.json` sólo registra `codegraph`, `context7` y `browser`; `FigCraft` (`%APPDATA%\FigCraft`) y `ArtCraft Launcher` están instalados pero no exponen ningún servidor MCP legible en su configuración. Una app de diseño no inventa la pose: como mucho pinta con nuestros tokens algo cuya geometría viene de otro sitio.

Decisión: en vez de perseguir herramientas, se mide. Se añade `tests/vector-budget.ts` (puro) y `tests/vector-baseline.test.ts` con el presupuesto del pictograma: **≤ 20 KB, ≤ 40 nodos, ≤ 2 valores de pintura, sin degradado, sin bitmap incrustado, con `viewBox`**. Un dibujo que no pase no entra en el conjunto, diga de dónde venga.

Medido con el propio instrumento sobre `design/art/svg/`:

| archivo | peso | paths | nodos | pinturas |
|---|---|---|---|---|
| `squat.svg` | 468,3 KB | 455 | 27.670 | 227 |
| `deathliftr.svg` | 707,4 KB | 784 | 42.230 | 298 |
| `press-banca.svg` | 879,1 KB | 1.060 | 61.197 | 335 |

El equivalente dibujado en `pictograms.ts` es de 408 bytes por figura. Corregido en el instrumento: cuenta **puntos** (un `C` son tres), no comandos, porque contar comandos hacía parecer un tercio más ligero un archivo trazado.

**L7 — Arte: se retira el trazado y se redibujan tres variantes (2026-11-10).** Tras ver el esqueleto («ostia se ve super raro… tú mismo»), el propietario delega la decisión y después la aprueba con «venga».

Decisión: **coherencia antes que fotorrealismo**. Tres renders entre 42 figurillas de línea es lo que se ve roto en la pantalla de sesión; y las 45 en render serían ~30 MB. Se retiran `public/art/*.svg` y el módulo `tracedArtwork.ts` (el precache baja de 2,99 MB a 1.003 KB), y el esqueletonizador queda como herramienta de autoría en `tools/skeletonize/`, fuera del bundle, con sus límites documentados: sin segmentación de persona no distingue atleta de banco, y hereda la pose del modelo.

Se redibujan a mano las tres más usadas, con proporciones y equipo, verificando cada una con captura a 390 px:

- `bench-press` — banco con patas, brazos doblados con codos fuera y manos en la barra, rodilla arriba y pie en el suelo.
- `squat-back` — barra en los trapecios, brazos con codos abajo y manos arriba, muslo + espinilla + pie por separado.
- `deadlift-barbell` — bisagra de cadera, dos brazos rectos y **barra en el suelo** (la primera versión la dejaba flotando a media espinilla).

Las otras 42 variantes quedan como estaban hasta que el propietario decida si merecen el mismo tratamiento.
