# Rupfit --- Design System

**Versión:** 0.1\
**Plataforma:** iOS nativa · SwiftUI\
**Dirección visual:** Dark theme con acentos lima\
**Objetivo:** interfaz deportiva, sobria y premium, optimizada para
consultar y registrar entrenamientos rápidamente.

------------------------------------------------------------------------

## 1. Principios de diseño

1.  **La sesión de entrenamiento es el centro del producto.** La
    pantalla de ejercicio debe ser la más clara y rápida de utilizar.
2.  **El lima comunica, no decora.** Reservarlo para acciones
    principales, recomendaciones, progreso positivo y estados
    seleccionados.
3.  **Jerarquía antes que decoración.** Priorizar pesos, repeticiones,
    series, tiempos y acciones.
4.  **Poca fricción.** Evitar formularios largos, navegación innecesaria
    y confirmaciones repetitivas.
5.  **Legibilidad en el gimnasio.** Contraste alto, controles grandes y
    datos reconocibles de un vistazo.
6.  **Sin gamificación infantil.** No utilizar medallas, rachas o
    rankings como recurso visual central.
7.  **Consistencia nativa.** Respetar patrones de interacción de iOS y
    utilizar SwiftUI de forma idiomática.

## 2. Paleta de color

Usar estos colores como tokens semánticos. No introducir nuevos colores
sin justificar su función.

  -----------------------------------------------------------------------
  Token                   HEX                     Uso
  ----------------------- ----------------------- -----------------------
  `background`            `#101214`               Fondo principal

  `surface`               `#171A1D`               Tarjetas y superficies
                                                  principales

  `surfaceElevated`       `#22262A`               Controles, tarjetas
                                                  secundarias y elementos
                                                  elevados

  `surfaceMuted`          `#2B3034`               Separadores destacados
                                                  y superficies de
                                                  interacción

  `lime`                  `#B8F34A`               Acción primaria,
                                                  selección, progreso y
                                                  recomendación

  `limeMuted`             `#26301B`               Fondo discreto de
                                                  estados relacionados
                                                  con lima

  `textPrimary`           `#F0F1EB`               Texto principal

  `textSecondary`         `#92969D`               Etiquetas y texto
                                                  secundario

  `textTertiary`          `#6F757C`               Información auxiliar de
                                                  baja prioridad

  `border`                `#303438`               Bordes y divisores

  `danger`                `#E47777`               Error, dolor o alerta

  `warning`               `#E8B85C`               Advertencia y atención

  `success`               `#B8F34A`               Confirmación positiva;
                                                  no crear otro verde
  -----------------------------------------------------------------------

### Reglas de color

-   El fondo general debe ser carbón, no negro absoluto.
-   Las tarjetas deben distinguirse del fondo mediante cambios sutiles
    de luminosidad, no mediante sombras fuertes.
-   El lima no debe utilizarse en párrafos largos ni como color de todo
    el texto destacado.
-   No codificar estados únicamente mediante color: acompañar con texto,
    icono o forma.
-   Para texto sobre lima, utilizar `#101214`.
-   Mantener el color lima para una acción primaria dominante por
    pantalla. Las acciones secundarias serán neutras.

## 3. Tipografía

Utilizar preferentemente la familia nativa **SF Pro** de Apple.

  Nivel       Estilo orientativo         Uso
  ----------- -------------------------- --------------------------------------
  Display     30--34 pt, bold            Título principal o dato protagonista
  Title       24--28 pt, semibold/bold   Nombre de pantalla o ejercicio
  Heading     18--20 pt, semibold        Secciones y títulos de tarjetas
  Body        16--17 pt, regular         Texto y controles
  Secondary   14--15 pt, regular         Descripciones y datos auxiliares
  Caption     11--13 pt, medium          Etiquetas, unidades y metadatos

-   Utilizar cifras tabulares para pesos, repeticiones, tiempos y
    estadísticas (`monospacedDigit()` en SwiftUI).
-   Evitar textos en mayúsculas sostenidas salvo etiquetas breves.
-   No reducir el texto funcional por debajo de 12 pt.
-   La jerarquía debe depender de tamaño, peso y contraste; no de muchos
    colores.

## 4. Espaciado, formas y profundidad

Utilizar una escala consistente basada en múltiplos de 4 pt:

  Token         Valor
  ----------- -------
  `space1`       4 pt
  `space2`       8 pt
  `space3`      12 pt
  `space4`      16 pt
  `space5`      20 pt
  `space6`      24 pt
  `space8`      32 pt
  `space10`     40 pt
  `space12`     48 pt

### Radios

-   Botones principales: 14--16 pt.
-   Tarjetas: 16--20 pt.
-   Controles compactos: 10--12 pt.
-   Elementos circulares: usar círculos solo cuando el control lo
    justifique.

### Bordes y sombras

-   Priorizar superficies planas y contraste tonal.
-   Bordes de 1 px/pt en `border` cuando ayuden a delimitar controles.
-   Evitar sombras difusas y efectos de cristal como recurso general.
-   No usar degradados salvo que exista una necesidad funcional clara.

## 5. Componentes

### Botón primario

-   Fondo `lime`.
-   Texto `background`.
-   Altura mínima recomendada: 52 pt.
-   Radio: 14--16 pt.
-   Texto semibold, breve y orientado a la acción.
-   Un único botón primario dominante por pantalla.

Ejemplos: **Empezar entrenamiento**, **Registrar serie**, **Finalizar
sesión**.

### Botón secundario

-   Fondo `surfaceElevated` o transparente.
-   Texto `textPrimary`.
-   Borde opcional `border`.
-   No competir visualmente con el botón primario.

### Tarjetas

-   Fondo `surface`.
-   Padding habitual: 16 pt.
-   Radio: 16--20 pt.
-   Separación interna suficiente para que los datos no parezcan
    amontonados.
-   No convertir cada dato individual en una tarjeta independiente.

### Chips y etiquetas

-   Usar para categorías, estados y contexto breve.
-   Estado seleccionado: fondo `lime` y texto oscuro.
-   Estado neutro: fondo `surfaceElevated` y texto secundario.
-   Evitar acumular chips en una misma pantalla.

### Campos numéricos

-   Dar prioridad visual al valor actual.
-   Mostrar unidad junto al número (kg, reps, s).
-   Permitir ajustes rápidos y edición directa.
-   No utilizar el lima para todos los números: reservarlo para el valor
    recomendado o seleccionado.

### Estados

-   Completado: lima + icono de confirmación + texto.
-   Pendiente: superficie neutra.
-   Error: `danger` + explicación concreta.
-   Molestia/dolor: advertencia visible, sin mensajes culpabilizadores.
-   Descanso activo: temporizador claro y dominante.

## 6. Navegación y arquitectura de pantallas

Navegación principal recomendada con cuatro destinos:

1.  **Inicio:** siguiente entrenamiento, resumen semanal y acceso
    rápido.
2.  **Entrenar:** sesiones y ejecución del entrenamiento.
3.  **Progreso:** fuerza, peso corporal y actividad.
4.  **Perfil:** preferencias, ejercicios, unidades, permisos y
    configuración.

Mantener la navegación persistente fuera de la sesión activa. Durante un
entrenamiento, reducir distracciones y dar prioridad a la sesión.

## 7. Pantallas clave

### Inicio

Debe responder rápidamente: - Qué entrenamiento toca. - Cuándo se
realizó el último entrenamiento. - Cómo va la semana. - Una o dos
métricas relevantes, no un panel lleno de estadísticas.

Estructura sugerida: - Cabecera con marca y fecha. - Resumen semanal
sencillo. - Tarjeta protagonista del entrenamiento siguiente. - Resumen
compacto de peso corporal o actividad. - Navegación inferior.

No mostrar datos ficticios ni estados de ejemplo en producción.

### Sesión de entrenamiento

Es la pantalla prioritaria de Rupfit.

Debe mostrar, en este orden: 1. Nombre del ejercicio y posición dentro
de la sesión. 2. Último rendimiento registrado. 3. Recomendación actual
de carga y repeticiones. 4. Carga elegida para hoy, editable con
facilidad. 5. Series previstas y registro individual de cada serie. 6.
Descanso y navegación al siguiente ejercicio.

Requisitos: - Controles táctiles grandes, con objetivos de al menos 44 ×
44 pt. - El peso y las repeticiones deben leerse sin esfuerzo. -
Registrar una serie debe requerir el mínimo de pulsaciones posible. -
Guardado automático y persistencia ante cierres inesperados. - Permitir
modificar la carga durante la sesión. - No presentar una reducción de
peso como fracaso. - No cambiar recomendaciones sin consentimiento
explícito. - Evitar modales que interrumpan continuamente el
entrenamiento.

### Descanso

-   Temporizador muy legible.
-   Acción clara para terminar o ajustar el descanso.
-   No ocupar la pantalla con estadísticas irrelevantes.
-   Si hay avisos hápticos, permitir configurarlos.

### Resumen de sesión

-   Mostrar ejercicios completados, series, volumen y duración cuando
    sean datos fiables.
-   Destacar el cumplimiento y los cambios respecto a la recomendación.
-   No juzgar el rendimiento con mensajes agresivos.
-   Permitir cerrar la sesión y consultar el historial.

### Progreso

Separar visualmente: - Fuerza: evolución de sentadilla, peso muerto y
press banca. - Cuerpo: peso y medidas. - Actividad: datos importados de
Apple Health.

Las gráficas deben tener etiquetas, unidades y rangos comprensibles. No
utilizar una gráfica si una cifra o comparación sencilla comunica mejor
la información. No presentar el IMC como indicador único de salud o
composición corporal.

## 8. Accesibilidad y usabilidad

-   Soportar Dynamic Type y tamaños de texto grandes.
-   Respetar Reduce Motion.
-   Mantener contraste suficiente en todos los estados.
-   No depender exclusivamente del color.
-   Añadir etiquetas de accesibilidad a iconos y controles.
-   Usar áreas táctiles de al menos 44 × 44 pt.
-   Respetar las preferencias de VoiceOver.
-   No utilizar animaciones largas ni imprescindibles para comprender un
    cambio.
-   Comprobar que el diseño sigue siendo usable con texto ampliado.

## 9. Movimiento y feedback

-   Animaciones breves y funcionales, aproximadamente 150--250 ms.
-   Transiciones discretas al cambiar de ejercicio o completar una
    serie.
-   Feedback háptico moderado en acciones relevantes.
-   Evitar rebotes, partículas, confeti y animaciones decorativas.
-   El feedback nunca debe retrasar el registro de una serie.

## 10. Implementación SwiftUI

Crear un sistema centralizado de tokens, evitando colores y medidas
duplicados por las vistas.

Estructura orientativa:

``` text
Rupfit/
  DesignSystem/
    Colors.swift
    Typography.swift
    Spacing.swift
    Shapes.swift
    Components/
      PrimaryButton.swift
      SecondaryButton.swift
      MetricCard.swift
      ExerciseHeader.swift
      SetRow.swift
      RestTimer.swift
```

Ejemplo orientativo de tokens de color:

``` swift
import SwiftUI

enum RupfitColors {
    static let background = Color(hex: 0x101214)
    static let surface = Color(hex: 0x171A1D)
    static let surfaceElevated = Color(hex: 0x22262A)
    static let surfaceMuted = Color(hex: 0x2B3034)

    static let lime = Color(hex: 0xB8F34A)
    static let limeMuted = Color(hex: 0x26301B)

    static let textPrimary = Color(hex: 0xF0F1EB)
    static let textSecondary = Color(hex: 0x92969D)
    static let textTertiary = Color(hex: 0x6F757C)

    static let border = Color(hex: 0x303438)
    static let danger = Color(hex: 0xE47777)
    static let warning = Color(hex: 0xE8B85C)
}

extension Color {
    init(hex: UInt, alpha: Double = 1) {
        self.init(
            .sRGB,
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255,
            opacity: alpha
        )
    }
}
```

Este código es una base de tokens, no una implementación completa. Pi
debe comprobar si el proyecto ya tiene un sistema de diseño antes de
crear o sustituir archivos. Evitar duplicar extensiones, tipos o nombres
existentes.

## 11. Criterios de aceptación visual

Una pantalla se considera coherente con Rupfit si:

-   La acción principal se identifica en menos de dos segundos.
-   Los datos importantes se leen de un vistazo.
-   El lima tiene una función semántica clara.
-   No hay más de una acción visualmente dominante.
-   El contraste y el tamaño de los controles son adecuados para uso
    durante el ejercicio.
-   La interfaz funciona con texto ampliado y VoiceOver.
-   No hay datos de ejemplo confundibles con datos reales.
-   Los componentes mantienen consistencia entre pantallas.

## 12. Instrucciones para Pi

Antes de implementar:

1.  Inspecciona el repositorio y localiza el sistema visual existente.
2.  Lee este documento y compáralo con la arquitectura actual.
3.  Propón los tokens y componentes reutilizables que falten.
4.  No reescribas pantallas ni sustituyas componentes existentes sin
    revisar sus dependencias.
5.  Implementa primero los tokens y componentes básicos.
6.  Aplica el sistema empezando por la pantalla de entrenamiento,
    después Inicio y finalmente Progreso.
7.  Comprueba los estados normal, seleccionado, completado,
    deshabilitado, error y accesibilidad.
8.  Ejecuta las pruebas y documenta cualquier desviación respecto a esta
    guía.

**Principio final:** Rupfit debe parecer una herramienta precisa y
calmada para entrenar mejor. El diseño no debe intentar motivar a base
de estímulos constantes; debe facilitar que el usuario tome buenas
decisiones y registre su entrenamiento sin fricción.
