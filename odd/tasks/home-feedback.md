# Home and session feedback

The owner walked through the installed app on 2026-11-17 and dictated eight observations.
This document holds the three defects he agreed to fix first; the rest are recorded in the
log as scope decisions, not as pending work.

## Specs

- **S1** — A week row whose date has not arrived is never shown as done. Owner's words:
  «me sale viernes veinte de noviembre Torso B y me pone como que está hecho cuando ese día
  ni siquiera ha llegado. Hay ahí algo que no está bien». The row's own date decides, not the
  plan day it happens to hold.
- **S2** — The displaced-days block says what it is: training days the match left without a
  weekday. Owner's words: «no entiendo por qué pones sin día ese semana sí, una son los
  principales ejercicios que haya que hacer sentadilla, peso muerto y peso banca». He read
  the block as exercises without a day; the label must not allow that reading.
- **S3** — A session that only exists because it was opened by accident can be discarded,
  and only while it has no confirmed set. Owner's words: «cuando entro en un entreno sin
  querer y quiero salir ... no puedo salir nunca porque terminarse ... no hay ninguna serie
  confirmada y no puedo salir ... que saliera como descartar sesión o lo que sea».

Out of scope for this batch, in the owner's own words: «el historial de momento ... de
momento no toquemos nada»; «el listado de ejercicios tampoco me sirve mucho ... no tocamos
nada»; and «No lo toco, como dijiste» for Ejercicios, Historial and Perfil.

## Tasks

- **T1** — S1 — inline — `a787d89`
- **T2** — S2 — inline — `b66f1c9`
- **T3** — S3 — worker `gentle-ai-worker` — `3462678`

## Log

- **L1** (owner, 2026-11-17, verbatim): «Te voy diciendo cosas que voy viendo en la app vale,
  entonces ahora estoy en la pantalla de inicio y estoy viendo, por ejemplo, que tengo lunes
  torsoa, martes, partido copa que pone que no hay entreno, miércoles, movilidad y core,
  jueves, pierna y viernes torso B me sale viernes veinte de noviembre Torso B y me pone como
  que está hecho cuando ese día ni siquiera ha llegado. Hay ahí algo que no está bien y luego
  pones el día esta semana sentadía pierna, peso muerte de tracción, presos banca empuje
  entonces no entiendo por qué pones sin día ese semana sí, una son los principales
  ejercicios que haya que hacer sentadilla, peso muerto y peso banca. Entonces no sé si los
  ejercicios están bien distribuidos a lo largo de los días. Me gustaría que lo chequearas de
  nuevo y el día de el lunes hice tor soa por dependiente y sí que lo dice. Y me gustaría que
  los martes, aunque haya partido, yo pueda seleccionar un tipo de entreno de movilidad o lo
  que sea también pone última torso B tres mil doscientos ochenta y ocho k tampoco me sirve
  mucho esa información de los días que, o sea, de los kilos que ha levantado en total porque
  muchas son poleas no me sirve mucho. El historial de momento, como solemos entrenar un día,
  pues de momento no toquemos nada, el listado de ejercicios tampoco me sirve mucho una lista
  de ejercicios, pero qué distante de alguno no tocamos nada porque Berry de y tarde las
  rutinas tampoco es que puede editar nada y empezar bien no entiende muy bien esa página de
  ejercicios me cuesta mucho navegar por ella no entiendo muy bien la lógica y el perfil
  tampoco me dice mucho entonces creo que las principales que vamos a usar es inicio y el
  entreno de hoy que cuando entro en un entreno sin querer y quiero salir de la determinada
  recesión y no puedo salir nunca porque terminarse si administra la sesión se ha empezado no
  se ha empezado no hay ninguna serie confirmada y no puedo salir a aquecierro salir y seguir
  luego te voy a salir y seguir luego no terminar la sesión que saliera como descartar sesión
  o lo que sea eso no sé muy bien cómo cambiarlo y también la info es a que hablamos de que te
  pasé del evolt y la info de ahí creo que eso tendría que estar en perfil creo no sé darle una
  vuelta».
- **L2** (owner, 2026-11-17, scope): «Solo los tres defectos de lectura» and «No lo toco, como
  dijiste». Match-day session choice, the tonnage line and Evolt in Perfil are deferred.
- **L3** (evidence, 2026-11-17): `src/features/week/agenda.ts:242` keys `done` by plan day
  within the week and never against the row's date; `src/features/home/agenda.tsx:1090`
  labels the displaced-days block "Sin día esta semana"; the exit sheet
  (`src/features/session/SessionScreen.tsx:513-524`) offers only leave and finish, while
  `deleteStoredSession` + the typed confirmation already exist for empty sessions.
- **L4** (evidence, 2026-11-17): the old rule was pinned by two tests — «follows the plan
  day, not the weekday it used to sit on» and «keeps Sunday inside the week» — so S1
  supersedes them deliberately; both were rewritten to assert the new rule instead of
  deleted. `npm run test` 79 files / 1218 tests and `npm run typecheck` green at `3462678`.
  T3 restates the two port calls inside the session feature instead of importing
  `features/progress/deleteFlow.ts`, because architecture §4 forbids a feature importing
  another feature.
- **L5** (evidence, 2026-11-17, independent verification): S1, S2 and S3 confirmed with the
  guards intact — the store itself refuses `delete` before `markDeletionPending` and refuses
  a wrong sentence; a failed discard keeps the question and navigates nowhere; the discard
  refusal covers `null`, `completed`, `partial`, `abandoned` and any confirmed set. It found
  two unpinned halves, closed in `4215254`: the date boundary (23:59 before, 00:01 after)
  and the `partial`/`abandoned` refusals. Suite at `4215254`: 79 files / 1219 tests, typecheck
  clean. Known residual: a successful discard leaves the controller's in-memory session
  until the screen unmounts; the next mount boots from storage and finds no row.
