# La caminata inclinada al final de cada día

Los cuatro días del plan terminan en 20 minutos de caminata inclinada, apuntados como una sola
entrada de tiempo: sin series, sin kilos y sin que el motor proponga carga.

## Specs

- **S1** — "También he visto que no has incluido los 20 minutos de caminata inclinada al final".
  Cada uno de los cuatro días del plan termina con la caminata inclinada.
- **S2** — Decisiones del dueño: va en **los cuatro** días, incluido MOVILIDAD Y CORE; se apunta
  como **una entrada de 20 min**; y **sin inclinación ni velocidad** — la app cuenta el tiempo y
  nada más.
- **S3** — El ejercicio ya existe en la biblioteca (`seed-ex-caminata-inclinada`, «Caminata
  inclinada», acondicionamiento): se enlaza el que hay, no se crea un duplicado ni se renombra.
- **S4** — Una entrada de tiempo no pide kilos: el motor no le propone carga, no entra en el
  cálculo de series y no aparece como ejercicio por repeticiones.
- **S5** — Una tienda que ya existe recibe la caminata sin perder nada: el refresco añade el ítem
  solo a los días sembrados, una sola vez, sin tocar filas propias ni cambiar ids.

## Tasks

- **T1** — Semilla y refresco: el ítem al final de los cuatro días, la prescripción por tiempo, y el
  refresco idempotente para tiendas existentes, con sus pruebas (termina cada día, no se duplica,
  no toca días propios, no pide kilos). Route: worker.
- **T2** — Verificación, despliegue y cierre. Route: verify.

## Log

- **L1** — "También he visto que no has incluido los 20 minutos de caminata inclinada al final."
  Comprobado: el ejercicio existía en la biblioteca y ningún día del plan lo incluía; no había
  registro de la petición en memoria ni en el repositorio.
- **L2** — Respuestas del dueño: los cuatro días; una entrada de 20 min; sin inclinación ni
  velocidad.
