/*
 * Inicio — the screen that answers "what do I do now?" (design-system §8).
 *
 * Greeting and date, today's session with its exercise count and its estimate, one
 * primary action, the last session, the week, the body weight when there is a weight to
 * show, and the three platform notices of §7.8 when they apply.
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
} from '../../design-system';
import type { StoragePort } from '../../storage';
import { useAppServices } from '../../app/providers';
import type { Clock } from '../session/controller';
import { useStartSession, type StartNotice } from '../session/startSession';
import { summaryHash } from '../summary/route';
import { DemoHome } from './DemoHome';
import { demoFlagOf, useLocationKey } from './useHash';
import { formatDayName } from './format';
import { homeViewOf, HOME_SESSION_WINDOW, type HomeInput, type HomeView } from './selectors';
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
}

function navigateTo(href: string): void {
  window.location.hash = href;
}

/** The blocks below draw the view; only the body owns the actions. */
interface HomeViewOnly {
  readonly view: HomeView;
}

/** Today's block: the session, the day the rotation names, or the honest empty card. */
function TodayBlock({ view }: HomeViewOnly): React.ReactElement {
  if (view.today === null) {
    return (
      <section className="home__section">
        <SectionLabel icon={<Icon name="calendar" size={14} />}>Hoy toca</SectionLabel>
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
      </section>
    );
  }

  const today = view.today;
  return (
    <section className="home__section">
      <SectionLabel icon={<Icon name="calendar" size={14} />}>Hoy toca</SectionLabel>
      <Card label={today.dayName}>
        <h2 className="ds-card-title">{formatDayName(today.dayName)}</h2>
        <p className="ds-meta">{today.detail}</p>
        {today.phase === null && today.series === null ? null : (
          <>
            <hr className="ds-hairline" />
            <div className="ds-row">
              <span className="ds-body ds-body--muted">{today.phase ?? ''}</span>
              {today.series === null ? null : <Chip>{today.series}</Chip>}
            </div>
          </>
        )}
        {today.phaseNote === null ? null : <p className="ds-caption">{today.phaseNote}</p>}
        {today.done === null ? null : <p className="ds-body">{today.done}</p>}
        {/* A preview is the rotation's next day, not a stored session: say so, so the
            card never reads like something that already exists. It is only true while the
            primary action is the one that creates it. */}
        {today.state === 'preview' && view.action?.kind === 'start' ? (
          <p className="ds-caption">Se crea al empezar.</p>
        ) : null}
      </Card>
    </section>
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

function WeekCard({ view }: HomeViewOnly): React.ReactElement | null {
  const week = view.week;
  if (week === null) return null;
  return (
    <section className="home__section">
      <SectionLabel icon={<Icon name="calendar" size={14} />}>Esta semana</SectionLabel>
      <Card label="Esta semana">
        <div className="home__week" role="list">
          {week.cells.map((cell) => (
            <span key={cell.key} role="listitem" className={`home__day home__day--${cell.state}`}>
              <span className="home__day-initial" aria-hidden="true">
                {cell.initial}
              </span>
              <span className="home__day-mark" aria-hidden="true">
                {cell.state === 'done' ? <Icon name="check" size={14} /> : <span className="home__day-dot" />}
              </span>
              <span className="ds-visually-hidden">{cell.label}</span>
            </span>
          ))}
        </div>
        <div className="ds-row">
          <span className="ds-body ds-body--muted">{week.done}</span>
          <span className="ds-body ds-body--muted">{week.hard}</span>
        </div>
      </Card>
    </section>
  );
}

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

function ActivityCard({ view }: HomeViewOnly): React.ReactElement | null {
  const activity = view.activity;
  if (activity === null) return null;
  return (
    <section className="home__section">
      <SectionLabel icon={<Icon name="heart" size={14} />}>Actividad</SectionLabel>
      {activity.imported === 0 ? (
        <EmptyState>Todavía no hay datos de salud importados. Esto no impide entrenar.</EmptyState>
      ) : (
        <Card>
          <div className="ds-row">
            <span className="ds-body">{`${String(activity.imported)} actividades importadas`}</span>
            <Chip>Sólo lectura</Chip>
          </div>
        </Card>
      )}
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
}: HomeProps): React.ReactElement {
  const navigate = onNavigate;
  const action = view.action;

  return (
    <div className="home">
      <header className="home__head">
        <h1 className="ds-screen-title">{view.greeting}</h1>
        <p className="ds-meta">{view.dateLine}</p>
      </header>

      {/* §7.8: the evicted state is the only one that is not dismissible. */}
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

      {/* §7.8: advisory, stated once, and only when there is something to lose. */}
      {view.notice.notInstalled ? (
        <Banner
          tone="warning"
          title="Guarda Rupfit en la pantalla de inicio para que Safari no borre tus datos."
          text="Compartir → Añadir a pantalla de inicio."
        />
      ) : null}

      <TodayBlock view={view} />

      {/* Why nothing opened. A failed write offers `Reintentar`; a missing profile sends
          the owner to the tab that can fix it, because a retry cannot. */}
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

      {action === null ? null : (
        <PrimaryAction
          icon={action.kind === 'start' || action.kind === 'resume' ? 'play' : undefined}
          className="home__primary"
          disabled={starting}
          onClick={() => {
            if (action.kind !== 'summary') {
              onStart();
              return;
            }
            navigate(action.sessionId === null ? '#/sesion' : summaryHash(action.sessionId));
          }}
        >
          {starting ? 'Empezando…' : action.label}
        </PrimaryAction>
      )}

      {view.hasHistory ? null : (
        <EmptyState>Todavía no hay sesiones. La primera aparecerá aquí cuando la termines.</EmptyState>
      )}

      <LastSessionCard view={view} />
      <WeekCard view={view} />
      <WeightCard view={view} />
      <ActivityCard view={view} />
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

  useEffect(() => {
    let cancelled = false;
    setBoot({ phase: 'loading', input: null });
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

  const retry = useCallback(() => setAttempt((value) => value + 1), []);

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
