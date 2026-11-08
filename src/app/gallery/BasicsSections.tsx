/*
 * The building blocks every screen repeats: icons, the two actions, cards and their
 * section label, chips, numerals and the list row.
 *
 * Plain literal props only — no storage, no fetch, no state, no handlers beyond
 * `noop`. Copy is the artboard's, word for word where the artboard has a word.
 */

import {
  Card,
  Chip,
  DataRow,
  Icon,
  Numeral,
  PrimaryAction,
  SectionLabel,
  TextButton,
  type IconName,
} from '../../design-system';
import { Demo, Row, Section, noop } from './parts';

const ICONS: readonly IconName[] = [
  'home',
  'train',
  'chart',
  'person',
  'chevronLeft',
  'chevronRight',
  'chevronDown',
  'play',
  'clock',
  'heart',
  'watch',
  'export',
  'dumbbell',
  'barbell',
  'machine',
  'cable',
  'band',
  'calendar',
  'scale',
  'plus',
  'minus',
  'check',
  'moon',
  'backspace',
];

export function BasicsSections(): React.ReactElement {
  return (
    <>
      <Section
        name="Icon"
        note="24 glifos sobre una rejilla de 24 × 24, trazo 1,8, currentColor. Decorativos salvo que reciban label."
      >
        <Demo state="Todos los glifos">
          <div className="gallery-icons">
            {ICONS.map((name) => (
              <span key={name} className="gallery-icons__cell">
                <Icon name={name} size={22} />
              </span>
            ))}
          </div>
        </Demo>
      </Section>

      <Section
        name="PrimaryAction"
        note="56 px, ancho completo, relleno de acento. Una sola por pantalla (§7.1). El estado pulsado es :active, así que no tiene forma estática; «loading» no existe porque ninguna acción espera a la red."
      >
        <Demo state="Activo con icono">
          <PrimaryAction icon="play" onClick={noop}>
            Empezar entrenamiento
          </PrimaryAction>
        </Demo>
        <Demo state="Activo sin icono">
          <PrimaryAction onClick={noop}>Confirmar serie</PrimaryAction>
        </Demo>
        <Demo state="Deshabilitado">
          <PrimaryAction disabled onClick={noop}>
            Continuar
          </PrimaryAction>
        </Demo>
      </Section>

      <Section
        name="TextButton"
        note="La acción secundaria en texto de acento. Su área táctil de 48 px sale del padding, nunca de un contenedor que mueva el diseño."
      >
        <Demo state="Activo">
          <TextButton onClick={noop}>Cambiar</TextButton>
        </Demo>
        <Demo state="Con icono">
          <TextButton icon="plus" onClick={noop}>
            Añadir
          </TextButton>
        </Demo>
        <Demo state="Alineado al inicio (sobre una fila)">
          <TextButton align="start" onClick={noop}>
            Editar rutina
          </TextButton>
        </Demo>
        <Demo state="Deshabilitado">
          <TextButton disabled onClick={noop}>
            Cambiar
          </TextButton>
        </Demo>
      </Section>

      <Section
        name="Card"
        note="Superficie con borde de un píxel, sin sombra y nunca anidada. El padding es un token y la altura no está fijada: con texto grande la tarjeta crece en vez de recortar."
      >
        <Demo state="padding=default">
          <Card>
            <p className="ds-body">Peso muerto / Tracción</p>
            <p className="ds-meta">6 ejercicios · 55 min aprox.</p>
          </Card>
        </Demo>
        <Demo state="padding=dense">
          <Card padding="dense">
            <p className="ds-body">Peso muerto / Tracción</p>
            <p className="ds-meta">6 ejercicios · 55 min aprox.</p>
          </Card>
        </Demo>
        <Demo state="padding=list (filas de lista)">
          <Card padding="list">
            <DataRow title="Sentadilla" subtitle="Pierna · barra" value="100" valueUnit="kg" />
            <DataRow title="Peso muerto" subtitle="Cadena posterior · barra" value="120" valueUnit="kg" />
          </Card>
        </Demo>
        <Demo
          state="padding=none"
          note="Para contenido que dibuja hasta el borde: el numeral toca la esquina."
        >
          <Card padding="none">
            <Numeral size="metric-small" value="92,5" unit="kg" />
          </Card>
        </Demo>
        <Demo state="Con label de grupo (role=group, aria-label)">
          <Card label="Última sesión">
            <SectionLabel icon={<Icon name="barbell" size={14} />}>Última sesión · lunes</SectionLabel>
            <p className="ds-body">Empuje · 18 series · 8.280 kg</p>
          </Card>
        </Demo>
      </Section>

      <Section
        name="SectionLabel"
        note="La etiqueta de 13 px en mayúsculas que introduce un bloque."
      >
        <Demo state="Con icono">
          <SectionLabel icon={<Icon name="calendar" size={14} />}>Hoy toca</SectionLabel>
        </Demo>
        <Demo state="Sin icono">
          <SectionLabel>Últimas 6 sesiones</SectionLabel>
        </Demo>
      </Section>

      <Section
        name="Chip"
        note="Siempre lleva una palabra: el color nunca es el único portador del significado. Como control es un botón real con aria-pressed y 48 px de área táctil alrededor de la píldora de 26 px."
      >
        <Demo state="Variante estática, todos los tonos">
          <div className="gallery-chips">
            <Chip>Cadena posterior</Chip>
            <Chip tone="success" dot>
              RÉCORD
            </Chip>
            <Chip tone="warning">saltada</Chip>
            <Chip tone="danger" dot>
              molestia
            </Chip>
            <Chip tone="accent" dot>
              duro
            </Chip>
            <Chip tone="solid" icon="barbell">
              Barra
            </Chip>
          </div>
        </Demo>
        <Demo state="Variante de control, sin pulsar">
          <div className="gallery-chips">
            <Chip onClick={noop} label="Esfuerzo: fácil">
              fácil
            </Chip>
            <Chip onClick={noop} label="Esfuerzo: correcto">
              correcto
            </Chip>
            <Chip onClick={noop} label="Esfuerzo: duro">
              duro
            </Chip>
            <Chip onClick={noop} label="Esfuerzo: fallo">
              fallo
            </Chip>
          </div>
        </Demo>
        <Demo state="Variante de control, pulsado (aria-pressed=true)">
          <div className="gallery-chips">
            <Chip onClick={noop} pressed label="Esfuerzo: correcto">
              correcto
            </Chip>
            <Chip onClick={noop} pressed tone="danger" label="Molestia: dolor">
              dolor
            </Chip>
          </div>
        </Demo>
        <Demo state="Con icono y sin punto">
          <div className="gallery-chips">
            <Chip icon="calendar">semana 2 de 4</Chip>
            <Chip icon="barbell">Barra</Chip>
          </div>
        </Demo>
      </Section>

      <Section
        name="Numeral"
        note="Cifras tabulares en tres tamaños y tres tonos; la unidad va más pequeña y la coma decimal llega ya puesta en el texto."
      >
        <Demo state="size=metric (44 px)">
          <Numeral size="metric" value="9.120" unit="kg" />
        </Demo>
        <Demo state="size=metric-small (28 px)">
          <Numeral size="metric-small" value="92,5" unit="kg" />
        </Demo>
        <Demo state="size=inline (17 px)">
          <Numeral value="1:45" />
        </Demo>
        <Demo state="Los tres tonos">
          <Row>
            <Numeral size="metric-small" value="78,4" unit="kg" />
            <Numeral size="metric-small" tone="muted" value="78,4" unit="kg" />
            <Numeral size="metric-small" tone="accent" value="78,4" unit="kg" />
          </Row>
        </Demo>
      </Section>

      <Section
        name="DataRow"
        note="La fila única de la app. Con onSelect es un botón con nombre de frase y chevron; sin onSelect es texto inerte y no dibuja chevron, porque un chevron promete navegación."
      >
        <Demo state="state=none">
          <DataRow title="Sentadilla" subtitle="Pierna · barra" value="100" valueUnit="kg" />
        </Demo>
        <Demo state="state=done">
          <DataRow
            title="Lunes"
            subtitle="Empuje · 6 ejercicios"
            state="done"
            value="8.280"
            valueUnit="kg"
          />
        </Demo>
        <Demo state="state=today">
          <DataRow title="Miércoles" subtitle="Hoy toca" state="today" />
        </Demo>
        <Demo state="status con tono muted">
          <DataRow
            title="Peso corporal"
            subtitle="Última medición"
            value="78,4"
            valueUnit="kg"
            status={{ word: 'hace 3 días', tone: 'muted' }}
          />
        </Demo>
        <Demo state="status con tono success">
          <DataRow
            title="Sentadilla"
            subtitle="Serie top"
            value="100"
            valueUnit="kg"
            status={{ word: 'RÉCORD', tone: 'success' }}
          />
        </Demo>
        <Demo state="status con tono accent">
          <DataRow title="Peso muerto" subtitle="Sesión de hoy" value="92,5" valueUnit="kg" status={{ word: 'En curso', tone: 'accent' }} />
        </Demo>
        <Demo state="Con insignia de icono">
          <DataRow icon="scale" title="Peso corporal" subtitle="Media de 7 días" value="78,4" valueUnit="kg" />
        </Demo>
        <Demo state="Con chip a la derecha">
          <DataRow
            title="Readaptación"
            subtitle="Bloque en curso"
            chip={<Chip>semana 2 de 4</Chip>}
          />
        </Demo>
        <Demo state="Navegable (botón + chevron)">
          <DataRow
            title="Peso muerto / Tracción"
            subtitle="Miércoles 8 · 55 min"
            value="8.280"
            valueUnit="kg"
            onSelect={noop}
            selectLabel="Abrir el resumen del miércoles 8, peso muerto y tracción"
          />
        </Demo>
      </Section>
    </>
  );
}
