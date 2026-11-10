import { describe, expect, it } from 'vitest';
import { VECTOR_BUDGET, inspectSvg, vectorVerdict } from './vector-budget';

/** What one of ours looks like after scaling to the 120 × 120 grid: a few polylines. */
const OURS = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
  <g stroke="currentColor" fill="none" stroke-width="4.5">
    <polyline points="60,36 60,62" />
    <polyline points="58,42 42,42" />
    <polyline points="60,62 47,82" />
  </g>
  <circle cx="60" cy="28" r="6" fill="currentColor" />
</svg>`;

/** What a traced bitmap looks like: one giant path, dozens of fills, a gradient. */
const TRACED = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  <defs><linearGradient id="g"><stop offset="0" stop-color="#27203B"/><stop offset="1" stop-color="#594A7A"/></linearGradient></defs>
  <path fill="url(#g)" d="M10 10 C20 20 30 30 40 40 L50 50 Z"/>
  <path fill="#352F3D" d="M11 11 C21 21 31 31 41 41 Z"/>
  <path fill="#3A3440" d="M12 12 L22 22 Z"/>
</svg>`;

describe('the vector budget', () => {
  it('accepts a flat drawing on the pictogram grid', () => {
    const report = inspectSvg(OURS);
    expect(vectorVerdict(report)).toEqual({ ok: true, reasons: [] });
    expect(report.viewBox).toEqual([0, 0, 120, 120]);
    // `currentColor` is not a hard-coded paint: it follows the theme, so it costs nothing.
    expect(report.paintValues).toEqual([]);
  });

  it('rejects a traced bitmap and names every rule it broke', () => {
    const report = inspectSvg(TRACED);
    const verdict = vectorVerdict(report);
    expect(verdict.ok).toBe(false);
    expect(report.hasGradient).toBe(true);
    expect(verdict.reasons.some((reason) => reason.includes('gradient'))).toBe(true);
    expect(verdict.reasons.some((reason) => reason.includes('paints with 5'))).toBe(true);
  });

  it('counts the drawing commands that cost the browser work', () => {
    const report = inspectSvg(TRACED);
    // Five points: M C L on the gradient path, M C on the second, M L on the third.
    expect(report.nodes).toBe(11);
    expect(report.paths).toBe(3);
  });

  it('catches a bitmap hidden inside an SVG', () => {
    const report = inspectSvg('<svg viewBox="0 0 10 10"><image href="data:image/png;base64,AAA"/></svg>');
    expect(report.hasRaster).toBe(true);
    expect(vectorVerdict(report).reasons.some((reason) => reason.includes('bitmap'))).toBe(true);
  });

  it('rejects a file over the byte budget', () => {
    const padded = `<svg viewBox="0 0 120 120"><path d="M0 0 L1 1"/>${' '.repeat(VECTOR_BUDGET.maxBytes)}</svg>`;
    const verdict = vectorVerdict(inspectSvg(padded));
    expect(verdict.ok).toBe(false);
    expect(verdict.reasons.some((reason) => reason.includes('weighs'))).toBe(true);
  });

  it('refuses a drawing with no viewBox, because it cannot scale to the grid', () => {
    const verdict = vectorVerdict(inspectSvg('<svg><path d="M0 0 L1 1"/></svg>'));
    expect(verdict.reasons).toContain('has no viewBox, so it cannot scale to the grid');
  });
});
