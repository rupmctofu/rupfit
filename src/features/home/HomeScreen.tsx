/*
 * Inicio — the screen that answers "what do I do now?" (design-system §8).
 *
 * The reference direction (design/rupfit-inspiration/01-reference-flow.html) fixes the
 * order and this file follows it: a top row with the mark and the week, the title
 * «¡Vamos a entrenar!», and one protagonist block for the day that carries its own
 * action. The personalised name and the date stay on screen under the title, smaller
 * than the action; the last session, the body weight, the activity (the manual football
 * capture, the rows it writes and the imported count) and the empty states move below
 * it. The platform notices of §7.8 keep their tone and sit under the day, never above it.
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
  EmptyState,
  ErrorBanner,
  Icon,
  MetricTile,
  PrimaryAction,
  SectionLabel,
  Sparkline,
  TextButton,
} from '../../design-system';
import type { StoragePort } from '../../storage';
import { useAppServices } from '../../app/providers';
import type { Clock } from '../session/controller';
import { useStartSession, type StartNotice } from '../session/startSession';
import { summaryHash } from '../summary/route';
import { DemoHome } from './DemoHome';
import { ACTIVITY_DELETE_COPY, useActivityDeletion, type ActivityDeletionState } from './deletion';
import { FOOTBALL_DURATION_MINUTES, useFootballCapture } from './football';
import { demoFlagOf, useLocationKey } from './useHash';
import { formatDayName } from './format';
import { homeViewOf, HOME_SESSION_WINDOW, type ActivityEntryView, type HomeInput, type HomeView } from './selectors';
import { isInstalled } from './platform';
import './home.css';

/** `?demo=inicio` — the review surface, resolved here until the router owns it. */
export const DEMO_FLAG = 'inicio';

type LoadPhase = 'loading' | 'ready' | 'failed';

interface Boot {
  readonly phase: LoadPhase;
  readonly input: HomeInput | null;
}

/** The one probe of §2.1.1, read once: the banner must not ask on every render. */
function readInstalled(): boolean {
  const readMedia =
    typeof window.matchMedia === 'function'
      ? (query: string): { readonly matches: boolean } => window.matchMedia(query)
      : undefined;
  return isInstalled({
    ...(readMedia === undefined ? {} : { matchMedia: readMedia }),
    navigator: navigator as { readonly standalone?: boolean | undefined },
  });
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
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
  const measurements = await storage.measurements.between(weekAgo, now);
  const activities = await storage.activities.all();

  return {
    now,
    profile,
    phaseState,
    plan,
    recent,
    inProgress,
    measurements,
    activities,
    installed: readInstalled(),
    // The evicted state is a fact the *storage* tier has to supply: an empty store and a
    // first run are indistinguishable from inside IndexedDB (design-system §2.5), so the
    // marker lives outside it and arrives here as evidence. Until a caller passes one,
    // Inicio cannot see a loss and does not announce one.
    lostData: evidence.lostData,
    lastExportAt: evidence.lastExportAt,
  };
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
  /** Starts the session the rotation names: create it, then open the sheet. */
  readonly onStart: () => void;
  /** True while the write is in flight: the action is disabled and says so (S3). */
  readonly starting?: boolean | undefined;
  readonly startNotice?: StartNotice | null | undefined;
  /** Writes the manual football activity. Absent: the capture is not offered. */
  readonly onRecordFootball?: (() => void) | undefined;
  readonly recording?: boolean | undefined;
  readonly footballNotice?: string | null | undefined;
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
 * The week, drawn and not narrated (S2).
 *
 * One segment per session the week plans, filled when that session is closed. The
 * arithmetic is `homeViewOf`'s (`doneCount` of `plannedCount`); this only paints it. No
 * sentence sits next to it: the count lives in the accessible name, so the graphic is
 * still readable when colour alone is not available (§9, §11).
 */
function WeekMeter({ view }: HomeViewOnly): React.ReactElement | null {
  const week = view.week;
  if (week === null) return null;
  return (
    <div className="home__meter" role="img" aria-label={week.label}>
      {week.cells.map((cell) => (
        <span key={cell.key} className={`home__meter-segment home__meter-segment--${cell.state}`} />
      ))}
    </div>
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
  view,
  onStart,
  onNavigate = navigateTo,
  starting = false,
}: HomeViewOnly & {
  readonly onStart: () => void;
  readonly onNavigate?: ((href: string) => void) | undefined;
  readonly starting?: boolean | undefined;
}): React.ReactElement | null {
  const action = view.action;
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
 * Today's session as one protagonist block (S3, S4).
 *
 * The card holds the day, its short detail, the prescribed sets and the action that
 * starts it — the owner's «hoy toca esto» — and nothing sits above it: the old
 * `Tu próxima sesión` label narrated what the title already says. What remains are the
 * facts the store can prove: the phase, the prescribed sets, the completed line, and the
 * one caption that explains why a preview is not a stored session yet.
 */
function TodayBlock({
  view,
  onStart,
  onNavigate = navigateTo,
  starting = false,
}: HomeViewOnly & {
  readonly onStart: () => void;
  readonly onNavigate?: ((href: string) => void) | undefined;
  readonly starting?: boolean | undefined;
}): React.ReactElement {
  const today = view.today;

  if (today === null) {
    return (
      <section className="home__section">
        {view.nothingToday === 'emptyDay' ? (
          <Card>
            <h2 className="ds-card-title">Sin ejercicios</h2>
            <p className="ds-body ds-body--muted">
              El siguiente día de tu rutina todavía no tiene ejercicios. Añádelos en Entrenar.
            </p>
          </Card>
        ) : (
          <EmptyState>
            Todavía no hay rutina ni sesiones programadas. La plantilla de la semana está en Entrenar.
          </EmptyState>
        )}
        <TodayAction view={view} onStart={onStart} onNavigate={onNavigate} starting={starting} />
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
      {today.series === null && today.phase === null ? null : (
        <div className="home__hero-meta">
          {today.series === null ? null : <Chip>{today.series}</Chip>}
          {today.phase === null ? null : <span className="ds-caption">{today.phase}</span>}
        </div>
      )}
      {today.done === null ? null : <p className="ds-body">{today.done}</p>}
      {/* A preview is the rotation's next day, not a stored session: say so, so the card
          never reads like something that already exists. It is only true while the
          primary action is the one that creates it. */}
      {today.state === 'preview' && view.action?.kind === 'start' ? (
        <p className="ds-caption">La sesión se crea al empezar.</p>
      ) : null}
      <TodayAction view={view} onStart={onStart} onNavigate={onNavigate} starting={starting} />
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
 * The week used to be a card of its own below the fold, with the count written out as
 * `2 de 3 sesiones`. S2 moved it into the header as a graphic and the sentence went
 * with it: the days of the week are the segments of `WeekMeter`.
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
 *    strength day above is untouched by it, which is why the card says so in one line.
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

      <Card label="Fútbol">
        <span className="ds-card-title">Fútbol</span>
        <p className="ds-body ds-body--muted">
          {`${String(FOOTBALL_DURATION_MINUTES)} minutos, dos partes de 25. Se guarda como actividad: no cuenta como sesión ni cambia el orden de tus días de fuerza.`}
        </p>
        {onRecordFootball === undefined ? null : (
          <TextButton icon="plus" align="start" disabled={recording} onClick={onRecordFootball}>
            {recording ? 'Guardando…' : 'Registrar fútbol'}
          </TextButton>
        )}
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
            <span className="ds-body">
              {activity.imported === 1
                ? '1 actividad importada'
                : `${String(activity.imported)} actividades importadas`}
            </span>
            <Chip>Sólo lectura</Chip>
          </div>
        </Card>
      )}

      {activity.empty ? (
        <EmptyState bare>
          Todavía no hay actividad registrada. Esto no impide entrenar.
        </EmptyState>
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
  onStart,
  onNavigate = navigateTo,
  starting = false,
  startNotice = null,
  onRecordFootball,
  recording = false,
  footballNotice = null,
  deletion,
}: HomeProps): React.ReactElement {
  const navigate = onNavigate;

  return (
    <div className="home">
      {/* The reference hierarchy: the title is the screen's, not a person's, and the name
          and the date stay one quiet line under it. The top row is the mark on the left
          (S1) and the week on the right (S2): the one number the owner wanted to keep
          glancing at, drawn instead of written. */}
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
          <WeekMeter view={view} />
        </div>
        <h1 className="ds-screen-title">{HOME_TITLE}</h1>
        <p className="ds-meta">{`${view.greeting} · ${view.dateLine}`}</p>
      </header>

      {/* The day, its numbers and the action that starts it, in one card: the loudest
          thing on the screen after the header, and the only accent fill on it. */}
      <TodayBlock
        view={view}
        onStart={onStart}
        onNavigate={navigate}
        starting={starting}
      />

      {/* Everything below is secondary to the day above: why nothing opened (§7.8), the
          store's own bad news, and the platform advisory. A failed write offers
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

      {/* §7.8: the evicted state is the only one that is not dismissible. It keeps the
          danger tone and its import action; it sits under the action so the day still
          comes first. */}
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

      {/* §7.8: advisory, stated once, and only when there is something to lose. Its
          warning tone is unchanged; it sits under the day, never above it. */}
      {view.notice.notInstalled ? (
        <Banner
          tone="warning"
          title="Guarda Rupfit en la pantalla de inicio para que Safari no borre tus datos."
          text="Compartir → Añadir a pantalla de inicio."
        />
      ) : null}

      {view.hasHistory ? null : (
        <EmptyState bare>
          Todavía no hay sesiones. La primera aparecerá aquí cuando la termines.
        </EmptyState>
      )}

      {/* The week already sits in the header, so what is left is the last session it
          contains: history, read-only context under the day. */}
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
  const start = useStartSession({ storage, clock, onNavigate });

  // One counter serves the retry, the re-read after a write and the re-read after a
  // removal. It is a read, not a navigation: recording or deleting an activity must leave
  // the owner on Inicio, on the same day.
  const refresh = useCallback(() => setAttempt((value) => value + 1), []);
  const capture = useFootballCapture({ storage, clock, onSaved: refresh });
  // The bin and its question live in the screen, not in the row: only one question can be
  // open at a time, and the answer survives the re-read the removal triggers.
  const deletion = useActivityDeletion({ storage, onDeleted: refresh });

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
    <HomeBody
      view={homeViewOf(boot.input)}
      onStart={start.start}
      starting={start.busy}
      startNotice={start.notice}
      onRecordFootball={capture.save}
      recording={capture.busy}
      footballNotice={capture.notice}
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
