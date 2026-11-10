/**
 * Perfil — profile and goals, units, the exercise library entry, training settings,
 * backup, storage, install and update (design-system §8, task T7; specs S2, S5, S6).
 *
 * The screen is a column of named sections in reading order, and the three platform
 * states come first because each is a fact the owner must be able to see without
 * scrolling. After them the order is the owner's own data first and the operational
 * details last: who they are and how they train, then the copy, the store and the build.
 * A setting is a compact labelled row inside one card, never a section of its own.
 *
 * | group            | states that exist                                                       |
 * | ---------------- | ----------------------------------------------------------------------- |
 * | platform banners | storage evicted, not installed, update available                        |
 * | Tu perfil        | no profile yet, saved, save failed                                      |
 * | Cuenta           | no project, signed out, signed in; sync synced / offline / syncing /    |
 * |                  | pending / failed (spec S2, S8)                                          |
 * | Entrenamiento    | days per week, equipment, empty equipment, goal, units, library entry  |
 * | Copia            | export idle / in progress / done / **result unknown** / impossible;      |
 * |                  | import idle / invalid (with its path) / valid / restoring / merging /     |
 * |                  | failed / report                                                         |
 * | Almacenamiento   | what is stored, space if the browser says, persistence unknown/yes/no,   |
 * |                  | deletion closed / open / confirmed / in progress / failed / done         |
 * | Instalación      | installed or in a tab, app version, backup format version                |
 *
 * The identity card carries the one mark of this screen, an `R` monogram, and no
 * artwork: the app has no photo, no level and no notification of its own, so the card
 * states the name and what the profile currently says (`goalsLine`) instead.
 *
 * Nothing here reads the clock on its own: `useAppServices()` provides the one clock,
 * and the export file name and the launch marker both come from it.
 */

import { Suspense, lazy, useCallback, useMemo, useRef, useState } from 'react';
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
import { useSync } from '../../cloud/useSync';
import { createProfileId } from './browser-edges';
import { ChipChoices, CommitField, Note } from './fields';
import { dataState, evictionCopy } from './launch-marker';
import { installState } from './device-mode';
import { updateState } from './update-state';
// The account card is the only thing in the app that needs the Supabase client, and that
// client is most of a chunk on its own. Loading it with the screen would make every install
// pay 60 kB gzip for a feature most launches never open; splitting it means the shell stays
// where it was and the account code arrives when Perfil does.
const AccountGroup = lazy(async () => {
  const module = await import('./AccountGroup');
  return { default: module.AccountGroup };
});
import type { AccountSyncView } from './account-sync';
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
  goalsLine,
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
  const { storage, cloud, clock } = useAppServices();
  const { data, markerStore, reload } = useProfileData();
  const update = useUpdateWatch();
  const exportControl = useBackupExport({ storage, clock, markerStore });

  // One sync service per session, behind the card: signed out — or on a build with no
  // project — this stays `sin conexión` and does no work. It never makes a screen wait.
  // `historyAt` is the launch marker's instant, and it is what the history migration
  // stamps a configuration row with: such a row has never had an instant of its own.
  const now = useCallback(() => clock.now(), [clock]);
  const historyAt = data.marker?.firstLaunchAt ?? null;
  const sync = useSync({ storage: cloud.storage, subscribeWrites: cloud.written, now, historyAt });
  const accountSync = useMemo<AccountSyncView>(
    () => ({
      phase: sync.phase,
      pendingCount: sync.pending,
      lastSyncedAt: sync.lastSyncedAt,
      migrated: sync.migrated,
      reason: sync.reason,
      onSync: sync.syncNow,
      onRetry: sync.syncNow,
    }),
    [sync.phase, sync.pending, sync.lastSyncedAt, sync.migrated, sync.reason, sync.syncNow],
  );

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
    const anchor = importAnchor.current;
    if (anchor === null) return;
    // The import form is intentionally tucked behind a native disclosure so export stays
    // visible and the most-used profile controls keep first place. An eviction banner is
    // a direct request to restore: open the disclosure before moving focus into it.
    anchor.closest('details')?.setAttribute('open', '');
    anchor.scrollIntoView({
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
      block: 'start',
    });
    anchor.focus();
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

          {/* Above the settings: the account is the one fact that explains where the
              training goes, and the sync state has to be visible without scrolling. */}
          <Suspense fallback={null}>
            <AccountGroup sync={accountSync} />
          </Suspense>

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

/** Nombre y la línea que resume el perfil: the identity card of the screen. The mark is
 *  a monogram, not a photo; the summary under the name is derived from `UserProfile`
 *  (`goalsLine`) so no decorative sentence has to be invented.
 *
 *  El nombre es un dato, no un campo (spec S1, L3): llega de la cuenta al entrar y se
 *  enseña aquí, sin entrada que lo cambie, porque ya es suyo. Solo cuando no hay nombre —
 *  modo local, o un perfil que nunca tuvo uno — queda el campo, que es la última forma de
 *  ponerlo. `displayName` se queda en el modelo y en la copia de seguridad. */
function ProfileSection({
  profile,
  saveFailed,
  onWrite,
  onRetry,
}: ProfileSectionProps): React.ReactElement {
  const name = profile?.displayName ?? null;

  return (
    <section className="profile__section">
      <Card>
        <div className="profile__identity">
          <span className="profile__monogram" aria-hidden="true">
            <img
              className="profile__mark"
              src={`${import.meta.env.BASE_URL}logo-mark.svg`}
              alt=""
              width={44}
              height={44}
            />
          </span>

          <div className="profile__identity-text">
            {profile === null ? (
              <>
                <p className="ds-body">
                  Todavía no hay perfil. Crea uno con los valores de partida y ajústalo aquí.
                </p>
                <TextButton align="start" onClick={() => onWrite({})}>
                  Crear perfil
                </TextButton>
              </>
            ) : (
              <>
                {name === null ? (
                  <CommitField
                    label="Nombre"
                    hint="Opcional. Solo se usa para saludarte en Inicio."
                    value=""
                    placeholder="Sin nombre"
                    onCommit={(value) =>
                      onWrite({ displayName: value.trim() === '' ? null : value.trim() })
                    }
                  />
                ) : (
                  <>
                    <p className="ds-card-title">{name}</p>
                    <span className="ds-meta">El nombre viene de tu cuenta.</span>
                  </>
                )}
                <p className="ds-caption">{goalsLine(profile)}</p>
              </>
            )}
          </div>
        </div>
      </Card>

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
 * Training settings, one compact labelled row each. Goal and units sit here because both
 * change how a training number is read, and neither deserves a section of its own.
 *
 * There is no `Descanso automático` switch: the session has no rest timer (S5).
 * `UserProfile.autoStartRestTimer` stays in the stored model — removing a field needs a
 * migration — but nothing reads it, so offering the switch would be a lie.
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

      <Card padding="list" className="profile__settings">
        <div className="profile__setting">
          <div className="profile__setting-head">
            <span className="profile__setting-text">
              <span className="profile__setting-label">Días por semana</span>
              <span className="ds-caption">Los días que planeas entrenar.</span>
            </span>
            <Stepper
              label="Días por semana"
              value={profile.weeklyTrainingDays}
              min={1}
              max={7}
              onChange={(days) => onWrite({ weeklyTrainingDays: days })}
            />
          </div>
        </div>

        <div className="profile__setting">
          <span className="profile__setting-label">Equipo disponible</span>
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
        </div>

        <div className="profile__setting">
          <span className="profile__setting-label">Objetivo de peso</span>
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
        </div>

        <div className="profile__setting">
          <span className="profile__setting-label">Unidades</span>
          <ChipChoices
            label="Unidades"
            choices={MASS_UNITS.map((unit) => ({ value: unit, word: MASS_UNIT_WORD[unit] }))}
            selected={[profile.massUnit]}
            onToggle={(unit) => onWrite({ massUnit: unit })}
          />
          <p className="ds-caption">
            Los pesos se guardan siempre en kilogramos; la unidad solo cambia cómo se escriben.
          </p>
        </div>

        <DataRow
          title="Ejercicios"
          subtitle={
            customCount > 0 ? `Biblioteca y rutina · ${customCount} propios` : 'Biblioteca y rutina'
          }
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
