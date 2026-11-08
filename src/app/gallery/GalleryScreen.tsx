/*
 * The design review page: every component of `src/design-system` and every state it
 * declares, at real size, on the real device.
 *
 * It is not one of the eight screens and it is not a route in the tab bar: it is
 * reachable only by `#/galeria`, so the four tabs stay four. It holds exactly one
 * piece of state — the skin — because the owner has to compare both on the phone;
 * everything else is literal props and `noop`, with no storage, no fetch and no
 * import from `src/storage`, `src/features` or `src/pwa`.
 */

import { useEffect, useState } from 'react';
import { BasicsSections } from './BasicsSections';
import { ChartSections } from './ChartSections';
import { DataSections } from './DataSections';
import { FeedbackSections } from './FeedbackSections';
import { SessionSections } from './SessionSections';
import './gallery.css';

/** Skin B is the default of the artboard and the owner's reference; A is the orange one. */
type Skin = 'b' | 'a';

/**
 * A cheap, honest build stamp: the mode the bundle was built in plus the date the
 * served page carries. No version file, no extra dependency, nothing to keep in sync.
 */
function buildStamp(): string {
  const lastModified = new Date(document.lastModified);
  const served = Number.isNaN(lastModified.getTime())
    ? null
    : lastModified.toLocaleString('es-ES', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });

  return served === null ? `build ${import.meta.env.MODE}` : `build ${import.meta.env.MODE} · página ${served}`;
}

export function GalleryScreen(): React.ReactElement {
  const [skin, setSkin] = useState<Skin>('b');

  // The only state of the page, and the only thing it writes outside its own tree.
  // Leaving the route removes the attribute so the app keeps the default skin.
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-skin', skin);
    return () => {
      root.removeAttribute('data-skin');
    };
  }, [skin]);

  return (
    <div className="gallery">
      <header className="gallery__header">
        <h1 className="ds-screen-title">Galería de revisión del sistema de diseño</h1>
        <p className="ds-body">
          Esta página es una revisión, no una pantalla de la app: muestra cada componente y cada
          estado a tamaño real para aprobar el diseño o corregirlo antes de construir las ocho
          pantallas encima.
        </p>
        <p className="ds-caption">
          Se abre solo con el hash <code>#/galeria</code>: no es una quinta pestaña. No guarda nada,
          no lee datos y no forma parte de la app instalada.
        </p>

        <div className="gallery__skin" role="group" aria-label="Skin del sistema de diseño">
          <button
            type="button"
            className="gallery-skin"
            aria-pressed={skin === 'b'}
            onClick={() => setSkin('b')}
          >
            Skin B · lima
          </button>
          <button
            type="button"
            className="gallery-skin"
            aria-pressed={skin === 'a'}
            onClick={() => setSkin('a')}
          >
            Skin A · naranja
          </button>
        </div>
        <p className="ds-caption">
          Skin B es el valor por defecto (tarjetas de 16 px, controles en píldora); Skin A es la
          variante naranja (tarjetas de 12 px, controles de 10 px). La elección no se guarda: al
          recargar vuelve a Skin B. El tema claro u oscuro lo decide el ajuste del iPhone.
        </p>

        <p className="ds-caption">{buildStamp()}</p>
        <p className="ds-caption">
          Referencia: 393 × 852 CSS px. Sin scroll horizontal y con objetivos táctiles de 48 px o
          más; el padding y las áreas seguras son los del shell de la app.
        </p>

        <a className="gallery__back" href="#/inicio">
          Volver a Inicio
        </a>
      </header>

      <BasicsSections />
      <DataSections />
      <SessionSections />
      <FeedbackSections />
      <ChartSections />
    </div>
  );
}
