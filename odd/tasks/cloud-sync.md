# Rupfit — cuentas y sincronización en la nube (Supabase)

Local-first con Supabase detrás: IndexedDB sigue siendo la fuente de verdad y el entreno nunca espera red.
La cola de salida, la resolución de conflictos y la separación de usuarios se diseñan para no perder jamás historial.

## Specs

**S1 — Local primero (verbatim):**
«Mantén IndexedDB como almacenamiento local principal para las operaciones de entrenamiento.» «Rupfit guarda inmediatamente cada cambio en IndexedDB. Los cambios se incorporan a una cola de sincronización.» «Un fallo de sincronización nunca debe impedir guardar un entrenamiento localmente.» «No conviertas todas las operaciones de la aplicación en llamadas directas a Supabase.»

**S2 — Autenticación (verbatim):**
«Registro mediante correo electrónico. Inicio de sesión. Cierre de sesión. Recuperación de contraseña. Persistencia de sesión. Restauración de sesión al abrir la aplicación.» Sin Google ni Apple. «El usuario debe poder consultar desde la aplicación qué cuenta está utilizando.»

**S3 — Seguridad (verbatim):**
«Implementa Row Level Security (RLS) en todas las tablas que contengan información personal.» «Cada usuario solo debe poder consultar, crear, modificar y eliminar sus propios datos.» «No incluyas nunca la `service_role key` en el código frontend.» «Crear o actualiza `.env.example`, sin introducir credenciales reales.»

**S4 — Sincronización (verbatim):**
«Comprueba si existen datos locales.» «Consulta los datos remotos asociados a su cuenta.» «Si existen datos locales y remotos, aplica una estrategia de combinación segura. No sobrescribir automáticamente datos existentes.» «Sincroniza únicamente los registros nuevos o modificados.» «Evita ejecutar sincronizaciones simultáneas.»

**S5 — Cola offline y conflictos (verbatim):**
«Implementa una cola persistente de operaciones pendientes en IndexedDB» con crear, actualizar, eliminar, reintentos, recuperación tras cerrar, y «Prevención de operaciones duplicadas». «No utilices simplemente el último dato recibido para sobrescribir todo lo anterior.» «conserva la información y aplica una estrategia explícita para evitar pérdidas.»

**S6 — Separación de usuarios (verbatim):**
«Los datos de mi cuenta no deben quedar accesibles desde otra cuenta.» «No deben mezclarse los datos locales de dos usuarios.» «No elimines automáticamente los datos locales al cerrar sesión si todavía contienen cambios pendientes.»

**S7 — Migración del historial (verbatim):**
«No borrar datos originales.» «No modificar innecesariamente los identificadores existentes.» «No duplicar entrenamientos.» «Poder reanudar una migración interrumpida.» «Mostrar al usuario si la importación ha terminado correctamente.»

**S8 — Interfaz de cuenta (verbatim):**
«Estado de autenticación. Correo electrónico de la cuenta. Estado de sincronización. Última sincronización correcta. Número de cambios pendientes. Indicador de error cuando la sincronización falle. Acción para sincronizar manualmente. Cerrar sesión.» Estados: sincronizado, sin conexión, sincronizando, cambios pendientes, error.

**S9 — Límites (verbatim):**
«No modifiques: la programación de entrenamiento, el motor de progresión, los ejercicios y sus prescripciones, la navegación de entrenamiento […] el diseño de las pantallas de entrenamiento.»

**S10 — Identidad visual (verbatim):**
«modo oscuro, superficies grises y acento verde lima». Decisión del propietario (2026-11-09, posterior): el acento es **lila**; este punto se mantiene con el tema vigente.

**S11 — Arquitectura (decisión del propietario, verbatim):**
«Autoriza dependencia y ADR; prepara todo el andamiaje». Autoriza `@supabase/supabase-js` y el ADR que sustituye «One device, one user, no server».

## Tasks

- T1 — ADR que sustituye el invariante «sin servidor» y justifica la dependencia con su coste en gzip; actualización de `architecture.md` §3.3 y NFR-8. Specs S11. Ruta: inline. Commit: sí.
- T2 — Esquema PostgreSQL, RLS, índices de idempotencia y tipos TypeScript. Specs S3, S4. Ruta: worker (`supabase/`, `docs/`). Commit: sí.
- T3 — Cola `outbox` persistente e idempotente. Specs S1, S5. Hecho: `src/cloud/outbox.ts`, con la base `rupfit-cloud` aparte de la del historial (ver L5).
- T4 — Servicio de sincronización: push por lotes en orden de dependencias, pull por marcador, un solo vuelo, reintentos acotados y conflictos conservados. Specs S4, S5. Hecho: `src/cloud/sync.ts`, 19 pruebas con remoto simulado.
- T5 — Autenticación y sección de cuenta con estados. Specs S2, S8. Ruta: worker. Commit: sí.
- T6 — Migración del historial local y cuarentena al cerrar sesión con pendientes. Specs S6, S7. Ruta: inline + worker. Commit: sí.
- T7 — Tests de los doce escenarios con Supabase simulado; typecheck, build y comprobaciones funcionales. Specs S4-S7. Ruta: inline + verifier. Commit: sí.

## Log

**L1 — Petición original del usuario (verbatim, extracto):**
```
Quiero incorporar a Rupfit un sistema de cuentas de usuario y sincronización en la nube para que mis progresos de entrenamiento no dependan exclusivamente del navegador Safari o del dispositivo donde utilizo la aplicación. La tecnología elegida es Supabase (PostgreSQL + Supabase Auth).
```

**L2 — Inspección previa.** IndexedDB guarda `sessions`, `exerciseSessions` y `sets` anidados, `exercises`, `planDays`/`planItems`, `profile`, `bodyMeasurements`, `activities` y `meta` (fase, respuesta de almacenamiento, marcador de arranque). No existe ninguna ruta que espere red: `docs/architecture.md:13,15,346-349` lo declara vinculante. Se conserva: Rupfit sigue escribiendo en local y la red es un efecto posterior.

**L3 — Decisión del propietario.** Autoriza `@supabase/supabase-js` y el ADR, sin credenciales todavía: el andamiaje se prepara completo y `.env.example` documenta lo que falta.

**L4 — Alcance respetado.** No se toca programación, motor, ejercicios, prescripciones ni la navegación de entrenamiento: la sincronización se apoya en las mismas entidades y no cambia su forma.

**L5 — La cola vive en su propia base.** `src/cloud/syncDb.ts` abre `rupfit-cloud` en lugar de añadir almacenes a la base del historial. Así la cola no sube `DB_VERSION` del almacén que el entreno necesita, un fallo de la cola no puede impedir abrir el historial, y cerrar sesión limpia la cola sin tocar una sola sesión.

**L6 — Reglas de fusión, explícitas.** Las tablas append-only (sesiones, ejercicios de sesión, series, pesajes, actividades) se fusionan por id y **nunca** se sobrescriben: si el remoto trae una versión distinta se conserva la local y se registra el conflicto. Las mutables (perfil, plan, fase, ejercicios) comparan `updatedAt` con desempate por `rev` y guardan la versión perdedora como conflicto visible. El marcador de una tabla solo avanza si todas sus filas se decidieron **y** se aplicaron: un fallo de escritura deja la fila para la siguiente pasada en lugar de perderla.

**L7 — Procedimiento de la migración del historial (T6), decidido antes de escribirlo.** Lo que existe en el dispositivo se escribe antes del primer push y nunca se borra:

1. **Sellar, no reescribir.** Cada fila local existente recibe `sync.rev` y `sync.updatedAt` derivados de su propio instante de dominio (la sesión de `scheduledDate`, el pesaje de `date`, la actividad de `date`; perfil, plan y fase con la marca del marcador de arranque). Los identificadores no se tocan, así que el historial se queda unido a su ejercicio y a su sesión.
2. **Encolar una sola vez.** El sellado encola un `upsert` por fila en la misma transacción; la clave `tabla:rowId:rev` hace que reintentar la migración no duplique nada.
3. **Reanudable por diseño.** El estado de la migración vive en `meta` (`migration:<userId>:<paso>`), y el paso avanza solo cuando la cola de ese paso quedó vacía. Cerrar la app a mitad y volver a entrar continúa donde estaba, sin repetir y sin perder.
4. **Idempotente en el servidor.** El `upsert` por `id` con `user_id` del token hace que una segunda subida de la misma fila sea la misma fila.
5. **Nada se borra.** El historial local se conserva íntegro después de subir; el usuario ve «N sesiones, M pesajes, K actividades subidas» y la app sigue funcionando sin red.

**Cuarentena al cerrar sesión (S6)**, también decidido: si la cola tiene operaciones pendientes, el cierre de sesión no borra ni mezcla. Los datos locales se marcan con el `user_id` que los escribió (`meta:owner`) y la cola queda congelada con ese dueño; al iniciar sesión otra cuenta, la app **no** sube esas operaciones y ofrece dos salidas explícitas: iniciar sesión de nuevo con la cuenta dueña para terminarlas, o exportar la copia y descartarlas. Nunca se elimina historial como efecto secundario de un cambio de cuenta.
