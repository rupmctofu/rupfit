/**
 * The swipe of the session hero: a horizontal drag moves one exercise.
 *
 * Pure and framework-free so the rule can be tested in the node environment the suite
 * runs in: no DOM, no React, just two points and a threshold. The caller owns what a
 * direction means — here it is the same move the pager chevrons make.
 *
 * The rule has three refusals, and each one prevents a real mis-gesture:
 *
 * - **Below the threshold** is a tap, not a swipe, so the buttons inside the screen keep
 *   working.
 * - **Not dominant horizontally** is a page scroll: a thumb going down the sheet drags a
 *   few pixels sideways, and reading that as a swipe would jump exercises while scrolling.
 * - **Zero displacement** stays `null` for the same reason.
 */

export interface SwipePoint {
  readonly x: number;
  readonly y: number;
}

export type SwipeDirection = 'next' | 'previous' | null;

/** How far, in CSS pixels, a horizontal drag must travel to count. */
export const SWIPE_THRESHOLD = 48;

/**
 * `next` when the drag goes left, `previous` when it goes right, `null` when it is not a
 * swipe. Left is next because that is the direction the sheet advances.
 */
export function swipeDirection(
  start: SwipePoint,
  end: SwipePoint,
  threshold: number = SWIPE_THRESHOLD,
): SwipeDirection {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (Math.abs(dx) < threshold) return null;
  if (Math.abs(dx) <= Math.abs(dy)) return null;
  return dx < 0 ? 'next' : 'previous';
}
