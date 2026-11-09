/**
 * Presented numbers: weight, volume, a delta and a duration, written the Spanish way.
 *
 * This is the only place the app decides a decimal separator, a thousands separator,
 * the space before a unit or how a fraction becomes a whole number. The rules come from
 * `docs/design-system.md` §5.2 and from `Numeral.tsx`, which takes a **string** and never
 * re-parses a number: whatever a component shows was written here.
 *
 * Pure TypeScript: no DOM, no storage, no clock, no randomness. Every function takes a
 * stored number and returns either the string a component renders or the bare number a
 * component is given side by side with its own unit.
 */

/**
 * R1 — the decimal comma, at most two decimals.
 *
 * A weight is rounded to two decimals and the decimal point becomes `,`: `92,5`, `90`,
 * `0`. The string is built from the rounded number with one substitution rather than
 * from `Intl.NumberFormat`, because a weight must not acquire a thousands separator
 * (`1.234,5 kg` is not a weight anyone lifts) and must not change with the ICU version
 * of the runtime. §5.2 asks for a separator coming from the locale, rendered as text;
 * for Spanish that text is a comma.
 *
 * The rounding is `Math.round` on hundredths: half away from zero for positives, and the
 * trailing zeros of a whole number disappear because they were never written.
 */
export function formatWeight(kg: number): string {
  return String(Math.round(kg * 100) / 100).replace('.', ',');
}

/**
 * The inverse of R1 — what the keypad typed, as a weight.
 *
 * The comma is accepted because that is the key the user pressed; anything that is not a
 * plain non-negative decimal (`9,2,5`, `abc`, `-5`, empty) is not a weight and returns
 * `null`, so the caller decides what to say instead of formatting half a number.
 */
export function parseWeight(text: string): number | null {
  const normalised = text.trim().replace(',', '.');
  if (normalised === '' || !/^\d+(\.\d+)?$/.test(normalised)) return null;
  const value = Number(normalised);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

/**
 * R2 and R3 — the thousands separator and whole kilograms, for a volume.
 *
 * `1845` → `1.845`, `8280` → `8.280`, `900` → `900`. `useGrouping: true` is explicit
 * because Spanish suppresses the separator below five digits by default
 * (`minimumGroupingDigits: 2`), and the artboards write `6.900`. `maximumFractionDigits:
 * 0` plus `Math.round` keep a volume in whole kilograms: nobody counts grams of tonnage.
 */
export function formatVolume(kg: number): string {
  return new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0, useGrouping: true }).format(
    Math.round(kg),
  );
}

/**
 * R5 — a delta is a word with its sign, never colour alone (§7.7).
 *
 * `+7,5 kg`, `−1,2 kg`, `0 kg`. The minus is U+2212 as the artboard draws it, and a delta
 * that rounds to nothing keeps no sign at all: `0 kg`, not `+0 kg`.
 *
 * R4 applies: the unit is part of the string, because a delta is rendered inside a chip
 * (`Metric.tsx`) and not through `Numeral`.
 */
export function formatSignedWeight(kg: number): string {
  if (Math.round(kg * 100) === 0) return '0 kg';
  const sign = kg > 0 ? '+' : '−';
  return `${sign}${formatWeight(Math.abs(kg))} kg`;
}

/**
 * R6 — a duration in whole minutes, never negative.
 *
 * `52 * 60_000` → `52`. A duration the store can prove is `endedAt − startedAt`; a
 * negative result means a clock anomaly, not a session that ran backwards, so it is
 * written as `0` instead of `−2 min`.
 */
export function durationMinutes(ms: number): number {
  return ms <= 0 ? 0 : Math.round(ms / 60_000);
}

/**
 * R4 and R6 together — `52 min`, the duration written with its unit.
 *
 * R4 — the unit spacing rule: a unit that is part of a string follows **one normal
 * space** (`52 min`, `+7,5 kg`). When the unit is the component's business the string
 * carries no unit and no trailing space: `Numeral` renders `unit` in its own element with
 * a `0.14em` gap (`.ds-numeral__unit`), so `durationMinutes` exists next to this function
 * for the cells that pass `min` themselves. Passing `Numeral` a value with the unit
 * already inside it is how a screen ends up writing `52 min min`.
 */
export function formatDuration(ms: number): string {
  return `${durationMinutes(ms)} min`;
}

/**
 * R1 applied to a sentence instead of a number.
 *
 * The reason templates of `src/core/engine/reasons.ts` interpolate a stored value with
 * `String(value)`, so they carry a decimal point (`Subimos a 92.5 kg`). Spanish copy uses
 * a comma; the screen is the layer that decides how that sentence is written.
 */
export function spanishDecimals(text: string): string {
  return text.replace(/(\d)\.(\d)/g, '$1,$2');
}
