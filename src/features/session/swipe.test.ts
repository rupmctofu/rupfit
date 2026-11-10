import { describe, expect, it } from 'vitest';
import { SWIPE_THRESHOLD, swipeDirection } from './swipe';

describe('the swipe of the session hero', () => {
  it('reads a leftward drag as the next exercise', () => {
    expect(swipeDirection({ x: 300, y: 200 }, { x: 300 - SWIPE_THRESHOLD - 1, y: 204 })).toBe(
      'next',
    );
  });

  it('reads a rightward drag as the previous exercise', () => {
    expect(swipeDirection({ x: 100, y: 200 }, { x: 100 + SWIPE_THRESHOLD + 1, y: 196 })).toBe(
      'previous',
    );
  });

  it('ignores a drag shorter than the threshold', () => {
    expect(swipeDirection({ x: 200, y: 200 }, { x: 200 - (SWIPE_THRESHOLD - 1), y: 200 })).toBe(
      null,
    );
  });

  it('ignores a mostly vertical drag, which is a page scroll', () => {
    expect(swipeDirection({ x: 200, y: 100 }, { x: 200 - SWIPE_THRESHOLD - 20, y: 400 })).toBe(
      null,
    );
  });

  it('ignores a tap that does not move', () => {
    expect(swipeDirection({ x: 200, y: 200 }, { x: 200, y: 200 })).toBe(null);
  });
});
