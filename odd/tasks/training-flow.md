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
