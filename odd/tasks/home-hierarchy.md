# Rupfit — Inicio más visual y borrado sencillo

Compactar Inicio: marca más grande y a la izquierda, progreso semanal visual arriba a la derecha, un solo bloque protagonista para la sesión de hoy, y borrado fácil de actividades y de sesiones con confirmación.

## Specs

**S1 — Marca (verbatim):**
«me gustaría que el logo de arriba de la parte superior estuviera más grande y a la izquierda».

**S2 — Progreso semanal visual arriba a la derecha (verbatim):**
«A la derecha poner como un Progress bar o algo así que ponga uno de cuatro completo, uno de cuatro dos de cuatro dependiendo de si esa semana ha hecho todos los entrenos».
«lo de esta semana, una de tres sesiones no me termina de eso lo quiero mucho más resumido arriba a la derecha, ya te digo con sin texto ni nada que sea muy visual».

**S3 — La sesión de hoy, un solo bloque protagonista (verbatim):**
«me gustaría que el de el entreno que toca hoy que pone peso muerto, tracción, seis ejercicios y eso, y empecé entrenamiento, fueran todo un bloque y tuviera un poco más de protagonismo. Rollo, hoy toca esto».

**S4 — Menos texto (verbatim):**
«lo de Warda Ruffita en la pantalla de inicio y lo quitaría, porque sí […] lo veo todo que es demasiado texto todo lo que veas que se puede resumir en iconos o infogramas o algo así».

**S5 — Borrar fácil con confirmación (verbatim):**
«que pueda eliminar de una manera sencilla tanto los entrenos de fútbol como los entrenos que hago de prueba […] que haya un iconito de la basura y que me pregunte si estoy seguro de que se va a eliminar».

**S6 — Nada de esto rompe lo demás (verbatim):** el historial no se pierde, la rotación no cambia, el fútbol sigue siendo actividad y la sesión se sigue abriendo con «Tu Entreno» (pedido anterior).

## Tasks

- T1 — Cabecera de Inicio: marca grande a la izquierda + indicador visual de la semana a la derecha (sesiones hechas de planificadas, sin texto). Specs S1, S2. Ruta: worker (`src/features/home/`). Commit: sí.
- T2 — Bloque único de la sesión de hoy con el botón dentro; retirar la etiqueta redundante y el recuento textual de la semana. Specs S3, S4. Ruta: worker (`src/features/home/`). Commit: sí.
- T3 — Borrado con papelera y confirmación en línea para actividades del inicio. Specs S5. Ruta: worker (`src/features/home/`). Commit: sí.
- T4 — Borrado con papelera y confirmación en línea para sesiones en Historial (sustituye la frase escrita por un paso de confirmación). Specs S5. Ruta: worker (`src/features/progress/`). Commit: sí.
- T5 — Verificación: tests, typecheck, build y capturas de Inicio, Historial y confirmaciones. Specs S6. Ruta: inline. Commit: sí.

## Log

**L1 — Petición original del usuario (verbatim):**
```
Vale, me gustaría que el logo de arriba de la parte superior estuviera más grande y a la izquierda. A la derecha poner como un Progress bar o algo así que ponga uno de cuatro completo, uno de cuatro dos de cuatro dependiendo de si esa semana ha hecho todos los entrenos me gustaría que el de el entreno que toca hoy que pone peso muerto, tracción, seis ejercicios y eso, y empecé entrenamiento, fueran todo un bloque y tuviera un poco más de protagonismo. Rollo, hoy toca esto lo de Warda Ruffita en la pantalla de inicio y lo quitaría, porque sí ya, o sea, lo de esta semana, una de tres sesiones no me termina de eso lo quiero mucho más resumido arriba a la derecha, ya te digo con sin texto ni nada que sea muy visual se puede hacer la última sesión no sé, lo veo todo que es demasiado texto todo lo que veas que se puede resumir en iconos o infogramas o algo así, moralidad darle una vuelta y sobre todo que pueda eliminar de una manera sencilla tanto los entrenos de fútbol como los entrenos que hago de prueba que igual ahora estoy borrando más porque estamos probando la app pero que haya un iconito de la basura y que me pregunte si estoy seguro de que se va a eliminar con eso de momento estaría guay
```

**L2 — Interpretación de la transcripción.** «Warda Ruffita» es «lo de "Hoy toca"»; «moralidad darle una vuelta» es «molaría darle una vuelta». «esta semana, una de tres sesiones» se refiere al recuento textual que hoy se muestra junto a la barra semanal.

**L3 — Seguridad del borrado.** El usuario pide un paso de confirmación en lugar de la frase escrita que existe hoy. Se implementa papelera → confirmación en línea («¿Eliminar? Sí / Cancelar»), nunca un solo toque, y el historial se borra con la misma invariante del almacén (marca y después elimina). Para actividades, el borrado no existía: se añade sobre el puerto que ya lo soporta.
