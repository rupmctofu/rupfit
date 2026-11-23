# Elegir el entreno de hoy desde Inicio

La tarjeta de hoy deja de ser una imposición: ofrece los cuatro entrenos del plan y el dueño
escoge el que va a hacer. Nada se guarda por fecha, así que el resto de la semana sigue
proponiendo lo mismo. Especificación, tareas y registro de decisiones.

## Specs

**S1 — La tarjeta de hoy ofrece cambiar el entreno.** Cuando hoy no tiene sesión, la tarjeta
de hoy de Inicio lleva una acción secundaria que abre la lista de los entrenos del plan;
tocar uno arranca esa sesión por el camino que ya existe (`start.start(planDayId)` →
`planStart`), sin tocar el plan ni la plantilla semanal.

**S2 — «sin arrastrar nada».** No se escribe ninguna preferencia por fecha: ni `WeekLayout`,
ni un mapa día→entreno, ni un campo nuevo en `PlanDay`. El estado por fecha sigue siendo la
sesión, que ya existe.

**S3 — La tarjeta nombra lo que de verdad se entrena hoy.** Si hoy hay una sesión
—programada, en curso o cerrada— de **cualquier** día del plan, la tarjeta de hoy es esa
sesión (su `dayNameSnapshot`, sus números, su estado), aunque la plantilla ponga otro día en
este weekday. Hoy `todayCardOf` solo mira las sesiones del día que la fila trae, así que un
entreno elegido fuera de su sitio no se vería.

**S4 — La fila de la semana sigue siendo la propuesta del plan, y no miente.** La fila del
weekday conserva el día que la plantilla pone; un entreno hecho fuera de su sitio no cierra
la fila de su propio weekday antes de su fecha (la guarda `dateText <= todayText` de
`weekAgendaOf` se mantiene) ni cambia el orden de la rotación.

**S5 — Se ofrece siempre que hoy no tenga sesión.** Día de entreno, día de descanso, día de
partido y día vacío (un día del plan sin ejercicios) ofrecen elegir; una tienda sin plan no
ofrece nada, porque no hay lista que enseñar. Una sesión de hoy —aunque esté cerrada—
retira la acción: lo que hoy toca ya está dicho.

**S6 — Las palabras son las que ya existen.** La lista usa el nombre formateado del día
(`formatDayName`), sus chips de foco (`dayFocus`) y sus números (`countsTextOf`,
`6 ejercicios · 18 series`). No se inventa vocabulario nuevo ni se duplica el formateo.

**S7 — El documento deja de decir que no existe.** La fila «Editing the routine» del README y
la invariante de `docs/architecture.md` sobre «una sola respuesta para lo que hoy lleva» se
corrigen para decir lo que ahora es verdad: la fila responde *qué propone el plan*; la
tarjeta responde *qué se está entrenando hoy*.

## Tasks

| ID | Spec | Qué | Commit |
| --- | --- | --- | --- |
| T1 | S1–S7 | Este documento y el seguimiento | — |
| T2 | S3 | Rojo: la tarjeta de hoy sigue a la sesión de hoy aunque sea de otro día del plan, y en día de descanso y de partido | — |
| T3 | S3 | Rojo: el modelo de la tarjeta expone cuándo se puede elegir (`canChoose`) según S5 | — |
| T4 | S3, S5 | `todayCardOf` / `todayHeroOf`: la sesión de hoy manda; `canChoose` | — |
| T5 | S1, S6 | Rojo: Inicio abre la lista y arranca el día tocado; la lista no aparece si hoy ya tiene sesión | — |
| T6 | S1, S6 | `ChooseDaySheet` en `home/agenda.tsx` + acción en `HomeScreen.tsx` | — |
| T7 | S4 | Rojo + verde: la fila del weekday no cambia y no se cierra antes de su fecha | — |
| T8 | S7 | README y `docs/architecture.md` | — |
| T9 | — | Verificación completa (tipos + 1131+ tests), veredicto por spec | — |
| T10 | — | Despliegue en producción, según pide el dueño | — |

## Log

**L1 (dueño, verbatim):**
> quiero poder cambiar el entreno cuando quiera. hoy por ejemplo pone pierna. quiero hacer pecho.

**L2 (decisión del dueño, opción elegida «Elijo cada día lo que entreno»):**
> Inicio deja de imponer un orden: me muestra los entrenos del plan y yo escojo cuál hago, cada día, sin arrastrar nada.

**L3 (dueño, verbatim):**
> y despliega cuando esté listo

**L4 (evidencia, arqueología):** lo retirado en su día fue un **intercambio** que escribía un
`WeekLayout` guardado (`odd/tasks/derived-week.md`, L1-L3: «a control that does nothing must
not be drawn»). Lo que se construye aquí no guarda colocación: solo arranca la sesión del día
elegido, así que no revive el mecanismo retirado ni compite con la semana derivada.
