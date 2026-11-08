/**
 * Instalación y versión — design-system §2.5, §7.8 and architecture §2.1.1, P-11.
 *
 * This is where the current mode is stated once (`Instalada` / `En una pestaña de
 * Safari`) and where the two install taps live as copy, because Safari exposes no
 * install API: there is no `beforeinstallprompt` on iOS, so text is the whole
 * affordance. The version and the document format are the two facts the backup
 * depends on.
 *
 * There is no health row here and none anywhere: the app has no health integration, so
 * there is nothing that could be shown as connected (S7, FR-15).
 *
 * The update prompt lives at the top of the screen as the platform banner of §7.8; this
 * card does not repeat it.
 */

import { Card, DataRow, SectionLabel } from '../../design-system';
import { APP_VERSION } from './copy';
import type { InstallState } from './device-mode';
import { Note } from './fields';

export interface InstallGroupProps {
  readonly install: InstallState;
  readonly schemaVersion: number;
}

export function InstallGroup({ install, schemaVersion }: InstallGroupProps): React.ReactElement {
  return (
    <section className="profile__section">
      <SectionLabel>Instalación y versión</SectionLabel>

      <Card padding="list">
        <DataRow
          title="Modo"
          subtitle={install.mode === 'installed' ? 'Pantalla de inicio' : 'Safari, con barra del navegador'}
          value={install.word}
        />
        <DataRow title="Versión de la app" value={APP_VERSION} />
        <DataRow title="Formato de copia" value={String(schemaVersion)} />
      </Card>

      {install.advisory === null ? (
        <Note>
          Instalada: Safari no aplica el límite de siete días a los datos de una app en la
          pantalla de inicio. No es una garantía de permanencia; la copia exportada sigue
          siendo la única copia durable.
        </Note>
      ) : (
        <>
          <Note>Para instalarla: {install.advisory.text}. Desde Safari, no desde otra app.</Note>
          <Note>
            Instalar no hace una copia: al desinstalar se borra el contenedor. Exporta antes.
          </Note>
        </>
      )}
    </section>
  );
}
