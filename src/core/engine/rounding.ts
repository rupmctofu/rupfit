/**
 * §6 Increments, rounding and floors (docs/progression-engine.md).
 *
 * Produced weights are reachable on the implement: multiples of the per-exercise
 * increment. Increases round down (never overshoot the user's capability),
 * decreases round up (never cut more than one increment), and a decrease is never
 * allowed below one increment.
 */

/** §6: a weight counts as a multiple of the increment within 1e-6. */
const MULTIPLE_TOLERANCE = 1e-6;

/** Keeps produced weights free of IEEE-754 dust (102.49999999999999). */
function quantize(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

/**
 * Snaps a quotient that is a hair away from an integer onto that integer, so
 * floating-point noise never changes the rounding direction.
 */
function snapQuotient(quotient: number): number {
  const nearest = Math.round(quotient);

  return Math.abs(quotient - nearest) <= MULTIPLE_TOLERANCE ? nearest : quotient;
}

/** §6: is `value` a multiple of `increment` within 1e-6? */
export function isMultipleOfIncrement(value: number, increment: number): boolean {
  if (increment <= 0) {
    // Bodyweight: there is no increment to be a multiple of.
    return true;
  }

  const quotient = value / increment;

  return Math.abs(quotient - Math.round(quotient)) <= MULTIPLE_TOLERANCE;
}

/**
 * `roundDownToIncrement(value, increment)` of §6. `increment == 0` means
 * bodyweight: no weight arithmetic is performed at all.
 */
export function roundDownToIncrement(value: number, increment: number): number {
  if (increment <= 0) {
    return value;
  }

  const quotient = snapQuotient(value / increment);

  return quantize(Math.floor(quotient) * increment);
}

/** The upward counterpart of §6: a decrease must not cut more than one increment. */
export function roundUpToIncrement(value: number, increment: number): number {
  if (increment <= 0) {
    return value;
  }

  const quotient = snapQuotient(value / increment);

  return quantize(Math.ceil(quotient) * increment);
}

/** §6: one increment up, rounded down so the suggestion stays reachable. */
export function stepUp(weightKg: number, increment: number): number {
  if (increment <= 0) {
    return weightKg;
  }

  return roundDownToIncrement(weightKg + increment, increment);
}

/**
 * §6: one increment down, rounded up and floored at one increment. A decrease
 * never goes below one increment, never zero and never negative.
 */
export function stepDown(weightKg: number, increment: number): number {
  if (increment <= 0) {
    return weightKg;
  }

  const proposed = roundUpToIncrement(weightKg - increment, increment);

  return quantize(Math.max(proposed, increment));
}
