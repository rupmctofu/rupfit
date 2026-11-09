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
- T3 — Crear tres direcciones visuales de la app completa, con pantallas móviles realistas, jerarquía y los datos que existen; una sigue de cerca la imagen como propuesta principal. Specs S1. Ruta: inline, `design/rupfit-inspiration/`. Commit: sí.
- T4 — Implementar en la app la dirección principal: Inicio, detalle/selección de ejercicio, sesión activa, historial, progreso y Perfil; preservar la lógica existente y usar un detalle de ejercicio explícito. Specs S1. Ruta: workers por superficies disjuntas + inline. Commit: sí.
- T5 — Verificar estados y reflow móvil, pruebas, typecheck, build y evidencia visual; corregir discrepancias de implementación contra la dirección principal. Specs S1. Ruta: inline + verifier. Commit: sí.
- T6 — Recomendar cuándo conviene cambiar a un modelo más barato para la ejecución rutinaria. Specs S2. Ruta: inline. Commit: no.

## Log

**L1 — Petición original del usuario (verbatim):**
```
Te dejo aquí una imagen de inspiración de cómo quiero que quede, pero a nivel de interfaz, a nivel de cómo está colocado todo la lógica que tiene y todo, eso es lo que me gustaría que fuera y con imágenes, con gráficos y con todo. Si me puedes crear toda la estructura de esto y si me recomiendas en algún punto cambiar de modelo a alguno más barato cuando ya solo sea ejecutar, mejor.
```

**L2 — Mapa exploratorio con rutas y capacidades verificables (`mw93488a-5-chxq`):** Inicio → `HomeScreen`; sesión activa → `SessionScreen`; Historial → `HistorialScreen`; Estadísticas → `ProgressScreen`; Perfil → `ProfileScreen`; un detalle de ejercicio no existe. `#/progreso/ejercicio/<exerciseKey>` es el drill-down propuesto; no usar `exerciseId` porque puede ser null para ejercicios borrados. Sesiones, records, peso recomendado, historial por ejercicio, sets/rest y configuración ya existen. Se pueden mostrar series `x de y` (no porcentaje desnudo); duración total es computable; no hay calorías de entrenamientos ni nivel/rango, y no deben inventarse. `public/` solo contiene iconos; no hay ilustraciones de ejercicios. Retener cuatro tabs, hash routing, safe areas, objetivos táctiles 48/56, huecos reales de datos y lógica offline. Evidence paths: `src/app/routes.tsx:49-82`, `src/features/session/ExerciseCard.tsx:221-234`, `src/features/progress/aggregates.ts:151,197,417`, `src/features/home/format.ts:119-121`, `src/core/domain/entities.ts:27-30,110-122`, `public/`.

**L3 — Sistema visual sincronizado desde la referencia**: light canvas `#F5F3FF`, white surface, violet action `#5734E6`, violet-tinted selection, distinct semantic green/warning/danger, dark peer retuned to violet. Contrast spot-checks: body text/canvas 16.37:1; muted/white 5.74:1; white/accent 6.91:1; accent text/white 7.99:1; green/white 4.91:1. `design/system.md` + `design/system.html` sync current source `src/design-system/tokens.css`; source component contracts in `foundation.css`, `components/{actions,cards,chips,charts,metrics}.css`, `src/design-system/README.md`. Rendered 1440×1200 board visually checked and refreshed in canvas. System palette source is current; artboards may proceed.