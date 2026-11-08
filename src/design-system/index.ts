/**
 * Rupfit design system: props in, elements out.
 *
 * Nothing here fetches, reads storage, owns state or imports from `src/storage`,
 * `src/features` or `src/app` (architecture §4). Behaviour arrives from the caller,
 * which is why every handler prop is optional and a component degrades to a
 * read-only rendering when it is absent.
 *
 * Stylesheets: `tokens.css` and `foundation.css` are the only global files, and each
 * component imports the stylesheet it needs. `main.tsx` keeps importing
 * `tokens.css`; no other wiring is required.
 */

export type { IconName, IconProps } from './components/Icon';
export { Icon } from './components/Icon';

export type { PrimaryActionProps, TextButtonProps } from './components/PrimaryAction';
export { PrimaryAction, TextButton } from './components/PrimaryAction';

export type { CardPadding, CardProps, SectionLabelProps } from './components/Card';
export { Card, SectionLabel } from './components/Card';

export type { ChipProps, ChipTone } from './components/Chip';
export { Chip } from './components/Chip';

export type { DataRowProps, DataRowState, DataRowTone } from './components/DataRow';
export { DataRow } from './components/DataRow';

export type {
  CompareTileProps,
  DataStripItem,
  DataStripProps,
  DeltaTone,
  MetricTileProps,
} from './components/Metric';
export { CompareTile, DataStrip, MetricTile } from './components/Metric';

export type { NumeralProps, NumeralSize, NumeralTone } from './components/Numeral';
export { Numeral } from './components/Numeral';

export type { StepperProps, StepperShape } from './components/Stepper';
export { Stepper } from './components/Stepper';

export type { Discomfort, Effort, SetRowProps, SetState } from './components/SetRow';
export { DISCOMFORT_OPTIONS, EFFORT_OPTIONS, SetRow } from './components/SetRow';

export type {
  LoadDecisionBarProps,
  WeightKeypadProps,
  WeightSummaryProps,
} from './components/WeightEntry';
export { KEYPAD_KEYS, LoadDecisionBar, WeightKeypad, WeightSummary } from './components/WeightEntry';

export type { RestState, RestTimerBarProps } from './components/RestTimerBar';
export { RestTimerBar } from './components/RestTimerBar';

export type { EmptyStateAction, EmptyStateProps } from './components/EmptyState';
export { EmptyState } from './components/EmptyState';

export type {
  BannerAction,
  BannerProps,
  BannerTone,
  ErrorBannerProps,
  PhaseBannerProps,
} from './components/Banner';
export { Banner, ErrorBanner, PhaseBanner } from './components/Banner';

export type { PagerProps } from './components/Pager';
export { Pager } from './components/Pager';

export type {
  BarChartProps,
  ChartFrameProps,
  ChartLegendItem,
  ChartTableRow,
  LineChartProps,
  SparklineProps,
} from './components/Charts';
export { BarChart, ChartFrame, LineChart, Sparkline } from './components/Charts';
