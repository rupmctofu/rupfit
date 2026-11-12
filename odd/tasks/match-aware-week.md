# Mantener Rupfit: una semana planificada, no una rotación

Cambio de planteamiento del entrenamiento: 4 días de trabajo (3 de fuerza + 1 de preparación
para el fútbol) y el partido como quinto día que solo se informa. La app sugiere el peso, el
dueño responde una vez por ejercicio y la semana siguiente se ajusta sola. La semana gira
alrededor del día del partido, que casi siempre es jueves y a veces martes.

## Specs

- **S1** — "cuatro días de entreno tres de fuerza y uno de preparación para el fútbol más mi
  día ni quinto día que es el partido de fútbol que simplemente lo informamos". La semana
  tiene cuatro días de trabajo; el partido no es un entreno: se informa.
- **S2** — "quiero que me generes un entreno y que me sugieras los pesos que tengo que poner
  y que yo considere si he podido hacer la serie o no". La prescripción llega hecha: series,
  repeticiones y kilos propuestos.
- **S3** — "no quiero que cada día que vaya a entrenar yo le diga, voy a hacer este peso, voy
  a hacer tal peso simplemente que me sugiera en plan, mira pues hoy que llevas un año sin
  entrenar vas al gimnasio y vas a hacer pressbanca con diez kilos diez repeticiones, por
  ejemplo". Nada de configurar el peso antes de entrenar: el peso ya está puesto. El
  teclado de peso queda como corrección, no como paso obligatorio.
- **S4** — "que yo, después de entreno ponga, si lo he hecho, si he fallado o si he ido
  sobrado y que a partir de ahí para la semana siguiente considere si tengo que subir peso o
  bajar o lo que sea, o más repeticiones, menos repeticiones". Un veredicto por ejercicio,
  no por serie, y de ese veredicto sale el ajuste de la semana siguiente.
- **S5** — "quiero un entreno que yo simplemente vaya al gimnasio y vea hoy toca esto". Al
  abrir la app ya se sabe qué toca hoy, sin elegir ni planificar.
- **S6** — "quiero poder cambiar si quiero hacer piernas, si quiero hacer pecho que me
  sugiera, es decir, tener un establecido que los lunes toca pierna ... teniendo en cuenta
  que juego los jueves, pero alguna semana juego el martes, entonces quiero yo poder
  cambiarlo". Hay un reparto estable por día de la semana y se puede cambiar el de hoy.
- **S7** — "que se cambie el tipo de entrenamiento dependiendo si esa semana juego el jueves,
  que será la mayoría o si esa semana juego martes que se reestructure todo, pero también
  poder elegir si hoy prefiere hacer otra cosa, otro tipo de entreno". Mover el partido
  reestructura la semana entera; cambiar el día de hoy es una decisión aparte.
- **S8** — Respuesta a la pregunta de producto: el informe tras entrenar es "Por ejercicio,
  una sola respuesta".
- **S9** — Respuesta a la pregunta de producto: si hoy se cambia el tipo de entreno, el día
  que se dejó "Se mueve a otro día de la semana".
- **S10** — "en principio sale el calendario en esta web
  https://www.cegarraf.cat/esport-popular/lliga-comarcal-futbol-7/ somos el equipo 'AC FRIO'".
  El día del partido debería salir de esa fuente. Medido: el hub de WordPress no tiene API y
  los calendarios cuelgan de `cegarraf.gespic.com`, que sirve un componente Joomla con
  formulario POST (`filter[matchday]`, `filter[team]`) cuyas listas de equipos llegan vacías
  en el HTML y sin cabeceras CORS. La lectura automática queda como adaptador futuro detrás
  de un puerto (`FixturePort`), no como dependencia del planificador.
- **S11** — "la liga se juega los jueves, estamos en la 3ª Divisió GRUP B. La copa los martes,
  estamos en el grupo B. La semana que se juega copa no se juega liga". Hay exactamente un
  partido por semana, nunca dos: jueves de liga, o martes de copa. Esa es toda la
  información que la semana necesita, y es estable durante la temporada.
- **S12** — "sabado no voy a entrenar. Los dias de entreno son lunes, martes, miercoles,
  jueves y viernes. Son 5 días. de los 5, uno es fisicode preparación de futbol". La ventana
  es lunes a viernes; sábado y domingo son descanso. En semana de partido uno de esos cinco
  días lo ocupa el partido, así que quedan tres de fuerza y uno de preparación.

## Tasks

- **T1** — Planificador de semana puro `weekPlan`: siete días con fecha, un partido por
  semana y una plantilla aceptada por tipo de semana (liga / copa / sin partido). Las
  plantillas son datos, no el resultado de reglas deducidas: cada una fija qué toca cada día
  de lunes a domingo, y el módulo solo estampa fechas, valida que los siete días están una
  vez y deja que el llamante pase los ids de sus días. Specs: S1, S5, S6, S7, S11, S12.
  Route: worker.
- **T2** — Cuarto día de preparación para el fútbol en la semilla (hoy `FÍSICO` a tiempo):
  contenido, orden y por qué ese día va donde va respecto al partido. Specs: S1, S6.
  Route: worker.
- **T3** — El día del partido como dato de la semana: jueves de liga por defecto, martes en
  semana de copa; las semanas de copa se marcan una vez por temporada (son pocas y no
  cambian) y hay un cambio suelto para la semana en curso. Persistido, con una acción en
  Inicio. Sin scraping. Specs: S7, S11. Route: worker.
- **T4** — "Hoy toca esto": el entreno del día sale del planificador, no de la rotación por
  historial, y cerrar la semana reestructura. Specs: S5, S7. Route: worker.
- **T5** — Cambiar el día de hoy: elegir otro tipo de entreno y recolocar el que se deja en
  otro hueco libre de la semana. Specs: S6, S9. Route: worker.
- **T6** — Flujo de sesión con veredicto por ejercicio: sugerencia ya puesta, sin pedir peso,
  y una sola respuesta al terminar cada ejercicio (`lo hice` / `fallé` / `fui sobrado`).
  Specs: S2, S3, S4, S8. Route: worker.
- **T7** — Motor: del veredicto al ajuste de la semana siguiente (subir, bajar, más
  repeticiones, menos) sobre las reglas existentes de `progression-engine.ts`. Specs: S4.
  Route: worker.
- **T8** — El partido informado: actividad de fútbol alineada con el día de partido de la
  semana, sin crear sesión. Specs: S1. Route: inline.
- **T9** — Documentación y memoria: `docs/progression-engine.md`, `docs/data-model.md`,
  `docs/product-requirements.md`, `docs/roadmap.md`, y la decisión en Engram. Specs: todas.
  Route: inline.
- **T10** — Adaptador de calendario desde cegarraf (bloqueado por S10: el componente Joomla
  no expone feed, exige POST con sesión y no manda CORS; haría falta un proxy propio que
  parsee HTML). Specs: S10. Route: worker. Estado: pendiente de decisión.

## Log

- **L1** (petición original, literal): "Quiere hacer un cambio de planteamiento quiero que
  estudies los tipos de entrenamiento y que, según mis necesidades, que son cuatro días de
  entreno tres de fuerza y uno de preparación para el fútbol más mi día ni quinto día que es
  el partido de fútbol que simplemente lo informamos, que no hace falta, bueno sí, quiero que
  me generes un entreno y que me sugieras los pesos que tengo que poner y que yo considere si
  he podido hacer la serie o no, pero no quiero que cada día que vaya a entrenar yo le diga,
  voy a hacer este peso, voy a hacer tal peso simplemente que me sugiera en plan, mira pues
  hoy que llevas un año sin entrenar vas al gimnasio y vas a hacer pressbanca con diez kilos
  diez repeticiones, por ejemplo, y que yo, después de entreno ponga, si lo he hecho, si he
  fallado o si he ido sobrado y que a partir de ahí para la semana siguiente considere si
  tengo que subir peso o bajar o lo que sea, o más repeticiones, menos repeticiones y quiero
  un entreno que yo simplemente vaya al gimnasio y vea hoy toca esto y quiero poder cambiar
  si quiero hacer piernas, si quiero hacer pecho que me sugiera, es decir, tener un
  establecido que los lunes toca pierna, que los martes toca lo que sea, que los miércoles
  toque lo que sea, teniendo en cuenta que juego los jueves, pero alguna semana juego el
  martes, entonces quiero yo poder cambiarlo y no hacer pierna el lunes, eso ya lo cambiaría
  yo elegir que se cambie el tipo de entrenamiento dependiendo si esa semana juego el jueves,
  que será la mayoría o si esa semana juego martes que se reestructure todo, pero también
  poder elegir si hoy prefiere hacer otra cosa, otro tipo de entreno se entiende"
- **L2** (respuestas de producto): día del partido — la web de cegarraf, equipo "AC FRIO";
  informe — por ejercicio, una sola respuesta; día cambiado — se mueve a otro día de la
  semana.
- **L3** (hallazgo técnico): la fuente del calendario no es legible desde el navegador (hub
  WordPress sin API, partidos en `cegarraf.gespic.com`, calendario en PDF, sin CORS). T10
  queda dependiente de una decisión; T3 implementa el cambio manual por semana.
- **L4** (estado del motor, medido): `PlanDay` no guarda día de la semana; el entreno de hoy
  sale de `nextPlanDay` (rotación por historial), y el fútbol es una `ActivityRecord` que no
  entra en `sessions`. `evaluateBlock` calcula el avance de bloque pero nadie lo persiste, así
  que el bloque nunca avanza solo. El flujo de sesión pide peso y confirma serie a serie con
  esfuerzo opcional; no existe veredicto por ejercicio.
- **L5** (corrección del dueño): la liga es los jueves (3ª Divisió Grup B) y la copa los
  martes (grup B); la semana de copa no hay liga. Por tanto un partido por semana, nunca dos.
  La semilla ya tiene cuatro días (`PIERNA`, `TORSO A`, `TORSO B`, `FÍSICO`), pero `FÍSICO`
  es acondicionamiento genérico a tiempo (intervalos en cinta + Copenhagen corto + sóleo +
  plancha), no preparación de fútbol, y no sabe nada del partido.
- **L6** (decisión de reparto, corrige el brief de T1): el brief original de T1 pedía a la vez
  "la preparación nunca el día antes del partido" y dos repartos con la preparación el día
  antes; el worker se paró en la contradicción, con razón. La regla buena es: **la
  preparación es el último entreno antes del partido y nunca el día del partido**, y lo que
  no puede caer el día antes es la **fuerza**. El día previo es activación MD-1 (carga baja,
  prevención). Lectura rechazada: aplicar "nunca el día antes" a la preparación.
- **L7** (corrección del dueño, sustituye los repartos de L6): sábado no se entrena; la
  ventana es lunes a viernes. Repartos vigentes, uno por tipo de semana:
  liga (partido jueves) — lunes fuerza 1 (pierna), martes fuerza 2 (torso A), miércoles
  preparación, jueves partido, viernes fuerza 3 (torso B); sábado y domingo descanso;
  copa (partido martes) — lunes preparación, martes partido, miércoles fuerza 1 (torso A),
  jueves fuerza 2 (pierna), viernes fuerza 3 (torso B); sábado y domingo descanso;
  sin partido — lunes fuerza 1, martes fuerza 2, miércoles preparación, jueves fuerza 3,
  viernes descanso; sábado y domingo descanso.
  En semana de copa la pierna va el jueves y no el miércoles para no cargar las piernas el
  día después del partido; en semana de liga la pierna va el lunes, lo más lejos del partido
  que permite la ventana.
- **L8** (forma de T1, tras el bloqueo): las plantillas **no se derivan** de prioridades —
  dos conjuntos de reglas chocaban entre sí y el resultado no era reproducible. Se escriben
  como tabla por tipo de semana y los tests fijan los tres repartos de L7. Si mañana el dueño
  cambia un día, se edita la tabla, no el algoritmo.
- **L9** (T1 entregado y revisado): `src/core/engine/week-plan.ts` estampa fechas sobre
  `WEEK_TEMPLATES` y devuelve siete días con su tipo; los tests fijan los tres repartos.
  Rechazado en revisión el contrato por posición (`fuerza 1/2/3`): la posición 1 significa
  pierna el lunes en semana de liga y torso A el miércoles en semana de copa, así que quien
  llamara tenía que reordenar los ids y un descuido ponía pierna el día después del partido.
  El contrato es por rol — `leg`, `upper-a`, `upper-b`, `prep` — y una sola lista sirve para
  las tres semanas. Falta reexportarlo desde `src/core/engine/index.ts`; lo hará T4, que es
  el primer consumidor.
- **L10** (corrección de S9, detectada al implementar): T5 pedía mover el día que se deja a "otro
  hueco libre de la semana", y en las plantillas de L7 no hay ningún hueco libre: lunes a
  viernes están los cinco ocupados en semana de liga y en semana de copa. Tal como estaba, el
  cambio no habría estado disponible justo las semanas en que se juega. La semántica buena es
  la que el dueño describió: los dos días **se intercambian**, y el día que se deja ocupa el
  día de la semana que tenía el elegido. Añadida además una quinta negativa en `applySwaps`:
  un intercambio que ponga la pierna el día siguiente al partido se rechaza, y la interfaz ni
  siquiera lo ofrece.
