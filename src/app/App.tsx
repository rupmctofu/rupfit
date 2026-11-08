import { useHashRoute, type Route } from './routes';
import { HomeScreen } from '../features/home/HomeScreen';
import { TrainScreen } from '../features/train/TrainScreen';
import { ProgressScreen } from '../features/progress/ProgressScreen';
import { ProfileScreen } from '../features/profile/ProfileScreen';
import { GalleryScreen } from './gallery/GalleryScreen';

const TABS: readonly { route: Route; label: string; icon: string }[] = [
  { route: 'inicio', label: 'Inicio', icon: '⌂' },
  { route: 'entrenar', label: 'Entrenar', icon: '⚑' },
  { route: 'progreso', label: 'Progreso', icon: '▮▮▮' },
  { route: 'perfil', label: 'Perfil', icon: '☺' },
];

function Screen({ route }: { route: Route }): React.ReactElement {
  switch (route) {
    case 'inicio':
      return <HomeScreen />;
    case 'entrenar':
      return <TrainScreen />;
    case 'progreso':
      return <ProgressScreen />;
    case 'perfil':
      return <ProfileScreen />;
    case 'galeria':
      return <GalleryScreen />;
    default:
      return <HomeScreen />;
  }
}

/**
 * App shell: a single scroll container per screen and a tab bar pinned above the home
 * indicator. In standalone mode there is no browser back button, so navigation is
 * always on screen and the active route lives in the hash, which survives a relaunch
 * after the page was discarded (design-system §8).
 */
export function App(): React.ReactElement {
  const route = useHashRoute();
  const isSession = route === 'sesion';
  // The gallery is a full-screen review page: four tabs stay four, and none of them
  // is «current» there, so the bar is not drawn rather than drawn with no selection.
  const showTabs = !isSession && route !== 'galeria';

  return (
    <div className="shell" data-route={route}>
      <main className="shell__main">{isSession ? <p>La sesión llega en T4.</p> : <Screen route={route} />}</main>
      {showTabs ? (
        <nav className="tabbar" aria-label="Navegación principal">
          {TABS.map((tab) => (
            <a
              key={tab.route}
              className="tabbar__tab"
              href={`#/${tab.route}`}
              aria-current={route === tab.route ? 'page' : undefined}
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
