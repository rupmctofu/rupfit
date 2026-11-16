/*
 * Inicio — the screen that answers "what do I do now?" (design-system §8).
 *
 * The reference direction (design/rupfit-inspiration/01-reference-flow.html) fixes the
 * order and this file follows it: a top row with the mark and the week, the title
 * «¡Vamos a entrenar!», and one protagonist block for the day that carries its own
 * action. The personalised name and the date stay on screen under the title, smaller
 * than the action; the last session, the body weight, the activity (the manual football
 * capture, the rows it writes and the imported count) and the empty states move below
 * it. The one platform notice Inicio still tells is the loss of the stored data: it sits
 * under the day, never above it. The install advisory belongs to Perfil alone (S2, S5).
 *
 * Three rules of the hierarchy, all of them the owner's words (odd/tasks/home-hierarchy):
 *
 * 1. The mark goes top-left and bigger (S1); the week is a graphic in the top-right
 * corner with no sentence next to it (S2).
 * 2. Today's session is *one* card — the day, its numbers and the start action inside
 * it (S3) — with no label above it and no narration around it (S4). The primary action
 * is the only accent fill of the screen, wherever it is drawn (design-system §7.1).
 * 3. A recorded activity is deleted through its bin, which asks first (S5). The
 * confirmation is inline state, never a browser dialog.
 *
 * The file holds no decision worth testing: `homeViewOf` decides, this renders. Two
 * rules it does keep:
 *
 * 1. **No `Date.now()` and no port construction.** The clock and the storage instance
 *    arrive from `AppProvider` (`src/app/providers.tsx`); a demo mounts this screen with
 *    its own fixtures through the same props.
 * 2. **No invented facts.** When the store answers nothing the screen shows the empty
 *    version — a dashed card saying so — never a zero dressed as a measurement.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  Banner,
  Card,
  Chip,
  ErrorBanner,
  Icon,
  MetricTile,
  PrimaryAction,
  SectionLabel,
  Sparkline,
  TextButton,
  type IconName,
} from '../../design-system';
import type { StoragePort, WeekLayout, WeekRecord } from '../../storage';
import type { MatchKind } from '../../core/engine/week-plan';
import { useAppServices } from '../../app/providers';
import type { Clock } from '../session/controller';
import { useStartSession, type StartNotice } from '../session/startSession';
import { summaryHash } from '../summary/route';
import { weekFixtureOf, weekTodayOf, type WeekFixture, type WeekToday } from '../week/week';
import {
  AgendaWeek,
  PLACEMENT_FAILED_COPY,
  agendaWeekViewOf,
  writePlacement,
  type AgendaWeekView,
} from './agenda';
import { DemoHome } from './DemoHome';
import { ACTIVITY_DELETE_COPY, useActivityDeletion, type ActivityDeletionState } from './deletion';
import { FOOTBALL_DURATION_MINUTES, useFootballCapture } from './football';
import { demoFlagOf, useLocationKey } from './useHash';
import { formatDayName } from './format';
import {
  homeViewOf,
  HOME_SESSION_WINDOW,
  type ActivityEntryView,
  type HomeActionView,
  type HomeInput,
  type HomeView,
} from './selectors';
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
  // T4 — the owner's fixed layout, read next to the other reads. A store that cannot
  // answer it (no record yet, a read the tier refuses) leaves the week on the template:
  // the layout is the owner's decision, never a condition for the screen to open.
  const weekLayout = await readWeekLayoutOf(storage);
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
  const measurements = await storage.measurements.between(weekAgo, now);
  const activities = await storage.activities.all();

  return {
    now,
    profile,
    phaseState,
    plan,
    week,
    weekLayout,
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
 * T8 (S1, S12) — the match and the rest day, the two days the week names and the gym does
 * not fill. `homeViewOf` already refuses to invent a training day for either of them, but
 * it says the same `emptyDay` a day without exercises gives: the screen asks the week
 * which off day it is, so the match never reads «ese día todavía no tiene ejercicios».
 */
export type OffDay = 'match' | 'rest';

/** The match or the rest day the stored week names for today, or `null` on a training day. */
export function offDayOf(input: HomeInput): OffDay | null {
  const kind = todayOf(input)?.day.kind;
  return kind === 'match' || kind === 'rest' ? kind : null;
}

/**
 * T8 (S1) — whether the match of this week has already been reported.
 *
 * A read, never a second store: the football row of today's date is the week's whole
 * memory of it (`reportedMatchOf`), so a second visit does not offer the report again and
 * nothing can double-write the day (T8).
 */
export function matchReportedOf(input: HomeInput): boolean {
  return todayOf(input)?.matchReported ?? false;
}

/** Today as the stored week names it, or `null` when the rotation answers (T4). */
function todayOf(input: HomeInput): WeekToday | null {
  if (input.week === undefined) return null;
  return weekTodayOf({
    now: input.now,
    plan: input.plan,
    week: input.week,
    activities: input.activities,
  });
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
 * starts as `match: 'league'` with no exchange. It is a get-or-create, not a seed: a
 * record of this week comes back untouched — a swap survives a reload — and a record from
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
    const week: WeekRecord = { monday, match: 'league', swaps: [] };
    await storage.meta.saveWeek(week);
    return week;
  } catch {
    return undefined;
  }
}

/**
 * T4 (S4, S5) — the owner's fixed week layout, or `undefined` while the template rules.
 *
 * A read that fails is the same answer as no record: the template materialises the week,
 * which is exactly what a fresh install shows, and the screen is never held hostage by a
 * meta row it could live without.
 */
async function readWeekLayoutOf(storage: StoragePort): Promise<WeekLayout | undefined> {
  try {
    return await storage.meta.readWeekLayout();
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
 * **The exchange list goes with the layout.** A swap exchanges two days of *this* layout —
 * Monday and Wednesday trade in a league week for reasons a cup week does not share (L7) —
 * so it is cleared at the same time: kept across the flip it would put a day on a weekday
 * the new template never asked for. No stored session is rewritten: a row that exists is
 * history, not a plan.
 *
 * Returns `false` when the write fails, and the caller then re-reads nothing: the card
 * keeps the layout it was drawn from (S7) instead of showing half a cup week.
 */
export async function saveWeekMatch(
  storage: StoragePort,
  now: number,
  match: MatchKind,
): Promise<boolean> {
  try {
    await storage.meta.saveWeek({ monday: mondayIsoOf(now), match, swaps: [] });
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
   * the card without an agenda hands nothing, so the rotation decides.
   */
  readonly onStart: (planDayId?: string | null) => void;
  /** True while the write is in flight: the action is disabled and says so (S3). */
  readonly starting?: boolean | undefined;
  readonly startNotice?: StartNotice | null | undefined;
  /** Writes the manual football activity. Absent: the capture is not offered. */
  readonly onRecordFootball?: (() => void) | undefined;
  readonly recording?: boolean | undefined;
  readonly footballNotice?: string | null | undefined;
  /**
   * T4 — the week, as seven dated rows over the effective layout. Absent (an empty plan,
   * the gallery): Inicio draws no agenda and keeps its honest empty states.
   */
  readonly agendaWeek?: AgendaWeekView | null | undefined;
  /** Writes the placement the drag or the sheet made. Absent: nothing is saved. */
  readonly onPlace?: ((planDayId: string, weekday: number) => void) | undefined;
  /** The sentence of a write that failed; the week on screen is still the previous one. */
  readonly placementNotice?: string | null | undefined;
  readonly onRetryPlacement?: (() => void) | undefined;
  /** T8 — the match or the rest day the week names, so the card can name it too. */
  readonly offDay?: OffDay | null | undefined;
  /** T8 — the match of this week has already been reported: the day is done (S1). */
  readonly matchReported?: boolean | undefined;
  /**
   * T8 — reports the match of the day. Absent (a screen with no port, the gallery): the
   * day still names itself and offers nothing.
   */
  readonly onReportMatch?: (() => void) | undefined;
  readonly reporting?: boolean | undefined;
  /** The failure line of the last report; `null` until one fails. */
  readonly reportNotice?: string | null | undefined;
  /**
   * T3 — which fixture this week has and the way to flip it. Absent (a store with no
   * record, the gallery): the card says nothing about a match (S11).
   */
  readonly fixture?: WeekFixture | null | undefined;
  /** Writes the flipped fixture into this week's record. Absent: the action is not offered. */
  readonly onFlipWeek?: ((match: MatchKind) => void) | undefined;
  /**
   * The bin and its inline question (S5). Absent: the recorded rows are read-only, which
   * is what a screen with no port behind it (and the gallery) needs.
   */
  readonly deletion?: ActivityDeletionState | undefined;
}

function navigateTo(href: string): void {
  window.location.hash = href;
}

/** The screen's own title: the reference direction's first line, not the greeting. */
export const HOME_TITLE = '¡Vamos a entrenar!';

/** The blocks below draw the view; only the body owns the actions. */
interface HomeViewOnly {
  readonly view: HomeView;
}

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
 * It stays a single component because the same action appears inside the day's card when
 * there is a day, and alone when there is not (a session left open on another day is
 * still resumable, and that is the only way back into its sets).
 */
function TodayAction({
  action,
  onStart,
  onNavigate = navigateTo,
  starting = false,
}: {
  readonly action: HomeActionView | null;
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
          onStart();
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
 * T3 (S7, S11) — the fixture of this week, and the quiet action that flips it.
 *
 * `Liga · jueves` is the week's shape in the owner's words (L5); next to it,
 * `Esta semana jugamos copa` writes the other kind into the record so the whole week
 * restructures. Neither takes the accent fill: the day's action is the only one (§7.1).
 * A week with no fixture renders no line — no match day to name (S11) — but keeps the
 * action, so the owner can always say that this one is the cup.
 */
function WeekFixtureLine({
  fixture = null,
  onFlipWeek,
}: {
  readonly fixture?: WeekFixture | null | undefined;
  readonly onFlipWeek?: ((match: MatchKind) => void) | undefined;
}): React.ReactElement | null {
  if (fixture === null) return null;
  return (
    <div className="home__fixture">
      {fixture.label === null ? null : <span className="ds-meta">{fixture.label}</span>}
      {onFlipWeek === undefined ? null : (
        <TextButton align="start" className="home__fixture-flip" onClick={() => onFlipWeek(fixture.next)}>
          {fixture.action}
        </TextButton>
      )}
    </div>
  );
}

/**
 * Today's session as one protagonist block (S3, S4).
 *
 * The card holds the day, its short detail and the prescribed sets — the owner's «hoy
 * toca esto» — and nothing sits above it: the old `Tu próxima sesión` label narrated what
 * the title already says. What remains are the facts the store can prove: the phase, the
 * prescribed sets, the completed line, and the one chip that says a preview is not a
 * stored session yet.
 *
 * T4 moved the start of the day onto the agenda's today row, which is where the week is
 * read: the card draws `action` only when the row could not carry it (an open session
 * from another day, a closed session's summary), so the screen still has exactly one
 * filled violet control (§7.1). The match day and the rest day keep their own card: the
 * match is reported, never trained, and a rest day asks nothing of the gym.
 */
function TodayBlock({
  view,
  action = null,
  offDay = null,
  matchReported = false,
  fixture = null,
  onStart,
  onNavigate = navigateTo,
  onReportMatch,
  reporting = false,
  reportNotice = null,
  onFlipWeek,
  starting = false,
}: HomeViewOnly & {
  /** The action the agenda's today row could not carry, if any. */
  readonly action?: HomeActionView | null | undefined;
  readonly offDay?: OffDay | null | undefined;
  readonly matchReported?: boolean | undefined;
  readonly fixture?: WeekFixture | null | undefined;
  readonly onStart: (planDayId?: string | null) => void;
  readonly onNavigate?: ((href: string) => void) | undefined;
  readonly onReportMatch?: (() => void) | undefined;
  readonly reporting?: boolean | undefined;
  readonly reportNotice?: string | null | undefined;
  readonly onFlipWeek?: ((match: MatchKind) => void) | undefined;
  readonly starting?: boolean | undefined;
}): React.ReactElement {
  const today = view.today;
  // A preview is the rotation's next day, not a stored session. The old caption said it
  // in a sentence; a chip says the same thing in one word (S2).
  const preview = today !== null && today.state === 'preview';

  if (today === null) {
    return (
      <section className="home__section">
        {/* S1, S12: the match is reported, never trained, and a rest day asks nothing of
            the gym. Neither one is «sin ejercicios», which is about a plan day not filled. */}
        {offDay === 'match' ? (
          <Card>
            <div className="home__card-head">
              <Icon name="heart" size={20} className="home__card-icon" />
              <h2 className="ds-card-title">Hoy es el día del partido</h2>
            </div>
            {/* S1: the fifth day of the week is informed, not trained. Once it has been
                informed there is nothing left to do on it, and the card says so instead
                of offering the action again (T8). */}
            {matchReported ? (
              <p className="ds-body ds-body--muted">Partido informado. Hoy no hay entreno.</p>
            ) : (
              <>
                <p className="ds-body ds-body--muted">
                  Hoy se juega: el partido se informa, no se entrena. Dímelo cuando lo hayas jugado.
                </p>
                {onReportMatch === undefined ? null : (
                  <PrimaryAction
                    icon="check"
                    className="home__primary"
                    disabled={reporting}
                    onClick={onReportMatch}
                  >
                    {reporting ? 'Informando…' : 'Informar el partido'}
                  </PrimaryAction>
                )}
                {reportNotice === null ? null : <p className="ds-body">{reportNotice}</p>}
              </>
            )}
          </Card>
        ) : offDay === 'rest' ? (
          <Card>
            <div className="home__card-head">
              <Icon name="moon" size={20} className="home__card-icon" />
              <h2 className="ds-card-title">Hoy descansas</h2>
            </div>
            <p className="ds-body ds-body--muted">
              No hay entreno hoy. El descanso también es parte de la semana.
            </p>
          </Card>
        ) : view.nothingToday === 'emptyDay' ? (
          <Card>
            <div className="home__card-head">
              <Icon name="dumbbell" size={20} className="home__card-icon" />
              <h2 className="ds-card-title">Sin ejercicios</h2>
            </div>
            <p className="ds-body ds-body--muted">
              El siguiente día de tu rutina todavía no tiene ejercicios. Añádelos en Entrenar.
            </p>
          </Card>
        ) : (
          <HomeNote icon="calendar">
            Todavía no hay rutina ni sesiones programadas. La plantilla de la semana está en Entrenar.
          </HomeNote>
        )}
        <TodayAction action={action} onStart={onStart} onNavigate={onNavigate} starting={starting} />
        {/* S7: the match day is exactly when the owner knows the cup is next, so the
            fixture and its flip stay reachable on the two days the gym does not fill. */}
        <WeekFixtureLine fixture={fixture} onFlipWeek={onFlipWeek} />
      </section>
    );
  }

  return (
    <Card className="home__hero">
      <div className="home__hero-head">
        <span className="home__hero-badge" aria-hidden="true">
          <Icon name="train" size={20} />
        </span>
        <h2 className="ds-card-title ds-card-title--large home__hero-title">
          {formatDayName(today.dayName)}
        </h2>
      </div>
      <p className="ds-meta">{today.detail}</p>
      {today.series === null && today.phase === null && !preview ? null : (
        <div className="home__hero-meta">
          {today.series === null ? null : <Chip>{today.series}</Chip>}
          {today.phase === null ? null : <span className="ds-caption">{today.phase}</span>}
          {preview ? <Chip>Vista previa</Chip> : null}
        </div>
      )}
      {today.done === null ? null : <p className="ds-body">{today.done}</p>}
      <TodayAction action={action} onStart={onStart} onNavigate={onNavigate} starting={starting} />
      {/* T4: which workout a day carries is changed on the agenda's own sheet, so the
          card keeps only the fixture of the week — one mechanism for one question. */}
      <WeekFixtureLine fixture={fixture} onFlipWeek={onFlipWeek} />
    </Card>
  );
}

function LastSessionCard({ view }: HomeViewOnly): React.ReactElement | null {
  const last = view.last;
  if (last === null) return null;
  return (
    <section className="home__section">
      <SectionLabel icon={<Icon name="train" size={14} />}>{last.label}</SectionLabel>
      <Card>
        <div className="home__last">
          <span className="home__last-main">
            <span className="ds-card-title">{formatDayName(last.dayName)}</span>
            <span className="ds-meta">{last.detail}</span>
          </span>
          <span className="home__last-volume">
            <span className="ds-numeral ds-numeral--metric-small">{last.volume}</span>
            <span className="ds-numeral__unit">kg</span>
          </span>
        </div>
      </Card>
    </section>
  );
}

/**
 * The last closed session, as history under the week: it is the only context the agenda
 * cannot give, because the agenda says what is planned and this says what happened.
 */
function WeightCard({ view }: HomeViewOnly): React.ReactElement | null {
  const weight = view.weight;
  if (weight === null) return null;
  const series = weight.series;
  return (
    <section className="home__section">
      <Card padding="default">
        <MetricTile
          label="Peso corporal"
          value={weight.value}
          unit="kg"
          caption={weight.caption}
          aside={series.length < 2 ? undefined : <Sparkline values={[...series]} />}
        />
      </Card>
    </section>
  );
}

/**
 * Activity: what the owner recorded, and then what arrived from elsewhere.
 *
 * Two deliberate changes from the old card, both demanded by S1/S6:
 *
 * 1. The capture is here, and it writes an `ActivityRecord` — never a session. The next
 *    strength day above is untouched by it; the row says that by being an activity and
 *    nothing else, so the card no longer explains it in prose (S2).
 * 2. `N actividades importadas` used to cover every row, so a manually recorded football
 *    match would have read as an imported health sample. Manual rows are now named for
 *    what they are (`Fútbol registrado`) with their date and duration, and only the rows
 *    Rupfit did not write are counted as imported.
 */
/**
 * The bin the owner asked for (S5): 20 pt, 24 × 24 grid, 1.8 stroke, `currentColor`.
 *
 * The design system's icon set has no bin and §4 puts the shared glyphs in one place; the
 * shape lives here because the only screen that deletes is this one. It is `aria-hidden`:
 * the button that wraps it carries the accessible name.
 */
function BinGlyph(): React.ReactElement {
  return (
    <svg className="home__bin-icon" viewBox="0 0 24 24" width={20} height={20} aria-hidden="true" focusable="false">
      <path d="M4 7h16M9.5 4.5h5M6.5 7l.8 11.6A2 2 0 0 0 9.3 20.5h5.4a2 2 0 0 0 2-1.9L17.5 7M10 10.5v6M14 10.5v6" />
    </svg>
  );
}

/**
 * One recorded activity: what it is, its date and duration, and its bin.
 *
 * The bin never deletes on its own (S5, L3): the first tap only asks, and the question
 * replaces the bin in place — «¿Eliminar? Sí / Cancelar». A row mid-question keeps its
 * own two 48 px buttons rather than a dialog, so nothing covers the screen and nothing
 * has to be dismissed before the owner can change his mind.
 */
function ActivityRow({
  row,
  deletion,
}: {
  readonly row: ActivityEntryView;
  readonly deletion?: ActivityDeletionState | undefined;
}): React.ReactElement {
  const asking = deletion !== undefined && deletion.pendingId === row.id;
  return (
    <div className="home__activity-row" role="listitem">
      <span className="home__activity-main">
        <span className="ds-body">{row.label}</span>
        <span className="ds-meta">{row.detail}</span>
      </span>
      {deletion === undefined ? null : asking ? (
        <span className="home__confirm">
          <span className="home__confirm-ask">{ACTIVITY_DELETE_COPY.ask}</span>
          <TextButton
            tone="danger"
            disabled={deletion.busy}
            onClick={() => deletion.confirm(row.id)}
          >
            {ACTIVITY_DELETE_COPY.confirm}
          </TextButton>
          <TextButton disabled={deletion.busy} onClick={deletion.cancel}>
            {ACTIVITY_DELETE_COPY.cancel}
          </TextButton>
        </span>
      ) : (
        <button
          type="button"
          className="ds-action home__bin"
          aria-label={row.removeLabel}
          onClick={() => deletion.ask(row.id)}
        >
          <BinGlyph />
        </button>
      )}
    </div>
  );
}

function ActivitySection({
  view,
  onRecordFootball,
  recording = false,
  footballNotice = null,
  deletion,
}: HomeViewOnly & {
  readonly onRecordFootball?: (() => void) | undefined;
  readonly recording?: boolean | undefined;
  readonly footballNotice?: string | null | undefined;
  readonly deletion?: ActivityDeletionState | undefined;
}): React.ReactElement {
  const activity = view.activity;
  return (
    <section className="home__section">
      <SectionLabel icon={<Icon name="heart" size={14} />}>Actividad</SectionLabel>

      {/* One compact row: the glyph, the word, the duration as a figure, the action.
          The prose that used to sit here («50 minutos, dos partes de 25. Se guarda como
          actividad: no cuenta como sesión…») explained a fact the row already proves —
          the match is an activity by construction, and the rotation above never saw it
          (S2, S6). */}
      <Card padding="dense" label="Fútbol">
        <div className="home__football">
          <Icon name="clock" size={20} className="home__football-icon" />
          <span className="ds-card-title">Fútbol</span>
          <span className="home__football-min">
            <span className="ds-numeral ds-numeral--metric-small">
              {String(FOOTBALL_DURATION_MINUTES)}
            </span>
            <span className="ds-numeral__unit">min</span>
          </span>
          {onRecordFootball === undefined ? null : (
            <TextButton
              icon="plus"
              align="start"
              className="home__football-action"
              disabled={recording}
              onClick={onRecordFootball}
            >
              {recording ? 'Guardando…' : 'Registrar'}
            </TextButton>
          )}
        </div>
        {/* A plain result line: no modal, no timer, and no claim about a screen that has
            not re-read yet. */}
        {footballNotice === null ? null : <p className="ds-body">{footballNotice}</p>}
      </Card>

      {activity.recorded.length === 0 ? null : (
        <Card padding="dense" label="Actividad registrada">
          <div className="home__activity" role="list">
            {activity.recorded.map((row) => (
              <ActivityRow
                key={row.id}
                row={row}
                {...(deletion === undefined ? {} : { deletion })}
              />
            ))}
          </div>
        </Card>
      )}

      {/* What the removal did, in one line: the row disappears on its own when the
          screen re-reads, so there is no toast to dismiss. */}
      {deletion === undefined || deletion.notice === null ? null : (
        <p className="ds-body">{deletion.notice}</p>
      )}

      {activity.imported === 0 ? null : (
        <Card>
          <div className="ds-row">
            <span className="home__imported">
              <Icon name="watch" size={20} className="home__imported-icon" />
              <span className="ds-body">
                {activity.imported === 1
                  ? '1 actividad importada'
                  : `${String(activity.imported)} actividades importadas`}
              </span>
            </span>
            <Chip>Sólo lectura</Chip>
          </div>
        </Card>
      )}

      {activity.empty ? (
        <HomeNote icon="heart">
          Todavía no hay actividad registrada. Esto no impide entrenar.
        </HomeNote>
      ) : null}
    </section>
  );
}

/**
 * The screen's body. It takes the view, never the store, so the demo and the tests of
 * the selectors describe the same screen.
 */
export function HomeBody({
  view,
  agendaWeek = null,
  offDay = null,
  matchReported = false,
  fixture = null,
  onStart,
  onNavigate = navigateTo,
  starting = false,
  startNotice = null,
  onRecordFootball,
  recording = false,
  footballNotice = null,
  onReportMatch,
  reporting = false,
  reportNotice = null,
  onPlace,
  placementNotice = null,
  onRetryPlacement,
  onFlipWeek,
  deletion,
}: HomeProps): React.ReactElement {
  const navigate = onNavigate;
  // T4: the agenda's today row carries the action, so the card below draws one only when
  // the row could not — the screen never offers two ways into the same session (§7.1).
  const rowAction = agendaWeek?.action ?? null;
  const looseAction = rowAction === null ? view.action : null;

  return (
    <div className="home">
      {/* The reference hierarchy: the title is the screen's, not a person's, and the name
          and the date stay one quiet line under it. The mark stays the first thing on the
          left; the week it used to sit next to is now the seven rows below (T4), so the
          header keeps one object instead of a meter that repeated them. */}
      <header className="home__head">
        <div className="home__head-bar">
          {/* The owner's own mark, at header size: it identifies the app before the
              screen says anything else, and the wordmark stays in the lockup. */}
          <img
            className="home__brand"
            src={`${import.meta.env.BASE_URL}logo-lockup.svg`}
            alt="Rupfit"
            height={40}
          />
        </div>
        <h1 className="ds-screen-title">{HOME_TITLE}</h1>
        <p className="ds-meta">{`${view.greeting} · ${view.dateLine}`}</p>
      </header>

      {/* T4: the week, seven rows, under the header and above the day's detail. The day
          the agenda does not draw (no plan, no agenda) keeps its own card below. */}
      {agendaWeek === null ? null : (
        <AgendaWeek
          week={agendaWeek}
          starting={starting}
          onStart={onStart}
          {...(onPlace === undefined ? {} : { onPlace })}
          placementNotice={placementNotice}
          {...(onRetryPlacement === undefined ? {} : { onRetryPlacement })}
        />
      )}

      {/* The day, its numbers and — only when the agenda's row could not carry it — the
          action that starts it. One accent fill on the screen at a time (§7.1). */}
      <TodayBlock
        view={view}
        action={looseAction}
        offDay={offDay}
        matchReported={matchReported}
        fixture={fixture}
        onStart={onStart}
        onNavigate={navigate}
        onReportMatch={onReportMatch}
        reporting={reporting}
        reportNotice={reportNotice}
        onFlipWeek={onFlipWeek}
        starting={starting}
      />

      {/* Everything below is secondary to the day above: why nothing opened (§7.8) and
          the store's own bad news. A failed write offers `Reintentar`; a missing profile
          sends the owner to the tab that can fix it, because a retry cannot. */}
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

      {/* §7.8, S5: the only platform state Inicio still tells — the store opened and the
          data is gone. The install advisory that used to sit here is Perfil's alone now
          (S2): it explained the platform on the screen that answers «what do I do now?». */}
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

      {view.hasHistory ? null : (
        <HomeNote icon="train">
          Todavía no hay sesiones. La primera aparecerá aquí cuando la termines.
        </HomeNote>
      )}

      {/* The last session the agenda above contains, then what the store measured:
          history, read-only context under the week. */}
      <LastSessionCard view={view} />
      <WeightCard view={view} />
      <ActivitySection
        view={view}
        {...(onRecordFootball === undefined ? {} : { onRecordFootball })}
        recording={recording}
        footballNotice={footballNotice}
        {...(deletion === undefined ? {} : { deletion })}
      />
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
  // T4: the placement that did not reach the store, so the one retry can repeat it. The
  // notice travels with it: the sentence stays on screen while the week does not change.
  const [placement, setPlacement] = useState<{
    readonly failed: { readonly planDayId: string; readonly weekday: number } | null;
    readonly notice: string | null;
  }>({ failed: null, notice: null });
  const start = useStartSession({ storage, clock, onNavigate });

  // One counter serves the retry, the re-read after a write and the re-read after a
  // removal. It is a read, not a navigation: recording or deleting an activity must leave
  // the owner on Inicio, on the same day.
  const refresh = useCallback(() => setAttempt((value) => value + 1), []);
  const capture = useFootballCapture({ storage, clock, onSaved: refresh });
  // T8/S1: the report of the match, on the day the week calls the match. It is a second
  // instance of the same capture, guarded (`reportMatch`), so the day is informed once
  // and the screen re-reads into the done state instead of offering it again.
  const report = useFootballCapture({ storage, clock, onSaved: refresh, match: true });
  // T4: the placement is written through the agenda's own seam and the screen re-reads,
  // so the week drawn is the week saved. A failed write keeps the previous layout and
  // leaves one sentence and one retry on screen (S5).
  const deletion = useActivityDeletion({ storage, onDeleted: refresh });
  // T3/S7: the fixture is a fact of the week, so the flip writes the record and the screen
  // re-reads — the same shape the agenda's placement has. A write that did not happen
  // re-reads nothing, so the card never shows half a cup week.
  const flipWeek = useCallback(
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

  return (
    <HomeScreenBody
      input={boot.input}
      storage={storage}
      onStart={start.start}
      starting={start.busy}
      startNotice={start.notice}
      capture={capture}
      report={report}
      flipWeek={flipWeek}
      deletion={deletion}
      placement={placement}
      onPlacement={setPlacement}
      refresh={refresh}
      {...(onNavigate === undefined ? {} : { onNavigate })}
    />
  );
}

/**
 * The screen once there is something to draw: the view, the agenda and the two writes
 * that need the layout the render just built.
 *
 * It is a second component because a hook cannot capture a value computed after the
 * early return above: the agenda is derived here, and `place` closes over it.
 */
function HomeScreenBody({
  input,
  storage,
  onStart,
  starting,
  startNotice,
  capture,
  report,
  flipWeek,
  deletion,
  placement,
  onPlacement,
  refresh,
  onNavigate,
}: {
  readonly input: HomeInput;
  readonly storage: StoragePort;
  readonly onStart: (planDayId?: string | null) => void;
  readonly starting: boolean;
  readonly startNotice: StartNotice | null;
  readonly capture: ReturnType<typeof useFootballCapture>;
  readonly report: ReturnType<typeof useFootballCapture>;
  readonly flipWeek: (match: MatchKind) => void;
  readonly deletion: ActivityDeletionState;
  readonly placement: {
    readonly failed: { readonly planDayId: string; readonly weekday: number } | null;
    readonly notice: string | null;
  };
  readonly onPlacement: (next: {
    readonly failed: { readonly planDayId: string; readonly weekday: number } | null;
    readonly notice: string | null;
  }) => void;
  readonly refresh: () => void;
  readonly onNavigate?: ((href: string) => void) | undefined;
}): React.ReactElement {
  const view = homeViewOf(input);
  const agendaWeek = agendaWeekViewOf(input, view.action);

  const place = (planDayId: string, weekday: number): void => {
    if (agendaWeek === null) return;
    const request = {
      storage,
      agenda: agendaWeek.agenda,
      layout: agendaWeek.layout,
      planDayId,
      toWeekday: weekday,
    };
    void writePlacement(request).then(
      (written) => {
        if (written.outcome === 'saved') {
          onPlacement({ failed: null, notice: null });
          refresh();
          return;
        }
        if (written.outcome === 'failed') {
          onPlacement({ failed: { planDayId, weekday }, notice: written.notice });
        }
      },
      () => onPlacement({ failed: { planDayId, weekday }, notice: PLACEMENT_FAILED_COPY }),
    );
  };

  const failed = placement.failed;

  return (
    <HomeBody
      view={view}
      agendaWeek={agendaWeek}
      offDay={offDayOf(input)}
      matchReported={matchReportedOf(input)}
      fixture={weekFixtureOf(input.week)}
      onStart={onStart}
      starting={starting}
      startNotice={startNotice}
      onRecordFootball={capture.save}
      recording={capture.busy}
      footballNotice={capture.notice}
      onReportMatch={report.save}
      reporting={report.busy}
      reportNotice={report.notice}
      onPlace={place}
      placementNotice={placement.notice}
      onRetryPlacement={
        failed === null ? undefined : () => place(failed.planDayId, failed.weekday)
      }
      onFlipWeek={flipWeek}
      deletion={deletion}
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
