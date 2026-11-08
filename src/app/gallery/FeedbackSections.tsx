/*
 * Everything the app says inline: what is missing, the three platform states, the
 * recoverable error and the readaptation phase header.
 *
 * All of it is inline and non-blocking. Nothing here opens an alert, a confirm or a
 * modal for a condition the owner can recover from (§7.8, §11).
 */

import { Banner, EmptyState, ErrorBanner, PhaseBanner } from '../../design-system';
import { Demo, Section, noop } from './parts';

export function FeedbackSections(): React.ReactElement {
  return (
    <>
      <Section
        name="EmptyState"
        note="Una frase que dice qué falta y la única acción que lo arregla. No regaña, no bloquea y nunca dibuja un gráfico vacío."
      >
        <Demo state="Con acción">
          <EmptyState action={{ label: 'Empezar entrenamiento', onClick: noop }}>
            Todavía no hay sesiones. Cuando termines la primera, aparecerá aquí con su
            recomendación y sus series.
          </EmptyState>
        </Demo>
        <Demo state="Sin acción">
          <EmptyState>Sin récords hoy. No hace falta que cada sesión los tenga.</EmptyState>
        </Demo>
        <Demo state="Datos de salud (S7: no hay origen que pueda estar vacío)">
          <EmptyState>Todavía no hay datos de salud importados. Esto no impide entrenar.</EmptyState>
        </Demo>
      </Section>

      <Section
        name="Banner"
        note="Aviso en línea con tono, acción opcional y divulgación opcional. Aquí viven los tres estados de plataforma: datos borrados (danger), app no instalada (warning) y versión nueva (warning)."
      >
        <Demo state="tone=info">
          <Banner
            title="Todo se guarda en este iPhone."
            text="No hay cuenta, ni servidor, ni sincronización."
          />
        </Demo>
        <Demo state="tone=warning · no instalada">
          <Banner
            tone="warning"
            title="Guarda Rupfit en la pantalla de inicio para que Safari no borre tus datos."
            text="Compartir → Añadir a pantalla de inicio"
            action={{ label: 'Exportar copia', onClick: noop }}
          />
        </Demo>
        <Demo state="tone=danger · datos borrados (el único no descartable)">
          <Banner
            tone="danger"
            title="Los datos guardados ya no están. Importa tu copia si la tienes."
            text="Última copia: 5 de noviembre"
            action={{ label: 'Importar copia', onClick: noop }}
          />
        </Demo>
        <Demo state="tone=warning · versión nueva (acción deshabilitada en sesión)">
          <Banner
            tone="warning"
            title="Hay una versión nueva. Se aplicará al terminar la sesión."
            action={{ label: 'Actualizar ahora', onClick: noop, disabled: true }}
          />
        </Demo>
        <Demo state="tone=success">
          <Banner tone="success" title="Copia exportada." text="Rupfit-2025-11-05.json · 42 KB" />
        </Demo>
        <Demo state="Con divulgación">
          <Banner
            title="Bloque de readaptación"
            text="Del 60 % al 80 % del peso previo."
            onOpen={noop}
            openLabel="Ver los criterios del bloque"
          />
        </Demo>
      </Section>

      <Section
        name="ErrorBanner"
        note="role=status, nunca un alert ni un modal: dice su línea, ofrece «Reintentar» y deja la sesión donde está."
      >
        <Demo state="Con Reintentar">
          <ErrorBanner message="No se pudo guardar la serie 2. Sigue en la pantalla." onRetry={noop} />
        </Demo>
        <Demo state="Sin Reintentar (reintentar no sirve)">
          <ErrorBanner message="No se pudo exportar la copia. Prueba otra vez desde Perfil." />
        </Demo>
      </Section>

      <Section
        name="PhaseBanner"
        note="Solo en readaptación. Deliberadamente silencioso: superficie elevada, sin relleno de acento. Informa, no alarma."
      >
        <Demo state="Con explicación y divulgación">
          <PhaseBanner
            week={2}
            totalWeeks={4}
            explanation="Bloque de readaptación · 4 semanas · del 60 % al 80 % del peso previo."
            onOpen={noop}
          />
        </Demo>
        <Demo state="Solo el título">
          <PhaseBanner week={2} totalWeeks={4} />
        </Demo>
      </Section>
    </>
  );
}
