/**
 * Perfil — profile and goals, units, the exercise library entry, training settings,
 * backup, storage, install and update (design-system §8, task T7; specs S2, S5, S6).
 *
 * The screen is a column of named sections in reading order, and the three platform
 * states come first because each is a fact the owner must be able to see without
 * scrolling:
 *
 * | group            | states that exist                                                       |
 * | ---------------- | ----------------------------------------------------------------------- |
 * | platform banners | storage evicted, not installed, update available                        |
 * | Perfil           | no profile yet, saved, save failed                                      |
 * | Entrenamiento    | rest timer on/off, days per week, equipment, empty equipment, library    |
 * | Copia            | export idle / in progress / done / **result unknown** / impossible;      |
 * |                  | import idle / invalid (with its path) / valid / restoring / merging /     |
 * |                  | failed / report                                                         |
 * | Almacenamiento   | what is stored, space if the browser says, persistence unknown/yes/no,   |
 * |                  | deletion closed / open / confirmed / in progress / failed / done         |
 * | Instalación      | installed or in a tab, app version, backup format version                |
 *
 * Two rows of the approved artboard are replaced, and the replacements are recorded in
 * the task report: there is no Apple Health and no watch, so those rows become the
 * honest statement of §7.8; and the artboard's "descanso no se configura aquí" footnote
 * becomes the real `Descanso automático` switch, because the session state machine
 * already reads `profile.autoStartRestTimer`.
 *
 * Nothing here reads the clock on its own: `useAppServices()` provides the one clock,
 * and the export file name and the launch marker both come from it.
 */

import { useCallback, useRef, useState } from 'react';
import {
  Banner,
  Card,
  DataRow,
  ErrorBanner,
  SectionLabel,
  Stepper,
  TextButton,
} from '../../design-system';
import { EQUIPMENT_TYPES, type Equipment } from '../../core/domain';
import { BACKUP_SCHEMA_VERSION, type UserProfile } from '../../storage';
import { useAppServices } from '../../app/providers';
import { createProfileId } from './browser-edges';
import { ChipChoices, CommitField, Note, ToggleRow } from './fields';
import { dataState, evictionCopy } from './launch-marker';
import { installState } from './device-mode';
import { updateState } from './update-state';
import { BackupGroup } from './BackupGroup';
import { InstallGroup } from './InstallGroup';
import { StorageGroup } from './StorageGroup';
import { useBackupExport } from './useBackupExport';
import { useProfileData, useUpdateWatch } from './useProfileData';
import {
  EQUIPMENT_WORD,
  HEALTH_DETAIL,
  HEALTH_NOTE,
  MASS_UNITS,
  MASS_UNIT_WORD,
  WEIGHT_GOALS,
  WEIGHT_GOAL_WORD,
  defaultProfile,
} from './copy';
import './profile.css';

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export function ProfileScreen(): React.ReactElement {
  const { storage, clock } = useAppServices();
  const { data, markerStore, reload } = useProfileData();
  const update = useUpdateWatch();
  const exportControl = useBackupExport({ storage, clock, markerStore });

  const [saveFailed, setSaveFailed] = useState(false);
  const profileRef = useRef<UserProfile | null>(null);
  const draftId = useRef<string | null>(null);
  const lastPatch = useRef<Partial<UserProfile>>({});
  const importAnchor = useRef<HTMLDivElement | null>(null);

  profileRef.current = data.profile;

  const writeProfile = useCallback(
    (patch: Partial<UserProfile>): void => {
      lastPatch.current = patch;
      draftId.current ??= createProfileId(clock.now());
      const base = profileRef.current ?? defaultProfile(draftId.current);
      void (async () => {
        try {
          await storage.profile.save({ ...base, ...patch });
          setSaveFailed(false);
          await reload();
        } catch {
          setSaveFailed(true);
        }
      })();
    },
    [clock, reload, storage],
  );

  const installed = installState(data.installed);
  const updateView = updateState({
    waiting: update.runtime.waiting,
    sessionRunning: data.sessionRunning,
    applying: update.applying,
  });
  const state = data.marker === null ? 'first-run' : dataState(data.marker, data.snapshot);
  const ready = data.phase === 'ready';

  const goToImport = (): void => {
    importAnchor.current?.scrollIntoView({
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
      block: 'start',
    });
    importAnchor.current?.focus();
  };

  return (
    <div className="profile">
      <h1 className="ds-screen-title">Perfil</h1>

      {/* §7.8: the evicted state is the only platform state that is not dismissible. */}
      {state === 'evicted' && data.marker !== null ? (
        <Banner
          tone="danger"
          title={evictionCopy(data.marker)}
          action={{ label: 'Importar copia', onClick: goToImport }}
        />
      ) : null}

      {installed.advisory === null ? null : (
        <Banner
          tone="warning"
          title={installed.advisory.title}
          action={{ label: 'Exportar copia', onClick: () => exportControl.start() }}
        />
      )}

      {updateView.phase === 'idle' ? null : (
        <Banner
          tone="warning"
          title={updateView.title ?? 'Hay una versión nueva.'}
          {...(updateView.text === null ? {} : { text: updateView.text })}
          {...(updateView.actionLabel === null
            ? {}
            : {
                action: {
                  label: updateView.actionLabel,
                  onClick: update.applyUpdate,
                  disabled: !updateView.actionEnabled,
                },
              })}
        />
      )}

      {data.phase === 'failed' && data.error !== null ? (
        <ErrorBanner message={data.error} onRetry={() => void reload()} />
      ) : null}

      {data.phase === 'loading' ? <p className="ds-meta">Leyendo tus datos…</p> : null}

      {ready ? (
        <>
          <ProfileSection
            profile={data.profile}
            saveFailed={saveFailed}
            onWrite={writeProfile}
            onRetry={() => writeProfile(lastPatch.current)}
          />

          {data.profile === null ? null : (
            <>
              <TrainingSection
                profile={data.profile}
                libraryCount={data.snapshot.exercises}
                customCount={data.snapshot.customExercises}
                onWrite={writeProfile}
              />
              <Note>
                {HEALTH_NOTE} {HEALTH_DETAIL}
              </Note>
            </>
          )}

          <BackupGroup
            storage={storage}
            exportControl={exportControl}
            onChanged={() => void reload()}
            importAnchor={importAnchor}
          />

          <StorageGroup
            storage={storage}
            snapshot={data.snapshot}
            usage={data.usage}
            answer={data.storageAnswer}
            onChanged={() => void reload()}
          />

          <InstallGroup install={installed} schemaVersion={BACKUP_SCHEMA_VERSION} />
        </>
      ) : null}

      {update.runtime.detail === null ? null : (
        <Note>
          Sin service worker en esta visita: la app funciona, pero la copia offline depende de la
          siguiente carga. ({update.runtime.detail})
        </Note>
      )}
    </div>
  );
}

interface ProfileSectionProps {
  readonly profile: UserProfile | null;
  readonly saveFailed: boolean;
  readonly onWrite: (patch: Partial<UserProfile>) => void;
  readonly onRetry: () => void;
}

/** Nombre, objetivo de peso y unidades: everything FR-1.3 lets the owner change here. */
function ProfileSection({
  profile,
  saveFailed,
  onWrite,
  onRetry,
}: ProfileSectionProps): React.ReactElement {
  return (
    <section className="profile__section">
      <SectionLabel>Perfil</SectionLabel>

      {profile === null ? (
        <Card>
          <p className="ds-body">
            Todavía no hay perfil. Crea uno con los valores de partida y ajústalo aquí.
          </p>
          <TextButton align="start" onClick={() => onWrite({})}>
            Crear perfil
          </TextButton>
        </Card>
      ) : (
        <Card>
          <CommitField
            label="Nombre"
            hint="Opcional. Solo se usa para saludarte en Inicio."
            value={profile.displayName ?? ''}
            placeholder="Sin nombre"
            onCommit={(value) => onWrite({ displayName: value.trim() === '' ? null : value.trim() })}
          />

          <span className="ds-meta">Objetivo de peso</span>
          <ChipChoices
            label="Objetivo de peso"
            choices={WEIGHT_GOALS.map((goal) => ({ value: goal, word: WEIGHT_GOAL_WORD[goal] }))}
            selected={profile.weightGoal === null ? [] : [profile.weightGoal]}
            onToggle={(goal) => onWrite({ weightGoal: profile.weightGoal === goal ? null : goal })}
          />
          <p className="ds-caption">
            {profile.weightGoal === null
              ? 'Sin objetivo. Toca uno para fijarlo.'
              : 'Toca el objetivo otra vez para quitarlo.'}
          </p>

          <span className="ds-meta">Unidades</span>
          <ChipChoices
            label="Unidades"
            choices={MASS_UNITS.map((unit) => ({ value: unit, word: MASS_UNIT_WORD[unit] }))}
            selected={[profile.massUnit]}
            onToggle={(unit) => onWrite({ massUnit: unit })}
          />
          <p className="ds-caption">
            Los pesos se guardan siempre en kilogramos; la unidad solo cambia cómo se escriben.
          </p>
        </Card>
      )}

      {saveFailed ? (
        <ErrorBanner message="No se pudo guardar el perfil. Inténtalo otra vez." onRetry={onRetry} />
      ) : null}
    </section>
  );
}

interface TrainingSectionProps {
  readonly profile: UserProfile;
  readonly libraryCount: number;
  readonly customCount: number;
  readonly onWrite: (patch: Partial<UserProfile>) => void;
}

/**
 * Training settings. The rest switch is not decoration: `src/core/session` reads
 * `autoStartRestTimer` from the profile at boot, so this is the only place it is set.
 */
function TrainingSection({
  profile,
  libraryCount,
  customCount,
  onWrite,
}: TrainingSectionProps): React.ReactElement {
  return (
    <section className="profile__section">
      <SectionLabel>Entrenamiento</SectionLabel>

      <Card>
        <div className="profile__row">
          <span className="profile__row-text">
            <span className="ds-body">Días por semana</span>
            <span className="ds-meta">Los días que planeas entrenar.</span>
          </span>
          <Stepper
            label="Días por semana"
            value={profile.weeklyTrainingDays}
            min={1}
            max={7}
            onChange={(days) => onWrite({ weeklyTrainingDays: days })}
          />
        </div>

        <ToggleRow
          title="Descanso automático"
          subtitle="Empieza el descanso al confirmar una serie."
          on={profile.autoStartRestTimer}
          onChange={(on) => onWrite({ autoStartRestTimer: on })}
        />

        <span className="ds-meta">Equipo disponible</span>
        <ChipChoices
          label="Equipo disponible"
          choices={EQUIPMENT_TYPES.map((equipment) => ({
            value: equipment,
            word: EQUIPMENT_WORD[equipment],
          }))}
          selected={profile.availableEquipment}
          onToggle={(equipment) => onWrite({ availableEquipment: toggle(profile, equipment) })}
        />
        {profile.availableEquipment.length === 0 ? (
          <Note>Sin equipo marcado no hay ejercicios que sugerir en Entrenar.</Note>
        ) : null}

        <DataRow
          title="Ejercicios"
          subtitle={customCount > 0 ? `Biblioteca y rutina · ${customCount} propios` : 'Biblioteca y rutina'}
          value={String(libraryCount)}
          onSelect={() => {
            window.location.hash = '#/entrenar';
          }}
          selectLabel={`Ejercicios, ${libraryCount} en la biblioteca. Abre Entrenar.`}
        />
      </Card>
    </section>
  );
}

/** Toggling equipment: the list is the owner's, and an empty list is explained above. */
function toggle(profile: UserProfile, equipment: Equipment): readonly Equipment[] {
  return profile.availableEquipment.includes(equipment)
    ? profile.availableEquipment.filter((entry) => entry !== equipment)
    : [...profile.availableEquipment, equipment];
}
