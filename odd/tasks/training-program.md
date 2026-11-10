# Rupfit — plan de fuerza, hipertrofia y fútbol

El plan por defecto de Rupfit pasa a ser el del propietario: tres días de gimnasio (pierna, torso A, torso B), fútbol el jueves como actividad independiente, y prescripción propia por ejercicio.
La matemática del motor (incremento, decisión de bloque, progresión doble, RIR) no se sustituye; sí se amplía su tabla de prescripción, porque hoy impone dos columnas a todo.

## Specs

**S1 — Semana (verbatim):**
```
| Día | Actividad |
| Lunes | Gimnasio: pierna |
| Martes | Gimnasio: torso A |
| Miércoles | Descanso |
| Jueves | Fútbol |
| Viernes | Gimnasio: torso B |
| Sábado | Descanso |
| Domingo | Descanso |
```
Tres sesiones semanales de gimnasia más fútbol. «El jueves debe quedar reservado para el fútbol. No quiero que Rupfit programe una sesión de fuerza ese día ni que contabilice el fútbol como una sesión de gimnasio completada.»

**S2 — Prescripción por ejercicio (verbatim):**
«No quiero que todos los ejercicios aparezcan automáticamente con dos series de quince repeticiones.» «Ejercicios principales de fuerza: 3-4 series de 5-8 repeticiones.» «Ejercicios de hipertrofia: 3-4 series de 8-12 repeticiones.» «Ejercicios accesorios: 2-3 series de 10-15 repeticiones.» «Ejercicios preventivos y de estabilidad: series y tiempos adaptados al movimiento.» Progresión doble con RIR; nunca al fallo de forma sistemática.

**S3 — Introducción prudente (verbatim):**
«Introduce Nordic curl progresivamente.» «Introduce Copenhagen plank empezando por variantes adaptadas.» «Evita acumular demasiado trabajo excéntrico.» «No generes agujetas excesivas que comprometan el fútbol del jueves.» «No aumentes automáticamente la carga solo porque haya completado las repeticiones.»

**S4 — Biblioteca inequívoca (verbatim):**
«No quiero ejercicios con nombres genéricos o ambiguos.» Ejemplos exigidos: elevación de gemelos de pie en máquina, elevación de gemelos en prensa, elevación de sóleo sentado, curl femoral tumbado en máquina, curl femoral sentado en máquina, peso muerto rumano con barra, nordic curl asistido, copenhagen plank. «Cada ejercicio debe incluir, cuando corresponda: nombre específico, grupo muscular principal, músculos secundarios, patrón de movimiento, equipamiento necesario, descripción de ejecución, variante concreta.»

**S5 — Alternativas (verbatim):**
«Quiero que la aplicación pueda sugerir una alternativa cuando una máquina esté ocupada.» Debe respetar grupo muscular, patrón, objetivo, equipamiento y exigencia; «La alternativa debe estar identificada claramente y conservar su propio historial de progresión.»

**S6 — Fútbol independiente (verbatim):**
«El fútbol debe ser una actividad independiente y no debe modificar automáticamente la rotación de sesiones de fuerza.» «No introduzcas temporizadores de descanso obligatorios.»

**S7 — Límites técnicos (verbatim):**
«No sustituyas el motor de progresión.» «No rompas el almacenamiento IndexedDB. Mantén la compatibilidad con los datos existentes.» «Mantén el funcionamiento offline. Respeta Safari iOS.» «No introduzcas dependencias innecesarias.» «No hagas cambios visuales ajenos a esta tarea.» Mantener tests, typecheck y build verdes.

**S8 — Sin configuración para terceros (verbatim):**
«no quiero que alguien se baje la app y se le configure a sus necesidades. Yo te he dado las mías para que implementes con tu criterio»
Por tanto: nada de asistentes nuevos ni de opciones de plan por usuario; el plan por defecto es este y las decisiones de programación las toma el implementador.

## Tasks

- T1 — Motor: cuatro perfiles de prescripción (`strength`, `hypertrophy`, `accessory`, `preventive`) en la tabla de bloques, sin tocar incremento, decisión ni progresión doble. Specs S2, S3, S7. Ruta: inline. Commit: sí.
- T2 — Semilla: tres días nuevos (Pierna / Torso A / Torso B) con ejercicios y perfiles por slot; jubilar la rotación antigua. Specs S1, S2. Ruta: inline. Commit: sí.
- T3 — Biblioteca: nombres específicos, músculos secundarios, descripción, variante y alternativas como campos opcionales aditivos (sin migración destructiva). Specs S4, S5. Ruta: inline (dominio y almacenamiento) + worker (UI). Hecho: `0a2ba9c`.
- T3b — Refresco de la biblioteca sembrada en tiendas existentes: upsert de filas de la semilla, nunca filas propias, conservando `isArchived` y el id. Specs S4, S7. Ruta: inline (`src/features/onboarding/library-refresh.ts` + arranque). Hecho: `0a2ba9c`.
- T4 — Fútbol como actividad manual independiente, sin crear sesión ni tocar la rotación. Specs S1, S6. Ruta: worker (`src/features/home/`). Hecho: `bd9c3c3`.
- T5 — Documentación de programa, prescripción, biblioteca y actividad. Specs S1-S8. Ruta: inline. Hecho: `5673e73` y `32f2e0f`.
- T6 — Verificación: tests, typecheck, build, captura de las pantallas afectadas y revisión independiente. Specs S7. Ruta: inline + verifier. Hecho: `gentle-ai-verify` sobre `0d839d5..bd9c3c3`, un bloqueante corregido en `32f2e0f`.

## Log

**L1 — Petición original del usuario (verbatim):**
```
# RUPFIT — ADAPTACIÓN DEL PLAN DE ENTRENAMIENTO A FUERZA, HIPERTROFIA Y FÚTBOL

Actúa como desarrollador senior especializado en aplicaciones de fitness y programación de entrenamiento basada en evidencia científica.

Quiero adaptar la programación de entrenamiento de Rupfit a mis necesidades reales. Antes de modificar nada, inspecciona la arquitectura y el funcionamiento actual del proyecto.

No quiero reconstruir la aplicación ni cambiar innecesariamente su motor de progresión. Quiero adaptar correctamente el plan de entrenamiento existente.
```

**L2 — Hallazgo que fija la decisión.** `src/core/engine/readaptation.ts:44-58` tiene `BLOCK_TABLE` con dos columnas (`primary`, `accessory`) y el motor sobrescribe series, repeticiones y RIR de cada ejercicio en readaptación (`src/core/engine/progression-engine.ts:248-306`). Las orientaciones de S2 son inexpresables con dos columnas, así que T1 las amplía. No se sustituye la matemática: `progression-engine` sigue decidiendo incremento, progresión doble y RIR con las mismas reglas; solo cambia de qué columna lee la prescripción.

**L3 — La rotación no conoce días de la semana.** `PlanDay` no almacena weekday (`docs/data-model.md §3`) y `nextPlanDay` elige la sesión siguiente a la última cerrada (`src/features/session/start.ts:86-120`). S1 se implementa como orden de tres días (Pierna → Torso A → Torso B) más el fútbol como actividad ajena a la rotación: Rupfit nunca programará fuerza el jueves porque no programa días, y no cuenta el fútbol como sesión porque es una `ActivityRecord`. Se documenta la limitación en lugar de inventar un calendario que el modelo no tiene.

**L4 — Decisión del propietario sobre el alcance.** «no quiero que alguien se baje la app y se le configure a sus necesidades. Yo te he dado las mías para que implementes con tu criterio»: se cierra la pregunta sobre ampliar el motor y se descarta cualquier asistente de configuración de plan.

**L5 — Verificación independiente y su bloqueante.** `gentle-ai-verify` revisó `0d839d5..bd9c3c3` y encontró que `src/storage/mappers.ts` copiaba la prescripción sin `role`: el motor leía perfil, el almacén lo borraba, y en la app real todo se juzgaba como hipertrofia (una sentadilla de 3 × 6 salía «series incompletas» y el bloque no pasaba). Corregido en `32f2e0f` con una prueba que recorre semilla → fila guardada → recomendación. El mismo commit sube `ENGINE_VERSION` a 1.1.0 (§12 lo exige cuando cambian los números de §8), documenta la tabla de cuatro columnas y saca del índice un módulo muerto (`src/core/format`) que se había colado.

**L6 — Lo que el verificador dejó abierto, aceptado.** 14 filas de la biblioteca que el plan no prescribe siguen sin descripción, y `face pull` no tiene alternativa porque su familia (patrón + músculo) no tiene hermano honesto; rellenarlo violaría S5. Las alternativas se muestran en el detalle del ejercicio, no en mitad de una serie (eso pediría un flujo nuevo en la sesión, fuera de S6). El fútbol queda como actividad manual de 50 minutos sin kcal: no hay dato real que inventar.

**L11 — Cuatro días y trabajo de resistencia (decisión del propietario, 2026-11-10).** «quiero que implementes todo la tabla de ejercicios y los días con el nuevo tipo de entrenamiento que habíamos seleccionado». Se implementa:

- **Cuatro días de gimnasio**: `PIERNA`, `TORSO A`, `TORSO B` y `FÍSICO`, este último el nuevo tipo: intervalos para aguantar el partido, más resistencia específica de aductores, sóleo y core.
- **Un perfil de prescripción nuevo, `conditioning`**, que se prescribe **por tiempo** (series de 2–4 minutos o intervalos) y no por repeticiones: el motor lo mantiene en carga cero, sin incremento, y la sesión muestra minutos en lugar de repeticiones.
- Nada de configuración: el plan es el que es, Perfil no pregunta días ni tipos.
- Semana: lunes pierna, martes torso A, miércoles descanso, jueves fútbol, viernes torso B, sábado físico, domingo descanso. El fútbol sigue siendo actividad y no mueve la rotación.
