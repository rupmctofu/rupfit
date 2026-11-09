# Rupfit — rediseño inspirado en la referencia

Rediseñar la estructura visual móvil de Rupfit a partir de la referencia lavanda/violeta, manteniendo sus flujos y datos reales.
Separar sistema de diseño, direcciones visuales, implementación verificable y recomendación de modelo para ejecución.

## Specs

**S1 — Dirección y estructura de interfaz (verbatim):**
«Te dejo aquí una imagen de inspiración de cómo quiero que quede, pero a nivel de interfaz, a nivel de cómo está colocado todo la lógica que tiene y todo, eso es lo que me gustaría que fuera y con imágenes, con gráficos y con todo.»

**S2 — Crear la estructura y recomendar modelo (verbatim):**
«Si me puedes crear toda la estructura de esto y si me recomiendas en algún punto cambiar de modelo a alguno más barato cuando ya solo sea ejecutar, mejor.»

## Tasks

- T1 — Mapear rutas, datos disponibles, assets e invariantes de UI. Specs S1. Ruta: explorer. Hecho: mapa `mw93488a-5-chxq`, evidencia resumida en L2.
- T2 — Sincronizar el sistema lavanda/violeta de la referencia en tokens de app y `design/system.md` + `design/system.html`. Specs S1. Ruta: inline. Hecho: `6a96c7a` (contraste spot-check, 11 pruebas del presupuesto de acento, typecheck, board abierto e inspeccionado).
- T3 — Crear tres direcciones visuales: una propuesta principal con las seis pantallas, dos alternativas de jerarquía para el recorrido esencial. Solo datos existentes o ejemplos DEMO explícitos. Specs S1. Ruta: inline, `design/rupfit-inspiration/`. Hecho: `8806d94`.
- T4 — Adaptar shell/navegación de cuatro destinos a Inicio, Historial, Ejercicios y Perfil sin romper rutas hash. Specs S1. Ruta: inline (`src/app/`). Hecho: `ef89ad5`.
- T5 — Reordenar Inicio y Entrenar para que la próxima sesión, acción primaria y rutina sean lo primero. Specs S1. Ruta: dos workers en paralelo, superficies `src/features/home/` y `src/features/train/`, disjuntas. Commit: sí.
- T6 — Añadir detalle de ejercicio como drill-down de Progreso y rediseñar Estadísticas/Historial con datos existentes. Specs S1. Ruta: worker (`src/features/progress/`; ruta registrada en `src/app/` por T4). Commit: yes.
- T7 — Aplicar la dirección violeta a la sesión y su estado activo, con ilustración vectorial local y sin alterar el motor. Specs S1. Ruta: worker (`src/features/session/`, `src/features/summary/`). Commit: yes.
- T8 — Reorganizar Perfil y conservar ajustes, copia, almacenamiento, instalación y borrado. Specs S1. Ruta: worker (`src/features/profile/`). Commit: yes.
- T9 — Verificar rutas, interacciones, reflow móvil, pruebas, typecheck, build y visuales; corregir el diff. Specs S1. Ruta: inline + verifier. Commit: yes.
- T10 — Recomendar cuándo conviene cambiar a un modelo más barato para la ejecución rutinaria. Specs S2. Ruta: inline. Commit: no.

## Log

**L1 — Petición original del usuario (verbatim):**
```
Te dejo aquí una imagen de inspiración de cómo quiero que quede, pero a nivel de interfaz, a nivel de cómo está colocado todo la lógica que tiene y todo, eso es lo que me gustaría que fuera y con imágenes, con gráficos y con todo. Si me puedes crear toda la estructura de esto y si me recomiendas en algún punto cambiar de modelo a alguno más barato cuando ya solo sea ejecutar, mejor.
```

**L2 — Mapa exploratorio con rutas y capacidades verificables (`mw93488a-5-chxq`):** Inicio → `HomeScreen`; sesión activa → `SessionScreen`; Historial → `HistorialScreen`; Estadísticas → `ProgressScreen`; Perfil → `ProfileScreen`; un detalle de ejercicio no existe. `#/progreso/ejercicio/<exerciseKey>` es el drill-down propuesto; no usar `exerciseId` porque puede ser null para ejercicios borrados. Sesiones, records, peso recomendado, historial por ejercicio, sets/rest y configuración ya existen. Se pueden mostrar series `x de y` (no porcentaje desnudo); duración total es computable; no hay calorías de entrenamientos ni nivel/rango, y no deben inventarse. `public/` solo contiene iconos; no hay ilustraciones de ejercicios. Retener cuatro tabs, hash routing, safe areas, objetivos táctiles 48/56, huecos reales de datos y lógica offline. Evidence paths: `src/app/routes.tsx:49-82`, `src/features/session/ExerciseCard.tsx:221-234`, `src/features/progress/aggregates.ts:151,197,417`, `src/features/home/format.ts:119-121`, `src/core/domain/entities.ts:27-30,110-122`, `public/`.

**L3 — Sistema visual sincronizado desde la referencia**: light canvas `#F5F3FF`, white surface, violet action `#5734E6`, violet-tinted selection, distinct semantic green/warning/danger, dark peer retuned to violet. Contrast spot-checks: body text/canvas 16.37:1; muted/white 5.74:1; white/accent 6.91:1; accent text/white 7.99:1; green/white 4.91:1. `design/system.md` + `design/system.html` sync current source `src/design-system/tokens.css`; source component contracts in `foundation.css`, `components/{actions,cards,chips,charts,metrics}.css`, `src/design-system/README.md`. Rendered 1440×1200 board visually checked and refreshed in canvas.

**L4 — Direcciones creadas y principal seleccionada para implementación**: `design/rupfit-inspiration/01-reference-flow.html` es la principal y muestra seis pantallas (Inicio, detalle de ejercicio, sesión activa, Historial, Estadísticas, Perfil); `02-session-first.html` y `03-evidence-first.html` son alternativas del recorrido crítico. Valores inventados solo aparecen con la marca `DEMO`, y sin calorías/rank. La ilustración de sentadilla es SVG original local: no hay fotos de ejercicios. Screenshots self-contained: `tools/.tmp/{01-reference-flow,02-session-first,03-evidence-first}.png`. Commit: `8806d94`.

**L5 — Handoff elegido**: `design/rupfit-inspiration/01-reference-flow.html` es el artboard **Chosen** para implementación; `02-session-first.html` y `03-evidence-first.html` quedan como alternativas. Handoff iniciado en la canvas y `T4` pasa a implementar esta dirección en el stack real.

**L6 — T4 completado**: tabs renombrados/reordenados (mismas rutas y cuatro destinos), gutter de 20 px con compact 16 px, safe area por tokens, shell claro aun cuando Chromium reporta preferencia oscura. Verificación: `npm test` 642/642; `npx tsc --noEmit -p tsconfig.json` exit 0; `npm run build` exit 0; 13 rutas capturadas a 390 px sin errores de consola. Build conserva aviso de bundle JS >500 kB, no causado por el shell. Commit `ef89ad5`.

**L7 — Routing T5**: Inicio y Rutina son dos superficies de UI disjuntas y cada una supera una edición trivial; para que el padre no duplique lectura/implementación, T5 se divide en dos workers paralelos con `src/features/home/` y `src/features/train/` como Allowed edit surfaces. Comparten S1/artboard 01; no tocan storage, domain, selectors del motor ni datos.