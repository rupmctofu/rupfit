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

- T1 — Exponer el borrado en Historial: entrada por sesión guardada, confirmación escrita, estado de error y de éxito. Specs S1, S2, S3. Ruta: worker (`src/features/progress/`). Commit: sí.
- T2 — Verificar: pruebas del repositorio y de la lógica de confirmación, `typecheck`, `build` y captura de la pantalla con el diálogo abierto. Specs S3, S4. Ruta: inline + verifier. Commit: sí.

## Log

**L1 — Petición original del usuario (verbatim):**
```
me gustaría poder eliminar un entreno, ya que a veces le doy a empezar entreno, pero no es real
```

**L2 — Decisión de producto.** El usuario eligió borrado definitivo frente a marcar como no real. Se implementa un solo camino: eliminar.

**L3 — Hallazgo de código.** `src/storage/repositories/sessions.ts:329` ya expone `delete(sessionId, { confirmation })` con la invariante I-5 (marca primero, elimina después) y validación de la frase de confirmación; `tests/storage/repositories.test.ts` ya lo cubre. No hace falta tocar el modelo de datos: la tarea es de interfaz y flujo.
