/*
 * The design review page: every component of `src/design-system` and every state it
 * declares, at real size, on the real device.
 *
 * It is not one of the eight screens and it is not a route in the tab bar: it is
 * reachable only by `#/galeria`, so the four tabs stay four. It holds no state at all:
 * every section is literal props and `noop`, with no storage, no fetch and no import
 * from `src/storage`, `src/features` or `src/pwa`.
 */

import { BasicsSections } from './BasicsSections';
import { ChartSections } from './ChartSections';
import { DataSections } from './DataSections';
import { FeedbackSections } from './FeedbackSections';
import { ArtSections } from './ArtSections';
import { SessionSections } from './SessionSections';
import './gallery.css';

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

        <p className="ds-caption">
          Un solo acento violeta (#a892ff), tarjetas de 16 px, controles en píldora y fondo
          oscuro: no hay una segunda paleta ni un selector que la cambie.
        </p>
        <p className="ds-caption">
          El tema es oscuro y no hay otro en uso: el bloque <code>data-theme="light"</code> sigue
          en los tokens, pero nada lo activa y ningún ajuste del iPhone cambia la paleta.
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
      <ArtSections />
      <FeedbackSections />
      <ChartSections />
    </div>
  );
}
