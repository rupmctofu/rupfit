# ADR-0002 — Cuentas y sincronización con Supabase

- **Estado:** aceptado (2026-11-09)
- **Sustituye:** el invariante «One device, one user, no server» y la parte de NFR-8 que
  prohibía cualquier dependencia de red en tiempo de ejecución descritos en
  `docs/architecture.md` §1, §3.3 y §6.
- **Decidido por:** el propietario, al autorizar explícitamente la dependencia y este ADR.

## Contexto

Rupfit nació como una PWA de un solo dispositivo: todo el estado vive en el IndexedDB de
ese origen, el historial se congela al empezar cada sesión y ninguna acción espera red. El
propietario quiere ahora usar la app desde varios dispositivos y no depender de que Safari
no desaloje el almacenamiento de un sitio.

Lo que no cambia, porque está en el código y en las pruebas:

- El historial se escribe primero en local y la recomendación se congela al iniciar la
  sesión (I-2, I-3, I-4).
- El entrenamiento no espera red: la sesión, las series y el resumen se completan con el
  almacén local.
- La app se instala desde Safari y funciona sin conexión.

## Decisión

1. **IndexedDB sigue siendo la fuente de verdad operativa.** Ninguna pantalla lee de
   Supabase para pintar el entreno.
2. **Supabase** aporta dos cosas: `Auth` (correo y contraseña) y PostgreSQL con RLS como
   espejo remoto de las entidades existentes.
3. **La red es un efecto posterior**, no una ruta de acción: cada escritura local añade una
   operación a una cola persistente (`outbox`) en la misma transacción que el dato, y un
   servicio de sincronización la vacía cuando hay conexión.
4. **Dependencia añadida:** `@supabase/supabase-js`, única incorporación y solo para
   autenticación y acceso a PostgreSQL/PostgREST. Se justifica porque escribir el cliente
   de Auth, el refresco de tokens y el cliente PostgREST a mano es más código sensible que
   el que se añade, y ese código tendría que revisarse igual. Coste aproximado: 35 kB gzip
   sobre un shell de 170 kB; se medirá en el build y se anotará en `architecture.md` §3.3.

## Consecuencias

- `architecture.md` deja de afirmar «no server»; pasa a decir «servidor opcional, nunca en
  la ruta de acción». La PWA conserva su funcionamiento offline porque el service worker
  no cambia.
- Aparecen tres responsabilidades nuevas, cada una en su módulo: `src/cloud/auth` (sesión de
  usuario), `src/cloud/outbox` (cola local) y `src/cloud/sync` (pull/push y conflictos).
  `src/storage` sigue sin conocer la red: expone el puerto y la cola se escribe desde el
  adaptador.
- El primer inicio de sesión en un dispositivo con historial requiere una decisión
  explícita de combinación: no se sobrescribe nada de forma automática.
- Los conflictos se resuelven por registro: los datos append-only (sesiones, series) se
  fusionan por id y nunca se sobrescriben; las filas mutables comparan `updated_at` y
  conservan la versión perdedora como registro de conflicto visible en lugar de borrarla.
- Cerrar sesión con cambios pendientes no borra nada: los datos se cuarentenan bajo el
  usuario propietario y no pueden subirse a otra cuenta.

## Alternativas descartadas

- **Firebase/Firestore:** el modelo es relacional y ya está normalizado; además obliga a
  reescribir las relaciones por id que hoy garantizan la integridad del historial.
- **Backend propio:** no hay servidor, ni despliegue, ni tiempo de operación para uno; es
  exactamente lo que este proyecto evitó desde el principio.
- **Sincronización con resolución CRDT completa:** potente y enorme; el dominio ya tiene
  registros append-only y un `updated_at` por fila, y una última-escritura-gana con copia
  del perdedor cubre el caso real sin perder información.
- **Enviar cada escritura directamente a Supabase:** rompería el entreno sin conexión, que
  es el invariante que el propietario pidió conservar.
