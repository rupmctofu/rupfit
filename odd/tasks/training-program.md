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
- T3 — Biblioteca: nombres específicos, músculos secundarios, descripción, variante y alternativas como campos opcionales aditivos (sin migración destructiva). Specs S4, S5. Ruta: inline (dominio y almacenamiento) + worker (UI). Commit: sí.
- T4 — Fútbol como actividad manual independiente, sin crear sesión ni tocar la rotación. Specs S1, S6. Ruta: worker. Commit: sí.
- T5 — Documentación de programa, prescripción, biblioteca y actividad. Specs S1-S8. Ruta: worker. Commit: sí.
- T6 — Verificación: tests, typecheck, build, captura de las pantallas afectadas y revisión independiente. Specs S7. Ruta: inline + verifier. Commit: sí.

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
