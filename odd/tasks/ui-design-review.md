# Rupfit — revisión final de diseño UI/UX

Revisión crítica y refinamiento de la interfaz de Rupfit sobre el resultado de la primera pasada de DeepSeek.
Evidencia visual: capturas 390×844 de todas las rutas (`tools/.tmp/ui-shots.mjs`, sin dependencias, sin commitear) → `tools/.tmp/shots/`.
Solo presentación: motor de progresión, cálculos de peso, lógica de entrenamiento, IndexedDB, modelo de datos y offline quedan intactos.

## Specs

**S1 — Sesión: el peso y la serie son la unidad principal.**
El usuario lo pidió con estas palabras: «¿Puede entender qué peso debe poner? ¿Puede registrar una serie rápidamente? ¿Sabe cuánto tiene que descansar? ¿Puede modificar un peso sin perder el contexto?»
Por tanto: cada serie pendiente muestra en la misma fila su número, sus repeticiones y su peso; el control para completarla es un objetivo táctil de al menos 48×48 px con etiqueta, no un círculo anónimo; el descanso prescrito es visible en la pantalla; cambiar el peso ocurre en la misma tarjeta del ejercicio, sin navegar fuera de la sesión.

**S2 — Presupuesto de acento.**
«El verde lima debe utilizarse estratégicamente y no convertirse en un color omnipresente.»
Por tanto: el acento relleno se reserva a la acción primaria de la pantalla, al estado activo de la navegación y a un único dato que importa; los chips de equipamiento o músculo, las etiquetas de estado y los enlaces de texto no se pintan con acento; toda acción destructiva usa `--color-danger`.

**S3 — Estados vacíos y jerarquía, no prototipo.**
«El resultado debe transmitir calidad de producto terminado, no de prototipo» y «¿Hay demasiados elementos compitiendo por atención?»
Por tanto: ningún estado vacío usa borde discontinuo; como mucho un estado vacío por pantalla; ninguna frase se repite en el mismo bloque; cada pantalla tiene un único punto de atención principal identificable por tamaño o por relleno de acento.

**S4 — Iconografía y estados consistentes.**
«Comprueba: … Iconografía. Estados activos e inactivos.»
Por tanto: un solo grosor de trazo, un solo significado de relleno (relleno = activo, trazo = inactivo) y ningún glifo que se lea como marcador de posición.

**S5 — Nada de funcionalidad ni dependencias nuevas.**
«No sacrifiques funcionalidad para conseguir una pantalla más bonita.» «Conserva todos los tests y funcionalidades existentes.» «No añadas dependencias salvo que exista una justificación clara.»
Por tanto: `npm test`, `npm run typecheck` y `npm run build` pasan; `package.json` no gana dependencias; todas las rutas renderizan sin errores de consola; el flujo de registrar serie, cambiar peso y cerrar sesión sigue funcionando igual.

## Tasks

- T1 — Fundación del sistema: presupuesto de acento, iconos coherentes y un único componente de estado vacío. Specs S2, S3, S4. Ruta: inline (superficie compartida `src/design-system`). Commit: sí.
- T2 — Pantalla de sesión: fila de serie con peso visible, acción primaria que registra, copia sin duplicados. Specs S1, S2, S3. Ruta: worker (superficie `src/features/session`, `src/design-system/components/SetRow.*`). Commit: sí.
- T3 — Inicio, Entrenar, Progreso y Perfil: jerarquía por pantalla, estados vacíos unificados, acento contenido y acción destructiva en peligro. Specs S2, S3. Ruta: worker (superficie `src/features/{home,train,progress,profile}`). Commit: sí.
- T4 — Verificación: tests, typecheck, build y recaptura visual de las trece pantallas. Spec S5. Ruta: inline + `gentle-ai-verify`. Commit: sí.

## Log

**L1 — Petición original del usuario (verbatim):**
```
se terminaron todos los procesos?  ← fuera de alcance, ya resuelto

# RUPFIT — REVISIÓN FINAL DE DISEÑO UI/UX

Actúa como un director de diseño de producto senior especializado en aplicaciones móviles premium de fitness.

DeepSeek ha realizado una primera implementación del rediseño de Rupfit.

Tu trabajo ahora no es reconstruir la aplicación, sino elevar la calidad del resultado.

Quiero que revises el proyecto con criterio crítico e independiente.

## 1. TU OBJETIVO

Conseguir que Rupfit parezca una aplicación desarrollada por un equipo profesional de diseño de producto.

No quiero que aceptes automáticamente las decisiones que ha tomado el modelo anterior.

Cuestiona cada pantalla y cada interacción.

Pregúntate:
- ¿Es esta la mejor forma de presentar esta información?
- ¿Se entiende rápidamente?
- ¿Hay demasiados elementos compitiendo por atención?
- ¿Se puede resolver esta interacción de una forma más sencilla?
- ¿La jerarquía visual es correcta?
- ¿Tiene personalidad propia?
- ¿Resulta cómoda mientras el usuario está entrenando?

## 2. REVISA ESPECIALMENTE

### Jerarquía visual

Comprueba que cada pantalla tenga un punto de atención principal.

El usuario debe identificar inmediatamente:
- Dónde está.
- Qué información es importante.
- Qué acción debe realizar.

### Patrones de interacción

Revisa todos los controles.

No aceptes selectores, desplegables o botones simplemente porque sean fáciles de programar.

Decide si conviene utilizar:
- Toggle.
- Selector segmentado.
- Stepper.
- Botón de acción.
- Selector desplegable.
- Control deslizante.
- Navegación por pestañas.

Elige el patrón que mejor resuelva cada necesidad.

### Diseño de la sesión

Esta es la experiencia más importante de Rupfit.

Imagina que el usuario está en el gimnasio, tiene las manos ocupadas, está cansado y consulta el móvil entre series.

¿Puede entender qué peso debe poner?
¿Puede registrar una serie rápidamente?
¿Sabe cuánto tiene que descansar?
¿Puede modificar un peso sin perder el contexto?

Si alguna interacción resulta incómoda, propón una alternativa.

### Consistencia visual

Comprueba:
- Tipografía.
- Tamaños.
- Espaciados.
- Radios.
- Colores.
- Iconografía.
- Estados activos e inactivos.
- Botones.
- Tarjetas.
- Gráficas.
- Animaciones.

El verde lima debe utilizarse estratégicamente y no convertirse en un color omnipresente.

El dark mode debe tener profundidad y contraste, no ser simplemente una interfaz blanca invertida.

## 3. DIRECCIÓN ARTÍSTICA

Mantén la dirección visual acordada:

- Dark mode.
- Negro carbón.
- Superficies en grises oscuros.
- Verde lima como acento.
- Tipografía contundente.
- Composición limpia.
- Espacios generosos.
- Ilustraciones de ejercicios.
- Estética deportiva premium.

Busca un equilibrio entre la claridad de Apple Fitness, la funcionalidad de Strong y una identidad visual propia.

No copies literalmente ninguna de estas aplicaciones.

## 4. RESTRICCIONES

No modifiques:
- Motor de progresión.
- Cálculos de peso.
- Lógica de entrenamiento.
- Persistencia IndexedDB.
- Modelo de datos.
- Funcionamiento offline.

No sacrifiques funcionalidad para conseguir una pantalla más bonita.

No introduzcas nuevas funcionalidades que no sean necesarias para mejorar la experiencia.

No añadas dependencias salvo que exista una justificación clara.

Conserva todos los tests y funcionalidades existentes.

## 5. METODOLOGÍA

Primero inspecciona el resultado de DeepSeek.

Después:

1. Haz una revisión crítica de todas las pantallas.
2. Identifica los diez problemas de diseño más importantes.
3. Priorízalos por impacto en la experiencia.
4. Corrige los problemas directamente en el código.
5. Revisa las relaciones entre componentes para evitar inconsistencias.
6. Ejecuta tests, typecheck y build.
7. Comprueba visualmente las pantallas siempre que tengas herramientas disponibles para ello.

No hagas cambios cosméticos sin justificación.

Si una decisión de DeepSeek ya está bien resuelta, consérvala.

## 6. RESULTADO ESPERADO

Quiero una aplicación coherente, atractiva y funcional.

El resultado debe transmitir calidad de producto terminado, no de prototipo.

Al finalizar, explícame:
- Qué decisiones de diseño has cambiado.
- Qué problemas de usabilidad has corregido.
- Qué componentes has mejorado.
- Qué problemas quedan pendientes.
- Qué partes no has podido verificar visualmente.

Sé crítico. No des por bueno un diseño simplemente porque compile.
```

**L2 — Diagnóstico (evidencia: `tools/.tmp/shots/*.png`, 390×844).** Diez problemas, ordenados por impacto:

1. **La sesión no muestra el peso por serie.** Las filas dicen `SERIE 1 · 10 reps · ○`; el peso vive en otra tarjeta o detrás del botón. En el gimnasio eso obliga a memorizarlo. (07, 10)
2. **La acción primaria de la sesión es «Elegir peso», no registrar la serie.** El botón lima grande y el único botón del DOM de la sesión es el selector de peso; completar una serie es un círculo de 24 px sin etiqueta. (07)
3. **La misma información se dice tres veces.** «Sesión anterior · 90 kg × 10 · correcto», las tarjetas ÚLTIMA VEZ / PESO DE HOY y la frase «Completaste 3 series…». Y en la sesión sin historial, «Sin historial en este ejercicio» aparece como subtítulo y como primera frase del cuerpo. (10, 07)
4. **El estado vacío con borde discontinuo domina cuatro pantallas.** Cajas de guiones que gritan «wireframe», y dos apiladas en Inicio y en Progreso. Inconsistente además con Perfil, que usa un párrafo suelto. (01, 03, 06)
5. **Acento omnipresente.** Cinco chips de equipamiento en lima a la vez, «Activado», «RÉCORD», tres enlaces de texto y dos botones lima en la misma pantalla de Perfil. (06, 01)
6. **Acción destructiva en color de acento.** «Borrar todos los datos» se pinta en lima, igual que la acción primaria. (06)
7. **Iconografía incoherente.** Barra, bandera, tres rectángulos y una cara sonriente convive en la tab bar; el icono de «Progreso» se lee como marcador de posición; en las listas aparecen glifos sin significado (una «U» para jalón al pecho). (01, 02, 03, 11)
8. **La jerarquía de Inicio y Entrenar está invertida.** Inicio abre con un aviso de instalación en naranja antes que con la sesión del día; Entrenar dedica su tarjeta principal a «Nada programado» mientras las tres rutinas reales quedan debajo y repetidas con «pendiente» tres veces. (01, 02)
9. **Gráfica sin escala.** «ÚLTIMAS 6 SESIONES» son barras casi invisibles, sin eje, con una sola etiqueta y una barra diminuta sin explicación. (10)
10. **Perfil es un volcado de ajustes.** Seis secciones a peso visual similar, el botón de exportar como bloque de acento más grande de la app y la información de versión al mismo nivel que la de seguridad de los datos. (06)

**L3 — Decisiones de patrón de interacción.**
Stepper para días por semana y para ajustar peso (es un valor numérico discreto y repetido); selector segmentado para objetivo y unidades (pocas opciones excluyentes y visibles de un vistazo); switch real, no chip de estado, para el descanso automático; botón de acción primaria para registrar serie y para empezar entrenamiento; pestañas para la navegación raíz; nada de `<select>` nativo salvo donde el sistema ya lo usa y no hay alternativa mejor; sin control deslizante en peso (el usuario necesita precisión de 1,25 kg, no un gesto continuo).
