/*
 * Inicio — the week, and very little else (S12, T9).
 *
 * The owner opened Inicio and said it had too many things: «lo que sobre de ahí de ese
 * inicio lo quites porque ... había muchas cosas y era muy lioso», and then «si, recorta».
 * What is left is the screen he asked for: the mark and the date, the week's rows, the one
 * action a row could not carry, one line with the kilos of the last session, and the two
 * notices that are not decoration — a start that failed and a store that came back empty.
 *
 * | what used to be here                    | where it went                      |
 * | --------------------------------------- | ---------------------------------- |
 * | the big card of today (`home__hero`)    | nowhere: its row already says the day |
 * | the fixture line and its flip           | the match row, whose sheet writes it |
 * | the match report                        | the match row, next to the ball    |
 * | `0 de 4 entrenos hechos`                | nowhere: each row says `Hecho` or `Pendiente` |
 * | the hint paragraph                      | inside the day sheet, where the move is made |
 * | the activities and their bin            | Progreso (`ProgressScreen.tsx`)    |
 * | the imported notice                     | Perfil (bookkeeping, not the week)  |
 * | the last-session card and the weight    | one line: `Última: PIERNA · 3.480 kg` |
 *
 * The file holds no decision worth testing: `homeViewOf` decides, this renders. Two rules
 * it does keep:
 *
 * 1. **No `Date.now()` and no port construction.** The clock and the storage instance
 *    arrive from `AppProvider` (`src/app/providers.tsx`); a demo mounts this screen with
 *    its own fixtures through the same props.
 * 2. **No invented facts.** When the store answers nothing the screen shows the empty
 *    version — a note saying so — never a zero dressed as a measurement.
 */

import { useCallback, useEffect, useState } from 'react';
import { Banner, ErrorBanner, Icon, PrimaryAction, type IconName } from '../../design-system';
import type { StoragePort, WeekLayout, WeekRecord } from '../../storage';
import type { MatchKind } from '../../core/engine/week-plan';
import { useAppServices } from '../../app/providers';
import type { Clock } from '../session/controller';
import { useStartSession, type StartNotice } from '../session/startSession';
import { summaryHash } from '../summary/route';
import { reportedMatchOf, weekFixtureOf, type WeekFixture } from '../week/week';
import {
  AgendaWeek,
  PLACEMENT_FAILED_COPY,
  agendaWeekViewOf,
  writePlacement,
  type AgendaWeekView,
} from './agenda';
import { DemoHome } from './DemoHome';
import { useFootballCapture } from './football';
import { demoFlagOf, useLocationKey } from './useHash';
import {
  homeViewOf,
  lastVolumeLineOf,
  todayRowOf,
  HOME_SESSION_WINDOW,
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
   * a screen with no agenda hands nothing, so the rotation decides.
   */
  readonly onStart: (planDayId?: string | null) => void;
  /** True while the write is in flight: the action is disabled and says so (S3). */
  readonly starting?: boolean | undefined;
  readonly startNotice?: StartNotice | null | undefined;
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

/** The screen's own title: the reference direction's first line, not the greeting. */
export const HOME_TITLE = '¡Vamos a entrenar!';

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
 * summary of a closed day, or a store with no week at all.
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
 * The screen's body. It takes the view, never the store, so the demo and the tests of
 * the selectors describe the same screen.
 *
 * T9 (S12) — this is the whole of Inicio after the cut: the header, the week, the one
 * action the week's row could not carry, one line with the kilos of the last session, and
 * the two notices that are not decoration (a start that failed, a store that came back
 * empty). The day card, the count, the hint, the activities and the imported notice left;
 * the fixture and the match report moved onto the match row (`agenda.tsx`).
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
  onPlace,
  placementNotice = null,
  onRetryPlacement,
  onChooseFixture,
}: HomeProps): React.ReactElement {
  const navigate = onNavigate;
  // T4: the agenda's today row carries the action, so the screen below draws one only
  // when the row could not — the screen never offers two ways into the same session
  // (§7.1). T9 leaves the action and removes the card it used to sit in.
  const rowAction = agendaWeek?.action ?? null;
  const looseAction = rowAction === null ? view.action : null;
  const lastLine = lastVolumeLineOf(view.last);
  // §9 — a sheet is `aria-modal` and traps Tab, so the screen behind it must leave the
  // accessibility tree too. The sheets are drawn inside the week (the artboard wants them
  // in the week, not over it), so this is the only place that knows both halves: the week,
  // the line and the notices go `inert` and hidden from assistive technology while one is
  // open. The shell's tab bar lives in `src/app/App.tsx`, outside this screen and outside
  // this task's edit surface; it stays reachable, which is a known gap, not a silent one.
  const [sheetOpen, setSheetOpen] = useState(false);
  const background = sheetOpen ? MODAL_BACKGROUND : {};

  return (
    <div className="home">
      {/* The reference hierarchy: the title is the screen's, not a person's, and the name
          and the date stay one quiet line under it. The mark stays the first thing on the
          left; the week it used to sit next to is now the seven rows below (T4), so the
          header keeps one object instead of a meter that repeated them. */}
      <header className="home__head" {...background}>
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

      {/* T4, S12: the week, seven rows, is the screen. The match row carries the fixture
          of the week and its report; the day sheet carries the hint the list gave up. */}
      {agendaWeek === null ? (
        <HomeNote icon="calendar">
          Todavía no hay rutina ni sesiones programadas. La plantilla de la semana está en Entrenar.
        </HomeNote>
      ) : (
        <AgendaWeek
          week={agendaWeek}
          starting={starting}
          onStart={onStart}
          onSheetChange={setSheetOpen}
          {...(onPlace === undefined ? {} : { onPlace })}
          placementNotice={placementNotice}
          {...(onRetryPlacement === undefined ? {} : { onRetryPlacement })}
          fixture={fixture}
          matchReported={matchReported}
          {...(onChooseFixture === undefined ? {} : { onChooseFixture })}
          {...(onReportMatch === undefined ? {} : { onReportMatch })}
          reporting={reporting}
        />
      )}

      {/* Everything a sheet covers, in one block, so one attribute hides it (T6, §9). */}
      <div className="home__below" {...background}>
        {/* The one filled control, and only when the week's row could not carry it: an
            open session, the summary of a closed day, or a store with no week at all. */}
        <TodayAction
          action={looseAction}
          onStart={onStart}
          onNavigate={navigate}
          starting={starting}
        />

        {/* S12: the only number left on Inicio, and a line rather than a card. With no
            closed session the line does not exist at all. */}
        {lastLine === null ? null : <p className="ds-meta home__last-line">{lastLine}</p>}

        {/* A report that failed is said once, next to the row that can repeat it. */}
        {reportNotice === null ? null : <p className="ds-body">{reportNotice}</p>}

        {/* Why nothing opened (§7.8) and the store's own bad news. A failed start offers
            `Reintentar`; a missing profile sends the owner to the tab that can fix it,
            because a retry cannot. */}
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
            data is gone. It is the way back into a lost store, so it is not decoration and
            it is not noise. */}
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
  // T4: the placement that did not reach the store, so the one retry can repeat it. The
  // notice travels with it: the sentence stays on screen while the week does not change.
  const [placement, setPlacement] = useState<{
    readonly failed: { readonly planDayId: string; readonly weekday: number } | null;
    readonly notice: string | null;
  }>({ failed: null, notice: null });
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
  // and the screen re-reads — the same shape the agenda's placement has. A write that did
  // not happen re-reads nothing, so the week never shows half a cup week.
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

  return (
    <HomeScreenBody
      input={boot.input}
      storage={storage}
      onStart={start.start}
      starting={start.busy}
      startNotice={start.notice}
      report={report}
      chooseFixture={chooseFixture}
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
  report,
  chooseFixture,
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
  readonly report: ReturnType<typeof useFootballCapture>;
  readonly chooseFixture: (match: MatchKind) => void;
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
  const agendaWeek = agendaWeekViewOf(input, view);

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
      matchReported={matchReportedOf(input)}
      fixture={weekFixtureOf(input.week)}
      onStart={onStart}
      starting={starting}
      startNotice={startNotice}
      onReportMatch={report.save}
      reporting={report.busy}
      reportNotice={report.notice}
      onPlace={place}
      placementNotice={placement.notice}
      onRetryPlacement={
        failed === null ? undefined : () => place(failed.planDayId, failed.weekday)
      }
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
