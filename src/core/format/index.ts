/**
 * `src/core/format` — the presented values of the app.
 *
 * One module for the strings the design-system components render: weight, volume, a
 * delta, a duration, a date and a weekday, in Spanish. Three feature folders each kept a
 * copy of these rules (`session`, `progress` and `home`), so the same weight could be
 * written two ways on two screens, and `docs/architecture.md` §4 forbids one feature
 * importing another — the shared rule belongs here, next to the domain and the engine.
 *
 * The rules, each documented once where it is implemented:
 *
 * | # | Rule | Written by |
 * | --- | --- | --- |
 * | R1 | Decimal comma, at most two decimals | `formatWeight`, `parseWeight`, `spanishDecimals` |
 * | R2 | Thousands separator, explicitly grouped | `formatVolume` |
 * | R3 | Volume in whole kilograms | `formatVolume` |
 * | R4 | One normal space between a value and a unit inside a string; no unit when the component takes one | `formatSignedWeight`, `formatDuration`, `durationMinutes` |
 * | R5 | A delta carries its sign (`+`, U+2212) and its unit; zero carries neither | `formatSignedWeight` |
 * | R6 | A duration is whole minutes, never negative | `durationMinutes`, `formatDuration` |
 * | R7 | One locale (`es-ES`) and one capitaliser | `dates.ts` |
 * | R8 | A short month never carries its abbreviation dot | `dates.ts` |
 * | R9 | Weekday names in the three shapes the design uses (`Lunes`, `LUN`, in a date) | `dates.ts` |
 * | R10 | The separators between date parts (`6 nov`, `Miércoles 6`, `Miércoles, 8 de noviembre`, `MIÉRCOLES, 8 NOV`, `Miércoles · 18:42`) | `dates.ts` |
 * | R11 | The week starts on Monday | `formatWeekOf` |
 *
 * What is deliberately **not** here: the words. `fácil · correcto · duro · fallo`, the
 * discomfort chips, the goal and provenance words, the greeting, `aprox.`, the day-name
 * title case and the count grammar stay in the folder of the screen that says them. A
 * rule is shared; a word belongs to one screen.
 *
 * Purity: no DOM, no storage, no clock, no randomness. Instants arrive as epoch
 * milliseconds and are never produced here.
 */

export * from './dates';
export * from './numbers';
