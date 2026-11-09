# Rupfit — borrar un entrenamiento guardado

Permitir eliminar una sesión ya guardada cuando el entrenamiento no fue real (se pulsó «Empezar» por error).
El repositorio de sesiones ya implementa el borrado en dos pasos con confirmación escrita; esta tarea expone esa capacidad en Historial.

## Specs

**S1 — El usuario pide poder borrar (verbatim):**
«me gustaría poder eliminar un entreno, ya que a veces le doy a empezar entreno, pero no es real»

**S2 — Borrado definitivo (decisión del usuario, verbatim):**
Opción elegida: «Borrar definitivamente — Se borra la sesión de IndexedDB. Desaparece del historial y el motor vuelve a decidir como si nunca hubieras entrenado ese día.»

Por tanto: la acción elimina la sesión y sus series del almacén, y deja de contar para historial, estadísticas y la próxima recomendación de peso de esos ejercicios. No se ofrece «marcar como no real».

**S3 — Nada se borra de un toque.**
Toda eliminación exige una confirmación escrita que nombra la sesión (`deleteSessionConfirmation(dayNameSnapshot)`), se marca primero y se elimina después (invariante I-5), y el fallo deja la sesión intacta con un mensaje accionable.

**S4 — No se rompe lo que ya existe.**
Sesiones en curso, reanudación, resumen, copia de seguridad, historial y estadísticas siguen funcionando; `npm test`, `typecheck` y `build` pasan; ninguna dependencia nueva.

## Tasks

- T1 — Exponer el borrado en Historial, más una sección para las sesiones sin series que el historial ocultaba. Specs S1, S2, S3. Ruta: inline (`src/features/progress/`). Hecho.
- T2 — Verificar: 6 pruebas del portón de confirmación, `typecheck`, `build`, captura del formulario y borrado real de extremo a extremo en perfil de navegador desechable. Specs S3, S4. Hecho.

## Log

**L1 — Petición original del usuario (verbatim):**
```
me gustaría poder eliminar un entreno, ya que a veces le doy a empezar entreno, pero no es real
```

**L2 — Decisión de producto.** El usuario eligió borrado definitivo frente a marcar como no real. Se implementa un solo camino: eliminar.

**L3 — Hallazgo de código.** `src/storage/repositories/sessions.ts:329` ya expone `delete(sessionId, { confirmation })` con la invariante I-5 (marca primero, elimina después) y validación de la frase de confirmación; `tests/storage/repositories.test.ts` ya lo cubre. No hace falta tocar el modelo de datos: la tarea es de interfaz y flujo.

**L4 — Hallazgo que cambió el alcance.** `historySessions` filtra por estado final **y** por tener al menos una serie (`src/features/progress/summary.ts:72-82`). La sesión del caso real —pulsar «Empezar» y no registrar nada— es `scheduled`/`inProgress`/`partial` sin series: no aparecía en Historial, así que un botón de borrar en el read-out habría sido inalcanzable para el usuario que lo pidió. Se añade la sección «Sin series registradas», que las hace visibles y borrables desde el mismo read-out.

**L5 — Verificación funcional.** En un perfil de navegador desechable: la lista mostraba 1 grupo, el read-out abrió `abandonada 0/12`, el campo pedía `BORRAR SENTADILLA / PIERNA`, el botón se habilitó solo al escribir la frase exacta y, tras borrar, la app volvió a `#/progreso/historial` con 0 grupos y sin la sesión. `npm test` 659/659; `tsc` en ambos proyectos sin salida; `build` correcto; capturas 390 px sin errores de consola.

**L6 — Alcance de lo borrable.** Borrar recalcula la recomendación siguiente porque el motor lee `sessions.recent`; el usuario aceptó esa consecuencia al elegir borrado definitivo sobre «marcar como no real».
