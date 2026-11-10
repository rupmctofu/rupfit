/*
 * The entry screen: the mark while the app is finding out what to show.
 *
 * It is not an invented wait. On a cold launch the shell already has to answer two
 * questions before it can paint a screen — is there a stored session, and can the local
 * store be read — and until those answers arrive it renders nothing. Asking the browser for
 * one frame of the brand is cheaper than asking the owner to look at an empty page, and it
 * gives the launch a beginning.
 *
 * Two rules keep it honest:
 *   - it never outlives the real work: `App` stops showing it as soon as the gate is ready,
 *   - it stays for a minimum short enough to feel immediate and long enough not to flash.
 * With `prefers-reduced-motion` the mark simply is there; nothing animates.
 */
export interface SplashProps {
  /** `true` while the shell still cannot decide what to draw. */
  readonly waiting: boolean;
}

/** Rendered by the shell only while it is not ready; it holds no timer of its own. */
export function Splash({ waiting }: SplashProps): React.ReactElement | null {
  if (!waiting) return null;

  return (
    <div className="splash" role="status" aria-label="Abriendo Rupfit">
      <img
        className="splash__mark"
        src={`${import.meta.env.BASE_URL}logo-mark.svg`}
        alt=""
        width={96}
        height={88}
      />
    </div>
  );
}
