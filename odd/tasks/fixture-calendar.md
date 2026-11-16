# Calendario real de partidos

Rupfit deja de preguntar cada semana si el partido es liga o copa: el calendario de AC FRÍO entra
en la app desde la única fuente que ya lo tiene resuelto, y la semana se coloca alrededor de la
jornada real. El conmutador manual se queda como corrección, no como norma.

## Specs

- **S1** — "tienes el calendario de cuándo juego a fútbol, entonces que me cambies en la semana el
  entreno de la semana dependiendo cuándo juego". El día del partido sale de la jornada real de esa
  semana; la app no vuelve a preguntarlo.
- **S2** — La fuente no se lee en tiempo de ejecución: el calendario viaja dentro de la app. Una
  ingesta offline copia las jornadas de AC FRÍO desde `ACFrio-web/src/data/competition.json` y las
  deja como dato propio versionado. La app sigue funcionando sin red y sin CORS.
- **S3** — Una jornada de AC FRÍO es un registro con `date`, `time`, `field`, `matchday`,
  `competition` (`league` | `cup`) y el rival, derivado de `home.slug === "ac-frio"` (dimensionado
  en el origen: no hay campo `home|away` en la fuente).
- **S4** — Una semana sin jornada es una semana sin partido (`none`), no una semana con un partido
  inventado. Una fecha nula en la fuente no es una fecha: se rechaza, no se rellena.
- **S5** — El conmutador manual (liga / copa / sin partido) se queda como corrección de la semana
  en curso, para cuando la fuente esté vieja o el partido se mueva.
- **S6** — El renglón del partido dice qué jornada está usando: rival, hora y campo. Si el
  calendario está mal, tiene que verse en la pantalla que abre el dueño, no esconderse.
- **S7** — La ingesta se niega a escribir un calendario sospechoso: el generador del otro
  proyecto escribe el JSON aunque sus propias comprobaciones fallen, así que un archivo roto puede
  existir. La ingesta valida que AC FRÍO aparezca en cada jornada, que las fechas existan, que la
  temporada coincida con la esperada, y aborta sin tocar el dato bueno si algo no cuadra.
- **S8** — Este documento corrige `odd/tasks/match-aware-week.md` **S10**: la lectura automática
  de CEGARRAF se declaró imposible (formulario POST, sin CORS, listas vacías) y resultó que sí se
  puede, por GET sencillo y regex, y que el otro proyecto ya lo hace.

## Tasks

- **T1** — Ingesta: script que lee `competition.json`, filtra las jornadas de AC FRÍO, valida (S7) y escribe la tabla versionada de jornadas con su `generatedAt`. Route: worker.
- **T2** — Derivación: el día del partido de la semana sale de la tabla, no del conmutador; el conmutador queda como corrección (S5). Route: worker.
- **T3** — El renglón del partido enseña rival, hora y campo (S6), y la hoja corrige la semana. Route: worker.
- **T4** — Verificación independiente, README y `docs/`, cierre. Route: verify.

## Log

- **L1** — "tienes el calendario de cuándo juego a fútbol, entonces que me cambies en la semana el
  entreno de la semana dependiendo cuándo juego y que si yo por lo que sea por una lesión porque me
  siento cansado de un lado y tal, lo pueda cambiar fácilmente deslizando".
- **L2** — "El calendario esta en https://acfrio-web.vercel.app/ y en la carpeta de la raiz, acfrio
  web". La web desplegada es una SPA sin datos en el HTML; la carpeta local sí los tiene.
- **L3** — Exploración del otro proyecto: `src/data/competition.json` (31 KB, temporada 2026-2027,
  `generatedAt` 2026-11-12) con `competitions[]` por `key` (`league`, `cup`) y `fixtures[]` con
  `matchday`, `date`, `time`, `field`, `home{slug,name}`, `away{slug,name}`, `score`, `status`.
  AC FRÍO aparece en unas 14 jornadas de liga y 5 de copa. Lo genera
  `scripts/sync-competition.mjs`: `fetch` GET a `cegarraf.gespic.com` con user-agent propio y
  raspado por expresiones regulares, competiciones escritas a mano, ejecución manual, sin CI.
- **L4** — Riesgo medido en el generador: imprime sus problemas y sale con código 1 **después** de
  haber escrito el JSON, así que una corrida a medias sobrescribe el dato bueno. De ahí S7: la
  ingesta valida antes de escribir, y es ella la que protege a Rupfit.
- **L5** — Decisión del dueño sobre el dolor, que acota esta feature: "no quiero decirle a la app
  que me duele la espalda, si no que yo pueda cambiarlo si me duele algo, no hace falta que lo haga
  rupfit". El calendario coloca la semana; el cambio por molestias lo hace él moviendo el entreno.
