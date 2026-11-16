# Terminar el entreno desde cualquier sitio

Cuando todas las máquinas están ocupadas y solo puedes hacer la caminata, tiene que haber una
manera visible de cerrar la sesión. Hoy la hay a medias: `Terminar la sesión` vive en la barra,
pero la barra la ocupa la decisión del peso cuando aún no has decidido, y la «X» de arriba no
cierra: sale y deja la sesión abierta.

## Specs

- **S1** — "ha habido un momento que quería hacer ejercicio, estaban todas las máquinas ocupadas …
  me voy a hacer la caminata … De alguna manera que puede darle cómo a finalizar el entreno,
  porque no he visto ningún sitio donde puede ir a cómo finalizar el entreno".
- **S2** — Cerrar la sesión está **siempre** a la vista, en cualquier estado: sin decidir el peso,
  sin una sola serie, a mitad, o después de la caminata. Nunca depende de haber decidido algo.
- **S3** — El control de salida dice las dos cosas que puede hacer y no obliga a adivinar: salir y
  seguir luego (la sesión queda abierta, como hoy) o terminar la sesión (se cierra con lo que
  lleves). Son dos acciones con nombre, en el mismo sitio donde hoy está la «X».
- **S4** — Terminar no pierde nada de lo escrito: lo confirmado se guarda antes de cerrar, y una
  sesión sin series no inventa series ni volumen. El estado final lo decide la tabla de
  transiciones que ya existe, no una regla nueva.
- **S5** — Terminar pide confirmación solo cuando hay algo que perder; con la sesión vacía, un solo
  toque cierra y no interroga. Nunca un diálogo encima de una serie en curso.
- **S6** — La barra inferior no gana un cuarto botón: la decisión del peso sigue siendo lo único
  que vive ahí abajo.

## Tasks

- **T1** — La salida con dos nombres y el cierre siempre alcanzable, con sus pruebas por estado
  (sin decidir, sin series, a mitad, después de la caminata) y sin tocar la tabla de transiciones
  más allá de lo que ya dice. Route: worker.
- **T2** — Verificación, despliegue y cierre. Route: verify.

## Log

- **L1** — "he visto, por ejemplo, que ha habido un momento que quería hacer ejercicio, estaban
  todas las máquinas ocupadas. …entonces he dicho, bueno, mira, me voy a hacer la caminata… De
  alguna manera que puede darle cómo a finalizar el entreno, porque no he visto ningún sitio donde
  puede ir a cómo finalizar el entreno."
- **L2** — Medido en el código antes de escribir nada: `SessionScreen.tsx:666-671` pone la «X» de
  `Salir de la sesión` (deja la sesión reanudable, no la cierra) y `Terminar la sesión` aparece en
  `:866` y `:876`, o sea solo en las ramas en que la barra no la ocupa la decisión del peso. La
  queja del dueño es exacta.
