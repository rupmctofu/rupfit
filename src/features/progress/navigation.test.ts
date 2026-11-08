/**
 * The two drill-downs of the Progreso tab, read from the hash.
 *
 * The shared parser in `src/app/routes.tsx` knows one segment per tab and falls back
 * to `inicio` for anything else, so the extra segment is parsed here, in the tab that
 * owns it. See `navigation.ts` for what the shared parser would need.
 */

import { describe, expect, it } from 'vitest';
import { parseProgressView, progressViewHash, PROGRESS_VIEWS } from './navigation';

describe('the Progreso views', () => {
  it('reads the summary, Historial and Peso corporal from the hash', () => {
    expect(parseProgressView('#/progreso')).toBe('summary');
    expect(parseProgressView('#/progreso/historial')).toBe('historial');
    expect(parseProgressView('#/progreso/peso')).toBe('peso');
  });

  it('tolerates the shapes a hash arrives in', () => {
    expect(parseProgressView('')).toBe('summary');
    expect(parseProgressView('#')).toBe('summary');
    expect(parseProgressView('#/')).toBe('summary');
    expect(parseProgressView('#progreso/historial')).toBe('historial');
    expect(parseProgressView('#/progreso/historial/')).toBe('historial');
    expect(parseProgressView('#/progreso/historial?x=1')).toBe('historial');
  });

  it('falls back to the summary for a tab it does not own or a segment it does not know', () => {
    expect(parseProgressView('#/inicio')).toBe('summary');
    expect(parseProgressView('#/progreso/otro')).toBe('summary');
    expect(parseProgressView('#/progreso/historial/12')).toBe('summary');
  });

  it('writes the hash it reads, so a relaunch lands on the same view', () => {
    for (const view of PROGRESS_VIEWS) {
      expect(parseProgressView(progressViewHash(view))).toBe(view);
    }
    expect(progressViewHash('summary')).toBe('#/progreso');
    expect(progressViewHash('historial')).toBe('#/progreso/historial');
    expect(progressViewHash('peso')).toBe('#/progreso/peso');
  });
});
