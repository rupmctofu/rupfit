/**
 * The vector budget probe: what an SVG has to be before it can join the exercise art.
 *
 * The app draws a variant as a handful of polylines on a 120 × 120 grid, one ink plus one
 * accent, in `currentColor` (see `pictograms.ts`). Anything else — a traced bitmap, a
 * downloaded icon set, a generated vector — is measured here first, because "looks like a
 * vector" and "fits the budget" are different questions and only the second one ships.
 *
 * Pure: a string in, numbers and reasons out. No I/O, no parser dependency; the counting
 * is a deliberate approximation of the XML (paths, drawing commands, distinct paints), and
 * it is documented as such instead of pretending to be a full parser.
 *
 * The thresholds are the ones the owner and the session screen were built on:
 * <= 20 KB, <= 40 nodes, one ink plus one accent, no gradient, no embedded raster.
 */

export const VECTOR_BUDGET = {
  /** Bytes of source: the whole exercise set has to stay cacheable. */
  maxBytes: 20 * 1024,
  /** Drawing commands across every shape: our figures use a couple of dozen at most. */
  maxNodes: 40,
  /** One ink plus one accent. A traced bitmap arrives with dozens. */
  maxPaintValues: 2,
} as const;

export interface SvgReport {
  readonly bytes: number;
  /** `[minX, minY, width, height]`, or null when the element has no viewBox. */
  readonly viewBox: readonly [number, number, number, number] | null;
  /** `<path>` elements. */
  readonly paths: number;
  /** Every element that draws something: path, rect, circle, ellipse, line, polyline, polygon. */
  readonly shapes: number;
  /** Points the path is made of: an M, L, H or V is one, a curve is three. */
  readonly nodes: number;
  /** Distinct `fill`, `stroke` and `stop-color` values, lowercased, `none` excluded. */
  readonly paintValues: readonly string[];
  readonly hasGradient: boolean;
  /** An `<image>` or any `base64` payload: a bitmap wearing a vector's clothes. */
  readonly hasRaster: boolean;
  /** Grouping elements, which a flat drawing does not need. */
  readonly groups: number;
}

export interface VectorVerdict {
  readonly ok: boolean;
  /** One sentence per failed rule, in the order the rules are checked. */
  readonly reasons: readonly string[];
}

const SHAPE_TAGS = ['path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon'] as const;

/**
 * Coordinates a command commits to. A curve is three points, not one — counting commands
 * would have made a traced file look a third as heavy as it is, which is exactly the
 * mistake this probe exists to prevent.
 */
const POINTS_PER_COMMAND: Readonly<Record<string, number>> = {
  M: 1,
  L: 1,
  T: 1,
  H: 1,
  V: 1,
  A: 1,
  S: 2,
  Q: 2,
  C: 3,
};

function nodesIn(pathData: string): number {
  let nodes = 0;
  for (const command of pathData) {
    nodes += POINTS_PER_COMMAND[command.toUpperCase()] ?? 0;
  }
  return nodes;
}

function countTag(markup: string, tag: string): number {
  const matches = markup.match(new RegExp(`<${tag}[\\s/>]`, 'gi'));
  return matches === null ? 0 : matches.length;
}

function paintValuesOf(markup: string): readonly string[] {
  const seen = new Set<string>();
  for (const match of markup.matchAll(/\b(fill|stroke|stop-color)\s*=\s*"([^"]*)"/gi)) {
    const value = (match[2] ?? '').trim().toLowerCase();
    if (value === '' || value === 'none' || value === 'currentcolor') continue;
    seen.add(value);
  }
  return [...seen].sort();
}

function viewBoxOf(markup: string): readonly [number, number, number, number] | null {
  const match = /viewBox\s*=\s*"([^"]*)"/i.exec(markup);
  if (match === null) return null;
  const parts = (match[1] ?? '')
    .trim()
    .split(/[\s,]+/)
    .map((part) => Number(part));
  if (parts.length !== 4 || parts.some((value) => !Number.isFinite(value))) return null;
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0, parts[3] ?? 0];
}

/** Counts what an SVG is made of. Approximation by design; see the module comment. */
export function inspectSvg(markup: string): SvgReport {
  const shapeCounts = SHAPE_TAGS.map((tag) => countTag(markup, tag));
  let nodes = 0;
  for (const match of markup.matchAll(/\bd\s*=\s*"([^"]*)"/gi)) {
    nodes += nodesIn(match[1] ?? '');
  }

  return {
    bytes: markup.length,
    viewBox: viewBoxOf(markup),
    paths: shapeCounts[0] ?? 0,
    shapes: shapeCounts.reduce((total, count) => total + count, 0),
    nodes,
    paintValues: paintValuesOf(markup),
    hasGradient: /<(linear|radial)Gradient[\s/>]/i.test(markup),
    hasRaster: /<image[\s/>]/i.test(markup) || /base64/i.test(markup),
    groups: countTag(markup, 'g'),
  };
}

const KB = 1024;

/** Why this drawing cannot be one of ours. Empty reasons means it can. */
export function vectorVerdict(report: SvgReport): VectorVerdict {
  const reasons: string[] = [];

  if (report.bytes > VECTOR_BUDGET.maxBytes) {
    reasons.push(
      `weighs ${(report.bytes / KB).toFixed(1)} KB, budget ${String(VECTOR_BUDGET.maxBytes / KB)} KB`,
    );
  }
  if (report.nodes > VECTOR_BUDGET.maxNodes) {
    reasons.push(`has ${String(report.nodes)} nodes, budget ${String(VECTOR_BUDGET.maxNodes)}`);
  }
  if (report.paintValues.length > VECTOR_BUDGET.maxPaintValues) {
    reasons.push(
      `paints with ${String(report.paintValues.length)} values, budget ${String(VECTOR_BUDGET.maxPaintValues)}`,
    );
  }
  if (report.hasGradient) reasons.push('carries a gradient, and ours are flat ink');
  if (report.hasRaster) reasons.push('embeds a bitmap, so it only looks like a vector');
  if (report.viewBox === null) reasons.push('has no viewBox, so it cannot scale to the grid');

  return { ok: reasons.length === 0, reasons };
}

/** One line per report, for a test log or a terminal. */
export function describeReport(name: string, report: SvgReport): string {
  const verdict = vectorVerdict(report);
  const size = `${(report.bytes / KB).toFixed(1)} KB`;
  const paints = String(report.paintValues.length);
  const head = `${name}: ${size} · ${String(report.shapes)} shapes (${String(report.paths)} paths) · ${String(report.nodes)} nodes · ${paints} paints`;
  return verdict.ok ? `${head} → FITS` : `${head} → REJECTED: ${verdict.reasons.join('; ')}`;
}
