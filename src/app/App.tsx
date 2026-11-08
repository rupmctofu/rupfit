import { useEffect } from 'react';
import {
  isSessionRoute,
  isSummaryRoute,
  tabFor,
  useCurrentHash,
  useHashRoute,
  type Route,
} from './routes';
import { AppProvider, useAppServices } from './providers';
import { HomeScreen } from '../features/home/HomeScreen';
import { TrainScreen } from '../features/train/TrainScreen';
import { ProgressScreen } from '../features/progress/ProgressScreen';
import { ProfileScreen } from '../features/profile/ProfileScreen';
import { SessionScreen } from '../features/session/SessionScreen';
import { DemoSession } from '../features/session/DemoSession';
import { SummaryEntry } from '../features/summary/SummaryEntry';
import { summaryHash, summaryTargetOf, type SummaryTarget } from '../features/summary/route';
import { registerServiceWorker } from '../pwa';
import { GalleryScreen } from './gallery/GalleryScreen';

const TABS: readonly { route: Route; label: string; icon: string }[] = [
  { route: 'inicio', label: 'Inicio', icon: '⌂' },
  { route: 'entrenar', label: 'Entrenar', icon: '⚑' },
  { route: 'progreso', label: 'Progreso', icon: '▮▮▮' },
  { route: 'perfil', label: 'Perfil', icon: '☺' },
];

/** The routes that live inside the tab shell. The session and the summary do not. */
type ShellRoute =
  | 'inicio'
  | 'entrenar'
  | 'progreso'
  | 'perfil'
  | 'galeria'
  | 'resumen'
  | 'resumen/demo'
  | 'progreso/historial'
  | 'progreso/peso';

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
      return <ProgressScreen />;
    case 'perfil':
      return <ProfileScreen />;
    // `#/resumen` without a session id is not a summary of anything: the shell renders
    // Inicio, which is where the summary's `Hecho` goes anyway.
    case 'resumen':
    case 'resumen/demo':
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
 */
function AppShell(): React.ReactElement {
  const route = useHashRoute();
  const hash = useCurrentHash();
  // A drill-down renders its parent tab and lights it up; the view itself reads the
  // extra path segment locally (src/features/progress/navigation.ts).

  const { storage, clock, journal } = useAppServices();

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
        ) : (
          <Screen route={route} />
        )}
      </main>
      {showTabs ? (
        <nav className="tabbar" aria-label="Navegación principal">
          {TABS.map((tab) => (
            <a
              key={tab.route}
              className="tabbar__tab"
              href={`#/${tab.route}`}
              aria-current={tabFor(route) === tab.route ? 'page' : undefined}
            >
              <span className="tabbar__icon" aria-hidden="true">
                {tab.icon}
              </span>
              <span className="tabbar__label">{tab.label}</span>
            </a>
          ))}
        </nav>
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
