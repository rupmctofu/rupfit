/*
 * Cards and the section label that introduces them (§7.2, §7.7).
 *
 * A card is a surface with a hairline border — no shadow, no gradient, no card
 * inside a card (§6.2, §11). Padding is a token, and a card never has a fixed
 * height, so a large text size makes it taller instead of clipping it (§5.3).
 */

import '../foundation.css';
import './cards.css';

export type CardPadding = 'default' | 'dense' | 'list' | 'none';

export interface CardProps {
  readonly children: React.ReactNode;
  readonly padding?: CardPadding | undefined;
  readonly className?: string | undefined;
  /** A group label for the region when the card holds a named block. */
  readonly label?: string | undefined;
}

export function Card({ children, padding = 'default', className, label }: CardProps): React.ReactElement {
  const classes = ['ds-card', `ds-card--${padding}`, className ?? ''].filter((p) => p !== '').join(' ');

  return (
    <div className={classes} {...(label === undefined ? {} : { role: 'group', 'aria-label': label })}>
      {children}
    </div>
  );
}

export interface SectionLabelProps {
  readonly children: React.ReactNode;
  readonly icon?: React.ReactNode | undefined;
  readonly className?: string | undefined;
}

/** `ÚLTIMA SESIÓN · LUNES`, `ESTA SEMANA`: 13 px, uppercase, secondary, 0.5 px tracking. */
export function SectionLabel({ children, icon, className }: SectionLabelProps): React.ReactElement {
  const classes = ['ds-section-label', className ?? ''].filter((p) => p !== '').join(' ');

  return (
    <h2 className={classes}>
      {icon}
      <span>{children}</span>
    </h2>
  );
}
