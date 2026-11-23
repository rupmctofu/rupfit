/*
 * Inicio — the screen that answers «¿qué toca hoy?» (odd/tasks/dark-premium-redesign.md T5).
 *
 * The composition below is the redesign's, in the order the spec asks for:
 *
 * 1. **The header** — the owner's lockup (`public/logo-lockup.svg`, never redrawn), the
 *    greeting the profile already personalises, and one control into Perfil, where every
 *    setting lives.
 * 2. **Today's workout, as the protagonist** (`HomeToday`, `today.ts`). The name, the day's
 *    own counts, the illustration that already maps to its first exercise
 *    (`todayArtwork.ts`), and the one filled action of the screen.
 * 3. **The week's progress** (`HomeWeekProgress`) — `doneCount` over the plan days the week
 *    holds, one bar, and the seven days. Every figure is the agenda's own; nothing is
 *    counted a second time.
 * 4. **The week itself** — the same seven dated rows as before (`agenda.tsx`), now below the
 *    card instead of being the whole screen. The rows keep every gesture they had: the tap
 *    into the day sheet, the drag into another day, the match's fixture sheet and its
 *    report.
 *
 * What did *not* change is the point of the task: no behaviour, no data source, no stored
 * shape. `homeViewOf` still decides everything, the screen still renders, and the primary
 * action is still the same `onStart` the row used to call — it simply moved up, into the
 * card the owner reads first.
 *
 * Two rules the file keeps:
 *
 * 1. **No `Date.now()` and no port construction.** The clock and the storage instance
 *    arrive from `AppProvider` (`src/app/providers.tsx`); a demo mounts this screen with
 *    its own fixtures through the same props.
 * 2. **No invented facts.** When the store answers nothing the card says so — a sentence,
 *    never a zero dressed as a measurement.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  Banner,
  Card,
  Chip,
  DataStrip,
  ErrorBanner,
  Icon,
  Numeral,
  PrimaryAction,
  TextButton,
  type IconName,
} from '../../design-system';
import type { StoragePort, WeekRecord } from '../../storage';
import type { MatchKind } from '../../core/engine/week-plan';
import { useAppServices } from '../../app/providers';
import type { Clock } from '../session/controller';
import { useStartSession, type StartNotice } from '../session/startSession';
import { summaryHash } from '../summary/route';
import { reportedMatchOf, weekFixtureOf, type WeekFixture } from '../week/week';
import {
  AgendaWeek,
  CHOOSE_TRIGGER_LABEL,
  ChooseDaySheet,
  agendaWeekViewOf,
  chooseOptionsOf,
  type AgendaWeekView,
  type ChooseDayOption,
} from './agenda';
import { DemoHome } from './DemoHome';
import { useFootballCapture } from './football';
import { demoFlagOf, useLocationKey } from './useHash';
import { ExerciseIllustration } from '../session/ExerciseIllustration';
import {
  homeViewOf,
  lastVolumeLineOf,
  todayRowOf,
  HOME_SESSION_WINDOW,
  type HomeActionView,
  type HomeInput,
  type HomeView,
} from './selectors';
import { todayHeroOf, weekProgressOf, type TodayHero, type WeekDayMark, type WeekProgress } from './today';
import { dayArtworkOf, type DayArtwork } from './todayArtwork';
import './home.css';

/** `?demo=inicio` — the review surface, resolved here until the router owns it. */
export const DEMO_FLAG = 'inicio';

type LoadPhase = 'loading' | 'ready' | 'failed';

interface Boot {
  readonly phase: LoadPhase;
  readonly input: HomeInput | null;
}

export interface HomeEvidence {
  /** `true` only when something outside the store proves data was there before. */
  readonly lostData: boolean;
  readonly lastExportAt: number | null;
}

/** The honest answer while no marker exists: the store cannot see a loss. */
export const NO_EVIDENCE: HomeEvidence = { lostData: false, lastExportAt: null };

/**
 * The reads Inicio performs, in the order it performs them. Every one of them goes
 * through `StoragePort`: nothing here knows that IndexedDB exists, and the demo proves
 * it by passing an in-memory port through the same props.
 */
async function readHome(
  storage: StoragePort,
  now: number,
  evidence: HomeEvidence,
): Promise<HomeInput> {
  await storage.open();
  const profile = await storage.profile.read();
  const phaseState = await storage.meta.readPhaseState();
  const inProgress = await storage.sessions.inProgress();
  const recent = await storage.sessions.recent(HOME_SESSION_WINDOW);
  const plan = await storage.plan.all();
  // T3/T5 — the week of the match, created here when this device has none. It is read
  // *and* ensured on the same path on purpose: a boot effect in `App.tsx` runs after the
  // child screen's own effect (React fires child effects first), so the record could
  // arrive after Inicio has already painted and the exchange would be missing until a
  // reload — the exact hole this fixes. A failed write answers `undefined` and the
  // rotation keeps naming the day (S5).
  const week = await currentWeekOf(storage, now);
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
  const measurements = await storage.measurements.between(weekAgo, now);
  const activities = await storage.activities.all();

  return {
    now,
    profile,
    phaseState,
    plan,
    week,
    recent,
    inProgress,
    measurements,
    activities,
    // The evicted state is a fact the *storage* tier has to supply: an empty store and a
    // first run are indistinguishable from inside IndexedDB (design-system §2.5), so the
    // marker lives outside it and arrives here as evidence. Until a caller passes one,
    // Inicio cannot see a loss and does not announce one.
    lostData: evidence.lostData,
    lastExportAt: evidence.lastExportAt,
  };
}

/**
 * T8 (S1) — whether the match of this week has already been reported.
 *
 * A read, never a second store: the football row of today's date is the week's whole
 * memory of it (`reportedMatchOf`), so a second visit does not offer the report again and
 * nothing can double-write the day (T8). Since T9 the answer is drawn on the match row,
 * which is where the report itself lives now.
 */
export function matchReportedOf(input: HomeInput): boolean {
  const row = todayRowOf(input);
  if (row === null || row.kind !== 'match') return false;
  return reportedMatchOf(input.activities, input.now);
}

/**
 * Local `YYYY-MM-DD` of the Monday of the week that contains `at`.
 *
 * The same local-date convention as `features/week/week.ts` (`mondayOfWeek`), which keeps
 * it private. `toISOString` is never used: it answers in UTC.
 */
export function mondayIsoOf(at: number): string {
  const date = new Date(at);
  const monday = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate() - ((date.getDay() + 6) % 7),
  );
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${String(monday.getFullYear())}-${pad(monday.getMonth() + 1)}-${pad(monday.getDate())}`;
}

/**
 * S11/L5 — this week's record, written once when the store has none.
 *
 * The league is every Thursday and the cup is the exception, so a week nobody has touched
 * starts as `match: 'league'`. It is a get-or-create, not a seed: a record of this week
 * comes back untouched — the fixture the owner chose survives a reload — and a record from
 * another week is replaced, because a new week starts from its own template.
 *
 * A store that cannot be read or written answers `undefined` and the rotation keeps naming
 * the day (S5): the record is a convenience, never a condition for the screen to open.
 */
export async function currentWeekOf(
  storage: StoragePort,
  now: number,
): Promise<WeekRecord | undefined> {
  const monday = mondayIsoOf(now);
  try {
    const stored = await storage.meta.readWeek();
    if (stored !== undefined && stored.monday === monday) return stored;
    const week: WeekRecord = { monday, match: 'league' };
    await storage.meta.saveWeek(week);
    return week;
  } catch {
    return undefined;
  }
}

/**
 * T3 (S7, S11) — the owner says which fixture this week has, and the week is redrawn.
 *
 * The record is the week's only memory, so flipping the fixture is one field of it: the
 * same get-or-create `currentWeekOf` performs, with the kind the owner chose. The bootstrap
 * already writes `league` (L5: the league is every Thursday, the cup is the exception), so
 * this is the loose change for the current week, never a season calendar.
 *
 * The four days follow from the fixture alone (`odd/tasks/derived-week.md` S2): the record
 * carries nothing else to keep in step, so the redraw is the whole of it. No stored session
 * is rewritten: a row that exists is history, not a plan.
 *
 * Returns `false` when the write fails, and the caller then re-reads nothing: the card
 * keeps the week it was drawn from (S7) instead of showing half a cup week.
 */
export async function saveWeekMatch(
  storage: StoragePort,
  now: number,
  match: MatchKind,
): Promise<boolean> {
  try {
    await storage.meta.saveWeek({ monday: mondayIsoOf(now), match });
    return true;
  } catch {
    return false;
  }
}

export interface HomeScreenWithPortProps {
  readonly storage: StoragePort;
  readonly clock: Clock;
  /** Supplied by the launch marker once the storage tier provides one; the demo does. */
  readonly evidence?: HomeEvidence | undefined;
  readonly onNavigate?: ((href: string) => void) | undefined;
}

export interface HomeProps {
  readonly view: HomeView;
  /** Routes are the shell's business; a demo keeps them inside the fixture (§9). */
  readonly onNavigate?: ((href: string) => void) | undefined;
  /**
   * Starts the session the row names (T5): the agenda hands the plan day of its row, and
   * a screen with no agenda hands nothing, so the rotation decides.
   */
  readonly onStart: (planDayId?: string | null) => void;
  /** True while the write is in flight: the action is disabled and says so (S3). */
  readonly starting?: boolean | undefined;
  readonly startNotice?: StartNotice | null | undefined;
  /**
   * T4 — the week, as seven dated rows over the fixture's template. Absent (an empty plan,
   * the gallery): Inicio draws no agenda and keeps its honest empty states.
   */
  readonly agendaWeek?: AgendaWeekView | null | undefined;
  /** T8 — the match of this week has already been reported: the row is done (S1). */
  readonly matchReported?: boolean | undefined;
  /**
   * T8 — reports the match of the day from its row. Absent (a screen with no port, the
   * gallery): the row still names itself and offers nothing.
   */
  readonly onReportMatch?: (() => void) | undefined;
  readonly reporting?: boolean | undefined;
  /** The failure line of the last report; `null` until one fails. */
  readonly reportNotice?: string | null | undefined;
  /**
   * T3, S12 — which fixture this week has. It is drawn on the match row now; absent (a
   * store with no record, the gallery) the week says nothing about a match (S11).
   */
  readonly fixture?: WeekFixture | null | undefined;
  /**
   * Writes the fixture the sheet chose into this week's record. Absent: the sheet is not
   * offered, and the row is not a control.
   */
  readonly onChooseFixture?: ((match: MatchKind) => void) | undefined;
}

function navigateTo(href: string): void {
  window.location.hash = href;
}

/**
 * What the background of a sheet carries while it is open (§9).
 *
 * `inert` takes the week and the lines under it out of the tab order and out of the
 * pointer's reach, and `aria-hidden` says the same to a screen reader: a dialog declared
 * `aria-modal` without both is a claim, not a modal.
 */
const MODAL_BACKGROUND = { inert: true, 'aria-hidden': true } as const;

/**
 * An empty state, said once: a glyph and the sentence, and no box.
 *
 * The design system's `EmptyState` carries no icon slot, and S3 asks for the glyph first
 * wherever it is unambiguous, so the quiet note is drawn here — the same muted meta line
 * the system uses, with the icon aligned to its first line. The icon is `aria-hidden`:
 * the sentence is the meaning, the glyph only points at it (§9).
 */
function HomeNote({ icon, children }: {
  readonly icon: IconName;
  readonly children: React.ReactNode;
}): React.ReactElement {
  return (
    <p className="home__note">
      <Icon name={icon} size={14} className="home__note-icon" />
      <span>{children}</span>
    </p>
  );
}

/**
 * The one primary action of the screen, drawn where the view says it belongs.
 *
 * It stays a single component because the same action is the one the week's row could not
 * carry: an open session left on another day (the only way back into its sets), the
 * summary of a closed day, or a store with no week at all. Since T5 of the redesign it sits
 * in the protagonist card, and it hands `start` the plan day the card names — exactly what
 * the row passed before the action moved up.
 */
/**
 * The one primary action of the screen, drawn where the view says it belongs.
 *
 * It stays a single component because the same action is the one the week's row could not
 * carry: an open session left on another day (the only way back into its sets), the
 * summary of a closed day, or a store with no week at all. Since T5 of the redesign it sits
 * in the protagonist card, and it hands `start` the plan day the card names — exactly what
 * the row passed before the action moved up.
 */
function TodayAction({
  action,
  planDayId = null,
  onStart,
  onNavigate = navigateTo,
  starting = false,
}: {
  readonly action: HomeActionView | null;
  /** The plan day of the card that names it; ignored when the action is not a start. */
  readonly planDayId?: string | null | undefined;
  readonly onStart: (planDayId?: string | null) => void;
  readonly onNavigate?: ((href: string) => void) | undefined;
  readonly starting?: boolean | undefined;
}): React.ReactElement | null {
  if (action === null) return null;
  return (
    <PrimaryAction
      icon={action.kind === 'start' || action.kind === 'resume' ? 'play' : undefined}
      className="home__primary"
      disabled={starting}
      onClick={() => {
        if (action.kind !== 'summary') {
          // `planStart` resumes the open session before it looks at the requested day, so
          // passing the card's day is safe in both branches (features/session/start.ts).
          onStart(planDayId);
          return;
        }
        onNavigate(action.sessionId === null ? '#/sesion' : summaryHash(action.sessionId));
      }}
    >
      {starting ? 'Empezando…' : action.label}
    </PrimaryAction>
  );
}

/**
 * The header's one control: Perfil, where every setting of the app lives.
 *
 * The glyph is drawn here for the reason `agenda.tsx` draws its grip and its lock: the
 * system's icon set has no settings shape and this surface is the only one that needs it.
 * It is `aria-hidden`, because the button carries the name.
 */
function SettingsGlyph(): React.ReactElement {
  return (
    <svg
      className="home__gear"
      viewBox="0 0 24 24"
      width={20}
      height={20}
      aria-hidden="true"
      focusable="false"
    >
      <path d="M4 7h8M18 7h2M4 12h2M12 12h8M4 17h8M18 17h2" />
      <circle cx="15" cy="7" r="2.4" />
      <circle cx="9" cy="12" r="2.4" />
      <circle cx="15" cy="17" r="2.4" />
    </svg>
  );
}

/** The weekday marker of the strip: done gets the check, the match its ball, the rest none. */
function WeekDayGlyph({ day }: { readonly day: WeekDayMark }): React.ReactElement | null {
  if (day.done) return <Icon name="check" size={14} />;
  if (day.kind === 'match') return <Icon name="ball" size={14} />;
  return null;
}

/**
 * Today's workout — the protagonist of the screen (odd/tasks/dark-premium-redesign.md T5).
 *
 * Everything on it is a reading of data that already exists: the title and the eyebrow come
 * from the agenda's today row, the two figures are the plan day's prescribed exercises and
 * sets, the chips are the muscle group of a compound name and the readaptation block, and
 * the picture is the illustration the app already maps to the day's first exercise
 * (`todayArtwork.ts`). The card carries the one filled action of the screen (§7.1), and it
 * is the loudest surface on it: one tonal step above the canvas, the days under it one step
 * down.
 *
 * The picture is an `<img>`/`<svg>` inside an `aria-hidden` plate: the card already names
 * the day out loud, so the drawing only points at it (§9). When the day cannot be drawn the
 * plate holds the owner's mark — the brand asset, never a recoloured or redrawn one (S2).
 */
function HomeToday({
  hero,
  artwork,
  action,
  onStart,
  onNavigate,
  onChoose,
  starting,
}: {
  readonly hero: TodayHero;
  readonly artwork: DayArtwork | null;
  readonly action: HomeActionView | null;
  readonly onStart: (planDayId?: string | null) => void;
  readonly onNavigate: (href: string) => void;
  /** Opens the list of the plan's days. Only drawn while the card can offer it. */
  readonly onChoose: () => void;
  readonly starting: boolean;
}): React.ReactElement {
  return (
    <Card className="home-today" label="Tu entreno de hoy">
      <div className="home-today__top">
        <div className="home-today__copy">
          <p className="ds-section-label home-today__eyebrow">{hero.eyebrow}</p>
          <h2 className="ds-card-title ds-card-title--large home-today__title">{hero.title}</h2>
          {hero.chips.length === 0 ? null : (
            <p className="home-today__chips">
              {hero.chips.map((chip) => (
                <Chip key={chip}>{chip}</Chip>
              ))}
            </p>
          )}
        </div>
        <span className="home-today__art" aria-hidden="true">
          {artwork === null ? (
            <img
              className="home-today__mark"
              src={`${import.meta.env.BASE_URL}logo-mark.svg`}
              alt=""
              width={40}
              height={40}
            />
          ) : (
            <ExerciseIllustration illustration={artwork.illustration} label={artwork.label} />
          )}
        </span>
      </div>

      {hero.exercises === null || hero.sets === null ? null : (
        <DataStrip
          label="Lo que pide el día"
          items={[
            { label: 'Ejercicios', value: String(hero.exercises) },
            { label: 'Series', value: String(hero.sets) },
          ]}
        />
      )}

      {hero.note === null ? null : <p className="ds-meta home-today__note">{hero.note}</p>}
      {hero.done === null ? null : (
        <p className="ds-meta home-today__note home-today__done">{hero.done}</p>
      )}

      <TodayAction
        action={action}
        planDayId={hero.planDayId}
        onStart={onStart}
        onNavigate={onNavigate}
        starting={starting}
      />

      {/* S1: the week proposes a day and the owner decides. The offer is quiet — the card
          keeps its one filled control for the day it names (§7.1). */}
      {hero.canChoose ? (
        <div className="home-today__choose">
          <TextButton onClick={onChoose}>{CHOOSE_TRIGGER_LABEL}</TextButton>
        </div>
      ) : null}
    </Card>
  );
}

/**
 * The week's progress: what is done over what the week holds, one bar, and the seven days.
 *
 * `doneCount` and the plan days are the agenda's own numbers (`today.ts`), so this block
 * cannot disagree with the rows below it. The bar is `aria-hidden` and the same fact is
 * always written next to it in words — a percentage alone is never the carrier (§9). The
 * strip is a reading, not a control: every gesture of the week is still on the rows, where
 * it already was, so a second tappable surface would be a second way to do one thing.
 */
function HomeWeekProgress({ progress }: { readonly progress: WeekProgress }): React.ReactElement {
  return (
    <section className="home-week" aria-labelledby="home-week-label">
      <div className="home-week__head">
        <h2 className="ds-section-label" id="home-week-label">
          Tu progreso
        </h2>
        <p className="home-week__figure">
          <Numeral value={String(progress.done)} size="metric-small" />
          <span className="home-week__of">{`de ${String(progress.target)} entrenos`}</span>
        </p>
      </div>

      <span className="home-week__track" aria-hidden="true">
        <span className="home-week__fill" style={{ width: `${String(progress.percent)}%` }} />
      </span>

      <ol className="home-week__days" aria-label="Días de la semana">
        {progress.days.map((day) => {
          const classes = [
            'home-week__day',
            day.today ? 'home-week__day--today' : '',
            day.done ? 'home-week__day--done' : '',
            day.kind === 'match' ? 'home-week__day--match' : '',
          ]
            .filter((part) => part !== '')
            .join(' ');
          return (
            <li key={day.weekday} className={classes}>
              <span className="home-week__initial" aria-hidden="true">
                {day.initial}
              </span>
              <span className="home-week__mark" aria-hidden="true">
                <WeekDayGlyph day={day} />
              </span>
              <span className="ds-visually-hidden">{day.label}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/**
 * The screen's body. It takes the view, never the store, so the demo and the tests of
 * the selectors describe the same screen.
 *
 * The order is the redesign's (odd/tasks/dark-premium-redesign.md T5): the header, then
 * today's workout as the protagonist, then the week's progress, then the week's own rows.
 * The last block keeps what the week cannot say — the kilos of the last session and the two
 * notices that are not decoration (a start that failed, a store that came back empty).
 */
export function HomeBody({
  view,
  agendaWeek = null,
  matchReported = false,
  fixture = null,
  onStart,
  onNavigate = navigateTo,
  starting = false,
  startNotice = null,
  onReportMatch,
  reporting = false,
  reportNotice = null,
  onChooseFixture,
}: HomeProps): React.ReactElement {
  const navigate = onNavigate;
  const hero = todayHeroOf(view);
  const progress = weekProgressOf(view);
  // The protagonist card carries the one filled action the week's today row used to carry
  // (T5); the derivation of that row is read below, as the gate for it.
  const rowAction = agendaWeek?.action ?? null;
  const lastLine = lastVolumeLineOf(view.last);
  // §9 — a sheet is `aria-modal` and traps Tab, so the screen behind it must leave the
  // accessibility tree too. The sheets are drawn inside the week (the artboard wants them
  // in the week, not over it), so this is the only place that knows both halves: the card,
  // the strip, the line and the notices go `inert` and hidden from assistive technology
  // while one is open. The shell's tab bar lives in `src/app/App.tsx`, outside this screen
  // and outside this task's edit surface; it stays reachable, which is a known gap, not a
  // silent one.
  const [sheetOpen, setSheetOpen] = useState(false);
  // S1 of `odd/tasks/choose-today-workout.md`: the list of the plan's days, open or not.
  const [chooseOpen, setChooseOpen] = useState(false);
  const background = sheetOpen || chooseOpen ? MODAL_BACKGROUND : {};
  // The offer is read from the same week the card is read from, so the list cannot name a
  // day the card would not.
  const chooseDays: readonly ChooseDayOption[] =
    agendaWeek === null ? [] : chooseOptionsOf(agendaWeek.agenda);
  const artwork = dayArtworkOf(
    view.agenda?.agenda.days.find((day) => day.today)?.planDay ?? null,
  );
  // One filled control per screen (§7.1): the card's, unless a sheet is open (its confirm
  // is then the one) or the card has nothing to offer — a store with no week at all, where
  // the loose action keeps its place below.
  //
  // The row's own derivation (`agendaWeek.action`) is the gate: it answers whether today is
  // a workout that can be started at all (not the match, not a closed day). `view.action`
  // carries the words — `Empezar entrenamiento`, `Continuar entrenamiento`, `Ver el
  // resumen` — and the session the summary needs, which is why both are read here and not
  // one of them rebuilt from the other.
  //
  // Since `odd/tasks/choose-today-workout.md` S3 the gate is the card, not the row: the card
  // may name a session started on a rest day or on the match day, and that session has to be
  // startable from here. The row's kind still decides nothing on its own (`agendaWeek.action`
  // keeps its meaning for the rows, which have no session of their own to offer).
  const canStart = hero.kind === 'workout';
  const heroAction: HomeActionView | null =
    agendaWeek === null || sheetOpen || chooseOpen || view.action === null
      ? null
      : view.action.kind === 'start' && !canStart
        ? null
        : view.action;
  const looseAction = agendaWeek === null ? view.action : null;

  return (
    <div className="home">
      <header className="home__head" {...background}>
        <div className="home__head-bar">
          {/* The owner's lockup, at header size: the brand identifies the app before the
              screen says anything else, and the wordmark is part of the asset (S2). */}
          <img
            className="home__brand"
            src={`${import.meta.env.BASE_URL}logo-lockup.svg`}
            alt="Rupfit"
            height={32}
          />
          <button
            type="button"
            className="ds-action home__settings"
            aria-label="Ajustes"
            onClick={() => navigate('#/perfil')}
          >
            <SettingsGlyph />
          </button>
        </div>
        <h1 className="home__greeting">{view.greeting}</h1>
        <p className="ds-meta">{view.dateLine}</p>
      </header>

      {/* The bad news goes above the card, not under it: a start that failed and a store
          that came back empty are states the owner has to see before he reads what to do
          today. A report that failed is said next to the row that can repeat it. */}
      {startNotice === null && reportNotice === null && !view.notice.evicted ? null : (
        <div className="home__notices" {...background}>
          {startNotice === null ? null : startNotice.tone === 'danger' ? (
            <ErrorBanner
              message={startNotice.message}
              {...(startNotice.retry ? { onRetry: onStart } : {})}
            />
          ) : (
            <Banner
              tone="warning"
              title={startNotice.message}
              {...(startNotice.profile
                ? { action: { label: 'Ir a Perfil', onClick: () => navigate('#/perfil') } }
                : {})}
            />
          )}

          {reportNotice === null ? null : <p className="ds-body">{reportNotice}</p>}

          {view.notice.evicted ? (
            <Banner
              tone="danger"
              title="Los datos guardados ya no están. Importa tu copia si la tienes."
              {...(view.notice.lastExport === null
                ? {}
                : { text: `La última copia que se exportó es del ${view.notice.lastExport}.` })}
              action={{ label: 'Importar copia', onClick: () => navigate('#/perfil') }}
            />
          ) : null}
        </div>
      )}

      <div className="home__today-wrap" {...background}>
        <HomeToday
          hero={hero}
          artwork={artwork}
          action={heroAction}
          onStart={onStart}
          onNavigate={navigate}
          onChoose={() => setChooseOpen(true)}
          starting={starting}
        />
      </div>

      {/* The list the card opens, in the same place and shape as the card's own column, so
          the sheet reads as its own surface and not as a floating layer. It starts the day
          that was tapped through the same `start` the filled action uses. */}
      {chooseOpen ? (
        <div className="home__today-wrap">
          <ChooseDaySheet
            days={chooseDays}
            onChoose={(planDayId) => {
              setChooseOpen(false);
              onStart(planDayId);
            }}
            onClose={() => setChooseOpen(false)}
          />
        </div>
      ) : null}

      {progress === null ? null : (
        <div className="home__week-wrap" {...background}>
          <HomeWeekProgress progress={progress} />
        </div>
      )}

      {/* T4, S12: the week, seven rows. The match row carries the fixture of the week and
          its report. The week is derived from the fixture's template (S2), so the rows keep
          no gesture that would write a layout (S4): they read, and the card above carries
          the one action. */}
      {agendaWeek === null ? null : (
        <AgendaWeek
          week={agendaWeek}
          onSheetChange={setSheetOpen}
          fixture={fixture}
          matchReported={matchReported}
          {...(onChooseFixture === undefined ? {} : { onChooseFixture })}
          {...(onReportMatch === undefined ? {} : { onReportMatch })}
          reporting={reporting}
          onStart={onStart}
          starting={starting}
        />
      )}

      {/* Everything a sheet covers, in one block, so one attribute hides it (T6, §9). */}
      <div className="home__below" {...background}>
        {/* The one filled control, and only when the card above could not carry it: a store
            with no week at all still has an open session to return to. */}
        <TodayAction
          action={looseAction}
          onStart={onStart}
          onNavigate={navigate}
          starting={starting}
        />

        {/* The only number under the week, and a line rather than a card. With no closed
            session the line does not exist at all. */}
        {lastLine === null ? null : <p className="ds-meta home__last-line">{lastLine}</p>}

        {view.hasHistory ? null : (
          <HomeNote icon="train">
            Todavía no hay sesiones. La primera aparecerá aquí cuando la termines.
          </HomeNote>
        )}
      </div>
    </div>
  );
}

function HomeLoading(): React.ReactElement {
  return (
    <div className="home">
      <p className="ds-meta">Abriendo tus datos…</p>
    </div>
  );
}

/** The screen with the real port: the reads, their failure and their retry. */
export function HomeScreenWithPort({
  storage,
  clock,
  evidence = NO_EVIDENCE,
  onNavigate,
}: HomeScreenWithPortProps): React.ReactElement {
  const [boot, setBoot] = useState<Boot>({ phase: 'loading', input: null });
  const [attempt, setAttempt] = useState(0);
  const start = useStartSession({ storage, clock, onNavigate });

  // One counter serves the retry, the re-read after a write and the re-read after a
  // removal. It is a read, not a navigation: whatever was written must leave the owner on
  // Inicio, on the same day.
  const refresh = useCallback(() => setAttempt((value) => value + 1), []);
  // T8/S1: the report of the match, on the day the week calls the match. It writes the
  // guarded row (`reportMatch`), so the day is informed once and the screen re-reads into
  // the done state instead of offering it again. Since T9 it is drawn on the match row.
  const report = useFootballCapture({ storage, clock, onSaved: refresh, match: true });
  // T3/S7, S12: the fixture is a fact of the week, so the sheet's choice writes the record
  // and the screen re-reads. A write that did not happen re-reads nothing, so the week never
  // shows half a cup week.
  const chooseFixture = useCallback(
    (match: MatchKind) => {
      void saveWeekMatch(storage, clock.now(), match).then(
        (written) => {
          if (written) refresh();
        },
        () => undefined,
      );
    },
    [storage, clock, refresh],
  );

  useEffect(() => {
    let cancelled = false;
    // A re-read keeps the view on screen: after `Registrar fútbol` the owner must not see
    // `Abriendo tus datos…` replace the screen he just used. Only the first boot, which
    // has nothing to keep, shows the loading line.
    setBoot((current) => (current.input === null ? { phase: 'loading', input: null } : current));
    readHome(storage, clock.now(), evidence).then(
      (input) => {
        if (!cancelled) setBoot({ phase: 'ready', input });
      },
      () => {
        if (!cancelled) setBoot({ phase: 'failed', input: null });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [storage, clock, attempt, evidence]);

  const retry = refresh;

  if (boot.phase === 'loading' || boot.input === null) {
    return boot.phase === 'failed' ? (
      <div className="home">
        <ErrorBanner message="No se pudieron abrir tus datos. Inténtalo otra vez." onRetry={retry} />
      </div>
    ) : (
      <HomeLoading />
    );
  }

  // The week is derived from the same view the body draws (T4, T6): one answer for the rows
  // and for the card above them. Nothing here needs a second pass over the input, so the
  // body is drawn from this render — the placement closure that needed one is gone (S4).
  const view = homeViewOf(boot.input);

  return (
    <HomeBody
      view={view}
      agendaWeek={agendaWeekViewOf(boot.input, view)}
      matchReported={matchReportedOf(boot.input)}
      fixture={weekFixtureOf(boot.input.week)}
      onStart={start.start}
      starting={start.busy}
      startNotice={start.notice}
      onReportMatch={report.save}
      reporting={report.busy}
      reportNotice={report.notice}
      onChooseFixture={chooseFixture}
      {...(onNavigate === undefined ? {} : { onNavigate })}
    />
  );
}

/**
 * The T5 entry for `#/inicio`.
 *
 * The shell owns `#/resumen/<id>` (`routes.tsx` `isSummaryRoute` + `summaryTargetOf`), so
 * the only review surface left here is Inicio's own demo. The summary branch that lived
 * here until T5's follow-up was unreachable the moment the route table learned `resumen`:
 * every hash it could match was already intercepted by the shell.
 */
export function HomeScreen(): React.ReactElement {
  const { storage, clock } = useAppServices();
  // The shell re-renders on a route change, not on a sub-route change, so the demo
  // surface this screen owns listens to the location itself.
  const location = useLocationKey();
  const search = location.slice(0, Math.max(0, location.indexOf('#')));
  if (demoFlagOf(search) === DEMO_FLAG) {
    return <DemoHome />;
  }

  return <HomeScreenWithPort storage={storage} clock={clock} />;
}
