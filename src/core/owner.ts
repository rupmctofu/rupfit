/**
 * El nombre que la app enseña (spec S4, `odd/tasks/home-feedback.md`).
 *
 * Es una constante y no un campo del perfil por una razón, no por comodidad: el dueño pidió
 * su nombre y pidió que no se pudiera cambiar —«pon rup y que no sea editable»—, así que un
 * formulario que lo editara sería el botón que deshace la petición. Un valor que nadie
 * escribe tampoco necesita guardarse: un campo guardado pide migración, copia y nube para
 * moverse de sitio, y a cambio solo ofrece la forma de volver a estropearlo.
 *
 * Vive en `src/core` porque es la única capa que todas las features pueden importar: Inicio
 * saluda con él (`src/features/home/selectors.ts`) y Perfil lo imprime
 * (`src/features/profile/ProfileScreen.tsx`), y una feature no importa otra
 * (`docs/architecture.md` §4). `src/core` no importa nada para leerlo.
 *
 * `profile.displayName` **no se toca**: sigue en el modelo, en la copia de seguridad y en la
 * nube, y ninguna fila ya guardada se reescribe. Esto decide qué se *enseña*, nunca qué se
 * *guarda*; por eso no hay migración, ni refresco, ni escritura de arranque.
 */
export const OWNER_NAME = 'Rup';
