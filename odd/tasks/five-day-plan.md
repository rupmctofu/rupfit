# Plan de 5 días con cardio y selector de día

Feature del plan semanal de `rupfit`: pasar de 4 a 5 días, añadir 20 minutos de cardio
inclinado al final de cada entreno, fijar las series a 8–10 repeticiones al fallo, y que
la semana muestre el estado de cada día y permita elegir cuál se hace hoy.

Repo: `C:\Users\rober\rupfit`. Rama base: `feature/pwa-platform`.

## Specs

S1. El plan semanal son **4 días**: 3 de fuerza y 1 de movilidad. Los tres de fuerza son
PPL (push / pull / legs), que es el split que la app ya tiene como `PIERNA`, `TORSO A`,
`TORSO B`. El cuarto día, hoy `PREPARACIÓN FÚTBOL`, pasa a ser **MOVILIDAD Y CORE**, sin
carga. **El día de partido no tiene entreno**: se deja libre. El número de días no cambia
(4); cambia el contenido del cuarto.

S2. **20 minutos de cardio después de cada entreno**: caminar a 5–6 km/h en pendiente,
«caminar con prisa en pendiente». Va al final de la sesión, no como día aparte.

S3. Cada sesión dura **alrededor de una hora**, cardio incluido.

S4. La pantalla de inicio muestra **qué toca hoy**, y el plan está establecido pero el
dueño puede **elegir otro día** de los que quedan.

S5. El día ya hecho aparece **como completado**, y desde ahí se pueden **ver los otros
días de entreno y elegir cuál hacer**.

S6. Las series de fuerza son de **8–10 repeticiones intentando llegar al fallo**
(`targetRIR = 0`), con una excepción: **sentadilla a 1 RIR**. Decisión del dueño, tomada
sabiendo que desactiva la autoregulación de RIR del motor.

S8. **El fallo temprano se tiene que poder anotar.** El objetivo es que la décima
repetición sea la última posible; si el dueño falla en la sexta, la app debe dejar
registrarlo, no solo marcar «completado». `setAtFailure` **sigue siendo criterio** de la
puerta: no se quita.

S7. `targetRIR = 0` se aplica a **todos** los bloques, no solo al bloque 1: el motor deja
de mover el RIR por bloques en los días de fuerza.

## Open

Nada abierto. O1 y O2 cerrados en L7 y L8.

Resuelto O1: no hay quinto día. 3 fuerza + 1 movilidad, y el día del partido se queda sin
entreno (L7). El cuarto día cambia de contenido, no se añade uno nuevo.

Resuelto O2: `setAtFailure` se queda como criterio. Lo que hace falta es poder anotar el
fallo antes de la repetición objetivo (L8).

## Tasks

| ID | Specs | Qué | Ruta | Commit |
|----|-------|-----|------|--------|
| T1 | S6, S7 | Prescripción fija 8–10 @ 0 RIR (sentadilla 1 RIR) en la tabla de bloques y en el seed | inline | hecho |
| T2 | S2 | Ejercicio de caminata inclinada y su prescripción de 20 min al final de cada día de entreno | inline | — |
| T3 | S1 | Cuarto día: `PREPARACIÓN FÚTBOL` pasa a `MOVILIDAD Y CORE` en el seed y en la plantilla | worker | — |
| T4 | S8 | Poder anotar el fallo antes de la repetición objetivo | worker | — |
| T5 | S4, S5 | Vista de semana con estado por día y selector de día, sobre lo que ya existe en Entrenar | worker | — |
| T6 | S3 | Ajustar la estimación de duración para que la sesión cuadre en ~60 min con el cardio | inline | — |
| T7 | S6, S7 | Llevar la excepción de la sentadilla al motor (hoy se pierde al avanzar de bloque) y actualizar `docs/training-science.md` §6 y `docs/progression-engine.md` §8 | inline | — |

## Log

L1 (dueño, literal): «Me ha recomendado hacer tres días de fuerza, entonces podríamos hacer
un par de días otros ejercicios que no sean fuerza y me han recomendado hacer veinte minutos
de cardio después de cada entreno, pero bueno, veinte minutos de caminar a unos cinco o seis
kilómetros por hora más o menos como caminar con prisa en pendiente. Entonces añádelo y
quiero que hagas los entrenos que más o menos duren una hora y que me hagas, como le ha
dicho, creo que la pool press. Mira qué tipo de entreno es y que me hagas esto y que yo cada
día cuando entra en la app y vea qué toca hoy pueda elegir si quiero pierna, o sea, que esté
establecido pero que yo pueda elegirlo río, esta semana ya se echo pierna pues que salga como
completado, pero»

L2 (dueño, literal): «que salga como completada, pero que pueda ver los otros dias de
entreno y elegir cual quiero hacer»

L3 (dueño, literal): «y también me han recomendado que haga siempre unas series de unos 8-10
reps intentando llegar siempre al fallo. En sentadilla dejarme un rir1 para no morir en el
intento»

L4 (dueño, decisión): los dos días no-fuerza son fútbol y movilidad y core; el método es PPL.

L5 (dueño, decisión): 8–10 repeticiones, todo al fallo, sentadilla a 1 RIR. Se le advirtió
de que el motor pierde la señal de RIR y de que el volumen efectivo sube; eligió igual.

L7 (dueño, decisión): «tienes razón, 3 dias de fuerza y 1 de movilidad. Demajos el dia de
partido sin entreno». No hay quinto día: el cuarto cambia de contenido.

L8 (dueño, literal): «si fallo en la rep 6 por ejemplo, debería poder notificarlo. La cosa es
que tengo que entrenar para que la décima rep sea la ultima que puedo hacer y que si hiciera
una onceava, haría fallo. Por lo tanto creo que si debería ser importante poder anotar que he
fallado antes de la 10». Consecuencia: `setAtFailure` no se quita; se añade el registro del
fallo temprano.

L9 (arquitecto, T1 entregada): tabla de bloques cambiada a 8–10 @ 0 RIR en `strength`,
`hypertrophy` y `accessory`; la sentadilla recibe 1 RIR desde su fila del seed
(`SQUAT_EXERCISE_ID` en `plan.ts`). Consecuencias registradas: (a) `strength` y `hypertrophy`
quedan con los mismos números en todos los bloques, así que el perfil ya solo se distingue por
`role`; (b) la excepción de la sentadilla **se pierde** cuando el motor avanza de bloque,
porque `evaluateBlock` reconstruye la prescripción desde la tabla — queda como T7. Suite
completa en verde: 1037 tests, typecheck limpio.

L6 (arquitecto, hallazgo): «ver los otros días y elegir cuál hacer» **ya existe** en
Entrenar (`src/features/train/RoutineEditor.tsx`, `RoutineReadList`, con
`statusOf` = `hecha | hoy | pendiente` y un botón por día que llama a `onStartDay`). Lo que
falta es llevarlo a la vista de semana del inicio, no construirlo de cero.
