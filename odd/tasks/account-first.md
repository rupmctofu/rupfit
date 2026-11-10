# Rupfit — entrar con cuenta y quitar el texto prescindible

Con la nube en marcha, la app pasa a pedir la cuenta al entrar y a tomar el nombre de ahí; el resto es una purga de texto prescindible.
Lo que se quita es narración, no información: nada que impida entrenar o recuperar datos.

## Specs

**S1 — Entrar con cuenta, nombre desde la cuenta (verbatim):**
«Si hay un logueo con cuenta de correo no sería mejor que nada más entrar te pidiera loguearte y ya eligieras un nombre de usuario […] si me logueo con Roberto […] que directamente entre si ponga o la Rub y que ya no se cambie el nombre porque ya es el mío, es Rub.»

**S2 — Fuera el texto prescindible (verbatim):**
«hay un montón de texto que es prescindible como lo de Guarda Rupfit en la pantalla de inicio para que Safari no borre tus datos esto tendría que estar fuera lo de la descripción de fútbol cincuenta minutos dos partes de todo esto fuera todo lo que sea prescindible fuera información que no aporte nada fuera».

**S3 — Iconos antes que frases (verbatim):**
«lo que te he dicho iconitos en vez de textos siempre que se pueda».

**S4 — Sin romper nada (verbatim):** el entrenamiento sigue sin esperar red, los datos locales no se tocan, la rotación y el motor no cambian, y sin cuenta se puede seguir entrenando.

**S5 — La pérdida real sigue avisando (decisión del implementador):** el aviso de instalación desaparece de Inicio; el aviso de datos expulsados (`danger`) se queda, porque ahí sí se ha perdido algo. El texto prescindible se va; el que evita una pérdida, no.

## Tasks

- T1 — Entrada con cuenta: con proyecto configurado, la app pide iniciar sesión antes de mostrar Inicio, con una salida secundaria «Seguir sin cuenta» para no romper el modo local. Specs S1, S4. Ruta: worker (`src/app/`, `src/features/onboarding/`). Commit: sí.
- T2 — Nombre desde la cuenta: al entrar se rellena desde el correo y deja de editarse en Perfil; se muestra como dato, no como campo. Specs S1. Ruta: worker (`src/cloud/auth.ts`, `src/features/profile/`). Commit: sí.
- T3 — Purga de texto en Inicio y fútbol: fuera el aviso de instalación de Inicio, fuera la descripción de 50 minutos, iconos donde había frase. Specs S2, S3, S5. Ruta: worker (`src/features/home/`). Commit: sí.
- T4 — Verificación: tests, typecheck, build, capturas de la entrada, Inicio y Perfil. Specs S4. Ruta: inline. Commit: sí.
- T5 — Pantalla de entrada con el logo mientras la app arranca. Specs S1 (entrada), S3 (marca), S4 (no romper nada). Ruta: inline (`src/app/`), después de T1 para no solapar superficies. Commit: sí.

## Log

**L1 — Petición original del usuario (verbatim):**
```
Si hay un logueo con cuenta de correo no sería mejor que nada más entrar te pidiera loguearte y ya eligieras un nombre de usuario, buen radiano, si me logueo con Roberto Puntow. Que directamente entre si ponga o la Rub y que ya no se cambie el nombre porque ya es el mío, es Rub. Por otro lado, hay un montón de texto que es prescindible como lo de Guarda Rupfit en la pantalla de inicio para que Safari no borre tus datos esto tendría que estar fuera lo de la descripción de fútbol cincuenta minutos dos partes de todo esto fuera todo lo que sea prescindible fuera información que no aporte nada fuera y lo que te he dicho iconitos en vez de textos siempre que se pueda
```

**L2 — Tensión resuelta.** Pedir cuenta al entrar choca con «offline es el modo de operación» (ADR-0002). Se implementa la entrada con cuenta **con una salida «Seguir sin cuenta»**: la app pide la cuenta, pero negarse no te deja sin entrenar ni sin tus datos. Si no hay proyecto configurado, no se pide nada.

**L3 — Nombre.** El nombre sale del correo (la parte anterior a la arroba, en minúsculas, sin puntos ni guiones) salvo que la cuenta traiga uno propio en sus metadatos. Se guarda en el perfil al entrar y el campo deja de ser editable; sigue enviándose en las copias de seguridad.

**L4 — Pantalla de entrada.** Al abrir, la app enseña la marca mientras resuelve lo que ya tiene que resolver (la sesión guardada y el `storage` local), y desaparece en cuanto hay algo que enseñar. Tres reglas: nunca es una espera inventada con temporizador largo; tiene un mínimo visible corto para no parpadear; y respeta `prefers-reduced-motion` (sin animación, solo la marca). No sustituye a la pantalla de cuenta: si hay que pedir sesión, la entrada da paso a esa.
