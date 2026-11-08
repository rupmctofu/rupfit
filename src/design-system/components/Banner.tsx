/*
 * Inline banners (§7.6, §7.8): the phase banner, the error banner and the three
 * platform states.
 *
 * All of them are inline and non-blocking. Nothing here opens an alert, a confirm,
 * a prompt or a modal for a recoverable condition (§7.8, §11): an error during a set
 * says its line, offers `Reintentar` and leaves the session on screen.
 *
 * The platform states map onto `Banner`:
 *   evicted        -> tone="danger",  title="Los datos guardados ya no están. Importa tu copia si la tienes."
 *   not installed  -> tone="warning", title="Guarda Rupfit en la pantalla de inicio para que Safari no borre tus datos."
 *   update ready   -> tone="warning", title="Hay una versión nueva. Se aplicará al terminar la sesión."
 */

import { Icon } from './Icon';
import '../foundation.css';
import './banner.css';

export type BannerTone = 'info' | 'warning' | 'danger' | 'success';

export interface BannerAction {
  readonly label: string;
  readonly onClick: () => void;
  readonly disabled?: boolean | undefined;
}

export interface BannerProps {
  readonly title: string;
  readonly text?: string | undefined;
  readonly tone?: BannerTone | undefined;
  readonly action?: BannerAction | undefined;
  /** A disclosure that opens the detail (the block criteria of a phase, for example). */
  readonly onOpen?: (() => void) | undefined;
  readonly openLabel?: string | undefined;
  readonly className?: string | undefined;
}

export function Banner({
  title,
  text,
  tone = 'info',
  action,
  onOpen,
  openLabel = 'Ver detalles',
  className,
}: BannerProps): React.ReactElement {
  const classes = ['ds-banner', `ds-banner--${tone}`, className ?? ''].filter((p) => p !== '').join(' ');

  return (
    <div className={classes}>
      <div className="ds-banner__body">
        <p className="ds-banner__title">{title}</p>
        {text === undefined ? null : <p className="ds-banner__text">{text}</p>}
      </div>
      {action === undefined ? null : (
        <button
          type="button"
          className="ds-action ds-banner__action"
          onClick={action.onClick}
          disabled={action.disabled ?? false}
        >
          {action.label}
        </button>
      )}
      {onOpen === undefined ? null : (
        <button
          type="button"
          className="ds-action ds-banner__open"
          onClick={onOpen}
          aria-label={openLabel}
        >
          <Icon name="chevronRight" size={20} />
        </button>
      )}
    </div>
  );
}

export interface ErrorBannerProps {
  readonly message: string;
  readonly onRetry?: (() => void) | undefined;
  readonly retryLabel?: string | undefined;
  readonly className?: string | undefined;
}

/** `No se pudo guardar la serie 2. Sigue en la pantalla.` + `Reintentar`. */
export function ErrorBanner({
  message,
  onRetry,
  retryLabel = 'Reintentar',
  className,
}: ErrorBannerProps): React.ReactElement {
  const classes = ['ds-banner', className ?? ''].filter((p) => p !== '').join(' ');

  return (
    <div className={classes} role="status">
      <div className="ds-banner__body">
        <p className="ds-banner__title ds-banner__title--danger">{message}</p>
      </div>
      {onRetry === undefined ? null : (
        <button type="button" className="ds-action ds-banner__action ds-banner__action--danger" onClick={onRetry}>
          {retryLabel}
        </button>
      )}
    </div>
  );
}

export interface PhaseBannerProps {
  /** 1-based week of the readaptation block. */
  readonly week: number;
  readonly totalWeeks: number;
  /** One line of explanation, shown only when it is useful. */
  readonly explanation?: string | undefined;
  readonly onOpen?: (() => void) | undefined;
  readonly openLabel?: string | undefined;
}

/**
 * Readaptation only: `Readaptación · semana 2 de 4`. Deliberately quiet — raised
 * surface, no accent fill. It informs, it does not alarm (§7.6).
 */
export function PhaseBanner({
  week,
  totalWeeks,
  explanation,
  onOpen,
  openLabel = 'Ver los criterios del bloque',
}: PhaseBannerProps): React.ReactElement {
  return (
    <div className="ds-banner ds-banner--phase">
      <div className="ds-banner__body">
        <p className="ds-banner__title ds-banner__title--phase">
          <Icon name="calendar" size={14} />
          {`Readaptación · semana ${week} de ${totalWeeks}`}
        </p>
        {explanation === undefined ? null : <p className="ds-banner__text">{explanation}</p>}
      </div>
      {onOpen === undefined ? null : (
        <button
          type="button"
          className="ds-action ds-banner__open"
          onClick={onOpen}
          aria-label={openLabel}
        >
          <Icon name="chevronRight" size={20} />
        </button>
      )}
    </div>
  );
}
