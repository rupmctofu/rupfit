import { useEffect, useState } from 'react';
import {
  isSessionRoute,
  isSummaryRoute,
  isTabShellRoute,
  tabFor,
  useCurrentHash,
  useHashRoute,
  type Route,
} from './routes';
import { AppProvider, useAppServices } from './providers';
import { Banner, ErrorBanner, Icon, PrimaryAction, type IconName } from '../design-system';
import { SESSION_HASH, useStartSession, type StartNotice } from '../features/session/startSession';
import { trainingAccess } from './trainingAccess';
import { HomeScreen } from '../features/home/HomeScreen';
import { TrainScreen } from '../features/train/TrainScreen';
import { ProgressScreen } from '../features/progress/ProgressScreen';
import { ProfileScreen } from '../features/profile/ProfileScreen';
import { SessionScreen } from '../features/session/SessionScreen';
import { DemoSession } from '../features/session/DemoSession';
import { SummaryEntry } from '../features/summary/SummaryEntry';
import { summaryHash, summaryTargetOf, type SummaryTarget } from '../features/summary/route';
import { SetupScreen } from '../features/onboarding/SetupScreen';
import { useSetupGate } from '../features/onboarding/useSetupGate';
import { refreshSeededLibrary } from '../features/onboarding/library-refresh';
import { registerServiceWorker } from '../pwa';
import { GalleryScreen } from './gallery/GalleryScreen';

// Keep the four tab destinations and their hashes stable; the reference renames the
// existing plan and metrics surfaces to words people use for those tasks.
const TABS: readonly { route: Route; label: string; icon: IconName }[] = [
  { route: 'inicio', label: 'Inicio', icon: 'home' },
  { route: 'progreso', label: 'Historial', icon: 'chart' },
  { route: 'entrenar', label: 'Ejercicios', icon: 'dumbbell' },
  { route: 'perfil', label: 'Perfil', icon: 'person' },
];

type TabSpec = (typeof TABS)[number];

/** One of the four destinations. Only the destinations ever carry `aria-current`. */
function TabLink({ tab, current }: { readonly tab: TabSpec; readonly current: boolean }): React.ReactElement {
  return (
    <a className="tabbar__tab" href={`#/${tab.route}`} aria-current={current ? 'page' : undefined}>
      <span className="tabbar__icon" aria-hidden="true">
        <Icon name={tab.icon} size={20} />
      </span>
      <span className="tabbar__label">{tab.label}</span>
    </a>
  );
}

/**
 * The bar's action reads this, and only this: one stable accessible name (`Tu Entreno`),
 * whatever time it is and whether or not a session is open. The state of the store is not
 * part of the name — the press resolves it — so the owner's voice control and a screen
 * reader always find the same button.
 */
export const TRAIN_LABEL = 'Tu Entreno';

/** The routes that live inside the tab shell. The session and the summary do not. */
type ShellRoute =
  | 'inicio'
  | 'entrenar'
  | 'progreso'
  | 'perfil'
  | 'empezar'
  | 'galeria'
  | 'resumen'
  | 'resumen/demo'
  | 'progreso/historial'
  | 'progreso/peso'
  | 'progreso/ejercicio';

function Screen({ route }: { route: ShellRoute }): React.ReactElement {
  switch (route) {
    case 'inicio':
      return <HomeScreen />;
    case 'entrenar':
      return <TrainScreen />;
    case 'progreso':
      return <ProgressScreen />;
    case 'progreso/historial':
    case 'progreso/peso':
    // The exercise detail is a third view inside the same tab: the shell renders the
    // tab and `ProgressScreen` reads the key from the hash (`navigation.ts`).
    case 'progreso/ejercicio':
      return <ProgressScreen />;
    case 'perfil':
      return <ProfileScreen />;
    // `#/resumen` without a session id is not a summary of anything: the shell renders
    // Inicio, which is where the summary's `Hecho` goes anyway.
    case 'resumen':
    case 'resumen/demo':
      return <HomeScreen />;
    // The setup route is rendered by the shell, which owns the gate; `Screen` only has to
    // be total. Inicio is the honest fallback if it is ever reached without the gate.
    case 'empezar':
      return <HomeScreen />;
    case 'galeria':
      return <GalleryScreen />;
  }
}

/**
 * App shell: a single scroll container per screen and a tab bar pinned above the home
 * indicator. In standalone mode there is no browser back button, so navigation is
 * always on screen and the active route lives in the hash, which survives a relaunch
 * after the page was discarded (design-system §8).
 *
 * The session is a full-height sheet over the tab bar: `#/sesion` runs on the real port,
 * `#/sesion/demo` on fixtures, and both are the same screen. Resumen is the same kind of
 * sheet (`#/resumen/<id>`, `#/resumen/demo`): it is what the finished session lands on,
 * and `Hecho` closes it to Inicio. Because it carries a session id it is a route with a
 * parameter — the table knows `resumen`, the hash carries the id.
 *
 * The first run is decided here, not inside a screen: `useSetupGate` asks the store and
 * `setupOffer` answers, so a store with no profile (or a profile and no plan) shows the
 * setup in place of the tab instead of a screen full of refusals. The sheet routes and the
 * gallery opt out — they own the viewport and their own data, and `#/sesion/demo` must not
 * touch IndexedDB at all.
 *
 * The bar carries four destinations and one action, `Tu Entreno` (S1). The action is not a
 * fifth tab: it is the design system's primary action, sitting between the second and third
 * destination, and it navigates the way Inicio does — `SESSION_HASH` and `useStartSession`,
 * one `planStart`, one writer, no second router. `trainingAccess` (./trainingAccess.ts)
 * decides resume-vs-start-vs-refuse from the offer the gate already holds; a refusal says
 * one of `START_COPY`'s sentences just above the bar and never moves the owner.
 */
function AppShell(): React.ReactElement {
  const route = useHashRoute();
  const hash = useCurrentHash();
  // A drill-down renders its parent tab and lights it up; the view itself reads the
  // extra path segment locally (src/features/progress/navigation.ts).

  const { storage, clock, journal } = useAppServices();

  // The library the app ships is data, and a release can add detail to it. The first-run
  // flow writes it once and never overwrites, which is right for the owner's rows and
  // wrong for the seed's: an install seeded before descriptions and alternatives existed
  // would show bare names until the database was wiped. This refresh is narrow (seeded
  // rows only, never custom, archived kept, ids unchanged) and idempotent, so running it
  // once per launch costs one read and writes nothing when the store is current.
  useEffect(() => {
    void refreshSeededLibrary(storage).catch(() => {
      // A library refresh is not the session and not the profile: if it fails, the app
      // still opens with the rows it has, and the screen that reads them says what it can.
    });
  }, [storage]);

  const summary: SummaryTarget | null = isSummaryRoute(route) ? summaryTargetOf(hash) : null;

  // The sheet owns the whole viewport, so the tab bar is not drawn behind it. The
  // gallery is a full-screen review page too: four tabs stay four, none «current».
  const showTabs = !isSessionRoute(route) && route !== 'galeria';
  const exitSession = (): void => {
    window.location.hash = '#/inicio';
  };
  // The session's own id, handed to the summary it just wrote. No new read and no new
  // effect: the id is known by the time the sheet offers the action.
  const openSummary = (sessionId: string): void => {
    window.location.hash = summaryHash(sessionId);
  };

  const tabShell = isTabShellRoute(route);
  const gate = useSetupGate(storage, tabShell);

  /*
   * The bar's one action (`Tu Entreno`, S1). It is the shell's own navigation, not a
   * second one: `trainingAccess` decides which of the three paths the press takes from the
   * offer the gate already holds, `SESSION_HASH` is the route Inicio lands on, and the
   * start itself is `useStartSession` — the same hook, the same `planStart`, the same only
   * `sessions.create`. No storage read is added here and nothing is polled.
   *
   * A refusal is rendered where it is read: just above the bar, in `START_COPY`'s words,
   * with the same tone and the same `Ir a Perfil` escape hatch Inicio offers. Nothing
   * navigates on a refusal, so the owner stays on the screen that shows the message, and no
   * half-created session exists to clean up (`runStart` navigates only after the write
   * resolves).
   */
  const start = useStartSession({ storage, clock });
  const [refusal, setRefusal] = useState<StartNotice | null>(null);
  const noticeOfStart: StartNotice | null = start.notice ?? refusal;

  const openTraining = (): void => {
    const access = trainingAccess(gate.offer);
    setRefusal(null);
    if (access.kind === 'refused') {
      setRefusal(access.notice);
      return;
    }
    start.dismiss();
    if (access.kind === 'resume') {
      // The sheet boots from the store and lands on the exercise that is due: no reset,
      // no write, and not even a read from here.
      window.location.hash = SESSION_HASH;
      return;
    }
    start.start();
  };

  const dismissStart = start.dismiss;
  // A message belongs to the screen that produced it: leaving the section clears it, so a
  // stale refusal never follows the owner around the tabs.
  useEffect(() => {
    setRefusal(null);
    dismissStart();
  }, [route, dismissStart]);

  // `#/empezar` is explicit: the owner (or a support note) asked for that screen and it
  // shows even when the store already trains, where it only adds what is missing.
  const showSetup = route === 'empezar' || gate.offer.kind === 'setup';
  const leaveSetup = (): void => {
    gate.reload();
    window.location.hash = '#/inicio';
  };

  return (
    <div className="shell" data-route={route}>
      <main className="shell__main">
        {route === 'sesion' ? (
          <SessionScreen
            storage={storage}
            clock={clock}
            journal={journal}
            onExit={exitSession}
            onOpenSummary={openSummary}
          />
        ) : route === 'sesion/demo' ? (
          <DemoSession onExit={exitSession} />
        ) : summary !== null ? (
          <SummaryEntry target={summary} storage={storage} clock={clock} />
        ) : showSetup ? (
          <SetupScreen gate={gate} onDone={leaveSetup} />
        ) : gate.phase === 'loading' ? (
          // One frame of nothing, while the snapshot that decides between the setup and
          // the screen is read. Not a spinner for local data (S3) and not a flash of
          // Inicio's empty state under a form that is about to replace it (S4).
          null
        ) : (
          <Screen route={route} />
        )}
      </main>
      {showTabs ? (
        <>
          {/* The action's outcome, above the bar it came from. `danger` offers
              `Reintentar`; a missing profile sends the owner to the tab that can fix it,
              because a retry cannot write one. */}
          {noticeOfStart === null ? null : (
            <div className="shell__notice">
              {noticeOfStart.tone === 'danger' ? (
                <ErrorBanner
                  message={noticeOfStart.message}
                  {...(noticeOfStart.retry ? { onRetry: openTraining } : {})}
                />
              ) : (
                <Banner
                  tone="warning"
                  title={noticeOfStart.message}
                  {...(noticeOfStart.profile
                    ? {
                        action: {
                          label: 'Ir a Perfil',
                          onClick: () => {
                            window.location.hash = '#/perfil';
                          },
                        },
                      }
                    : {})}
                />
              )}
            </div>
          )}
          {/* Four destinations and one action: the bar never gains a fifth tab. The action
              sits between the second and third destination in the DOM, so it is the middle
              of the bar on screen and on the keyboard alike. It is the design-system's one
              primary action — the bar's only accent fill — sized down in shell.css; the
              four destinations keep their `aria-current` state, which is the only other
              accent in the bar. */}
          <nav className="tabbar" aria-label="Navegación principal">
            {TABS.slice(0, 2).map((tab) => (
              <TabLink key={tab.route} tab={tab} current={tabFor(route) === tab.route} />
            ))}
            <PrimaryAction
              className="tabbar__train"
              icon="play"
              disabled={start.busy}
              onClick={openTraining}
            >
              {TRAIN_LABEL}
            </PrimaryAction>
            {TABS.slice(2).map((tab) => (
              <TabLink key={tab.route} tab={tab} current={tabFor(route) === tab.route} />
            ))}
          </nav>
        </>
      ) : null}
    </div>
  );
}

/**
 * The composition root: one storage instance and one clock, created once and handed
 * down through context (`providers.tsx`). `main.tsx` keeps rendering `<App />`.
 *
 * The service worker is registered here, on launch, and not from a screen: offline is
 * normal operation (S3), so the shell has to be covered before the owner visits any tab
 * — Perfil used to be the only place that registered, and a fresh install was not
 * covered until it was opened. Prompt, never automatic `skipWaiting` (architecture §8).
 */
export function App(): React.ReactElement {
  useEffect(() => {
    registerServiceWorker();
  }, []);

  return (
    <AppProvider>
      <AppShell />
    </AppProvider>
  );
}
