/**
 * `#/empezar` — the first run, in one screen (FR-1.1 – FR-1.5, FR-2.1, FR-3.1, FR-4.1).
 *
 * The shell shows this screen instead of a tab whenever `setupOffer` says the store cannot
 * train yet, because the alternative was the state this task exists to remove: eight
 * finished screens, every one of them refusing for a different reason, and no control
 * anywhere that could write a profile, a library or a plan.
 *
 * | state the owner sees | when |
 * | --- | --- |
 * | the form, with the four fields of FR-1.1 | no profile yet |
 * | the form, with the stored profile prefilled and a banner saying what is missing | a profile but no plan |
 * | the summary and one additive action | reached at `#/empezar` with everything already there |
 * | `No se pudieron leer tus datos` and `Reintentar` | the read failed |
 *
 * Three rules the screen keeps:
 *
 * 1. **No clock, no port, no decision of its own.** The instant comes from
 *    `useAppServices()`, the writes go through `writeStartingPoint`, and whether the setup
 *    is offered at all is `setupOffer`'s answer — nothing here is worth testing that is not
 *    already tested.
 * 2. **Nothing is claimed before it is written.** The action says `Preparando…` while the
 *    sequence runs and the screen lands on Inicio only after the last write resolved (S3).
 * 3. **The plan is named, not described.** The owner sees the three day names, the size of
 *    the library and the block they will start in, so nothing about the starting point is a
 *    surprise on the first session (FR-4.7).
 */

import { useCallback, useRef, useState } from 'react';
import {
  Banner,
  Card,
  ErrorBanner,
  PrimaryAction,
  SectionLabel,
  Stepper,
  TextButton,
} from '../../design-system';
import { EQUIPMENT_TYPES, type Equipment } from '../../core/domain';
import { SEED_EXERCISES, START_PHASE_STATE, seedPlanDays } from '../../core/seed';
import type { UserProfile, WeightGoal } from '../../storage';
import { useAppServices } from '../../app/providers';
import { createProfileId } from './browser-edges';
import { ChipChoices, NameField } from './fields';
import { writeStartingPoint } from './starting-point';
import type { SetupGate } from './useSetupGate';
import './onboarding.css';

/** `SENTADILLA / PIERNA` → `Sentadilla / Pierna`, the way the artboards write a day. */
function dayTitle(name: string): string {
  return name
    .split('/')
    .map((part) => {
      const trimmed = part.trim().toLowerCase();
      return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
    })
    .join(' / ');
}

/** The equipment the artboard assumes ("Plan de 3 días · gimnasio"), as Perfil defaults it. */
const GYM_EQUIPMENT: readonly Equipment[] = ['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight'];

const EQUIPMENT_WORD: Record<Equipment, string> = {
  barbell: 'Barra',
  dumbbell: 'Mancuerna',
  machine: 'Máquina',
  cable: 'Polea',
  bodyweight: 'Peso corporal',
  band: 'Banda',
};

const WEIGHT_GOALS: readonly WeightGoal[] = ['maintain', 'lose', 'gain'];

const WEIGHT_GOAL_WORD: Record<WeightGoal, string> = {
  maintain: 'Mantener peso',
  lose: 'Perder peso',
  gain: 'Ganar peso',
};

/** The rotation as a sentence: `Sentadilla / Pierna · Peso muerto / Tracción · …`. */
function rotationLine(): string {
  return seedPlanDays()
    .map((day) => dayTitle(day.name))
    .join(' · ');
}

export interface SetupScreenProps {
  readonly gate: SetupGate;
  /** Called once the last write resolved: the shell reloads the gate and lands on Inicio. */
  readonly onDone: () => void;
  /**
   * El nombre de la cuenta, cuando hay una (L3). El primer arranque con sesión no pregunta
   * el nombre: lo trae puesto. Un perfil que ya lo tiene manda, siempre.
   */
  readonly accountName?: string | null | undefined;
}

export function SetupScreen({ gate, onDone, accountName }: SetupScreenProps): React.ReactElement {
  if (gate.phase === 'loading') {
    // Not a spinner (S3 forbids one for local data) and not the form: a flash of default
    // values over a store that is about to say otherwise would be a lie either way.
    return <div className="setup" aria-busy="true" />;
  }

  if (gate.phase === 'failed') {
    return (
      <div className="setup">
        <h1 className="ds-screen-title">Empecemos</h1>
        <ErrorBanner
          message="No se pudieron leer tus datos. No se ha creado nada."
          onRetry={gate.reload}
        />
      </div>
    );
  }

  if (gate.offer.kind === 'setup') {
    // `noPlan` means a profile exists already (Perfil can write one on its own): the form
    // starts from the stored values and the intro says what is still missing.
    return <SetupForm gate={gate} onDone={onDone} accountName={accountName} />;
  }

  // The only other state that reaches `#/empezar` is a store that can already train: the
  // decision guarantees a profile and a plan here.
  return <AlreadyStarted gate={gate} onDone={onDone} />;
}

/* ------------------------------------------------------------------- the form */

function SetupForm({ gate, onDone, accountName }: SetupScreenProps): React.ReactElement {
  const { storage, clock } = useAppServices();
  const stored = gate.profile;

  // El nombre del perfil manda; si no hay perfil todavía, el de la cuenta, ya derivado
  // (`accountNameOf`): la primera pantalla no vuelve a preguntar lo que la cuenta ya sabe.
  const [name, setName] = useState(stored?.displayName ?? accountName ?? '');
  const [goal, setGoal] = useState<WeightGoal | null>(stored?.weightGoal ?? null);
  const [days, setDays] = useState(stored?.weeklyTrainingDays ?? 3);
  const [equipment, setEquipment] = useState<readonly Equipment[]>(
    stored?.availableEquipment ?? GYM_EQUIPMENT,
  );
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  // Stable across retries: a failed write must not mint a second id for the same owner.
  const idRef = useRef<string | null>(stored?.id ?? null);

  const toggle = (value: Equipment): void =>
    setEquipment((current) =>
      current.includes(value) ? current.filter((entry) => entry !== value) : [...current, value],
    );

  const submit = useCallback((): void => {
    idRef.current ??= createProfileId(clock.now());
    const profile: UserProfile = {
      id: idRef.current,
      displayName: name.trim() === '' ? null : name.trim(),
      // Units and the rest timer are Perfil's, not the first run's (FR-1.1 lists four
      // fields, not six); keeping the stored values means a rerun loses nothing.
      massUnit: stored?.massUnit ?? 'kilograms',
      weightGoal: goal,
      weeklyTrainingDays: days,
      availableEquipment: equipment,
      autoStartRestTimer: stored?.autoStartRestTimer ?? true,
    };

    setBusy(true);
    setFailure(null);
    void (async () => {
      const outcome = await writeStartingPoint(storage, profile);
      if (outcome.kind === 'failed') {
        setFailure(outcome.message);
        setBusy(false);
        return;
      }
      setBusy(false);
      onDone();
    })();
  }, [clock, days, equipment, goal, name, onDone, storage, stored]);

  const noEquipment = equipment.length === 0;

  return (
    <div className="setup">
      <h1 className="ds-screen-title">
        {stored === undefined ? 'Empecemos' : 'Terminemos de preparar la app'}
      </h1>
      <p className="ds-body ds-body--muted">
        {stored === undefined
          ? `Cuatro respuestas y tendrás una biblioteca de ejercicios, tus ${String(seedPlanDays().length)} días de rutina y un punto de partida para la primera sesión.`
          : 'Tu perfil ya está guardado. Falta la biblioteca de ejercicios y la rutina, y con esto se escriben.'}
      </p>

      <section className="setup__section">
        <SectionLabel>Tú</SectionLabel>
        <Card>
          <NameField
            label="Nombre"
            hint="Opcional. Solo se usa para saludarte en Inicio."
            placeholder="Sin nombre"
            value={name}
            onChange={setName}
          />

          <span className="ds-meta">Objetivo de peso</span>
          <ChipChoices
            label="Objetivo de peso"
            choices={WEIGHT_GOALS.map((value) => ({ value, word: WEIGHT_GOAL_WORD[value] }))}
            selected={goal === null ? [] : [goal]}
            onToggle={(value) => setGoal((current) => (current === value ? null : value))}
          />
          <p className="ds-caption">
            {goal === null
              ? 'Sin objetivo. Toca uno para fijarlo; se puede quitar después.'
              : 'Toca el objetivo otra vez para quitarlo.'}
          </p>

          {/* No day count here either: the programme has the days it has, and choosing
              them was never the owner's ask (odd/tasks/training-program.md L11). The stored
              value still follows the seeded rotation so nothing downstream reads a lie. */}
        </Card>
      </section>

      <section className="setup__section">
        <SectionLabel>Equipo</SectionLabel>
        <Card>
          <span className="ds-meta">Equipo disponible</span>
          <ChipChoices
            label="Equipo disponible"
            choices={EQUIPMENT_TYPES.map((value) => ({ value, word: EQUIPMENT_WORD[value] }))}
            selected={equipment}
            onToggle={toggle}
          />
          <p className="ds-caption">
            De partida damos por hecho un gimnasio, como el diseño. Quita lo que no tengas.
          </p>
        </Card>
        {noEquipment ? (
          <Banner
            tone="warning"
            title="Marca al menos un equipo."
            text="La rutina de partida usa barra, mancuernas, máquina o polea."
          />
        ) : null}
      </section>

      <section className="setup__section">
        <SectionLabel>Lo que se va a crear</SectionLabel>
        <Card>
          <div className="setup__row">
            <span className="ds-body">Biblioteca</span>
            <span className="ds-meta">{`${String(SEED_EXERCISES.length)} ejercicios`}</span>
          </div>
          <hr className="ds-hairline" />
          <div className="setup__row">
            <span className="ds-body">Rutina de 3 días</span>
            <span className="ds-meta">empieza el primero</span>
          </div>
          <p className="ds-caption">{rotationLine()}</p>
          <hr className="ds-hairline" />
          <div className="setup__row">
            <span className="ds-body">Bloque de readaptación</span>
            <span className="ds-meta">{`semana ${String(START_PHASE_STATE.block)} de 4`}</span>
          </div>
          <p className="ds-caption">
            Empiezas con poco volumen y cargas conservadoras, y se avanza al siguiente bloque
            cuando se cumplen los criterios de la semana.
          </p>
        </Card>
      </section>

      {failure === null ? null : <ErrorBanner message={failure} onRetry={submit} />}

      <PrimaryAction disabled={busy || noEquipment} onClick={submit}>
        {busy ? 'Preparando…' : 'Crear mi punto de partida'}
      </PrimaryAction>
    </div>
  );
}

/* ------------------------------------------------------- an existing store */

/**
 * `#/empezar` on a store that already trains. The action is additive on purpose: it only
 * writes the seeded rows that are missing, so it cannot duplicate a row (the ids are the
 * seed's) and cannot overwrite a day the owner edited — which is the condition for
 * offering a rerun at all.
 */
function AlreadyStarted({ gate, onDone }: SetupScreenProps): React.ReactElement {
  const { storage } = useAppServices();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [written, setWritten] = useState<readonly string[] | null>(null);

  const stored = gate.profile;
  const planDays = gate.plan.length;

  const complete = useCallback((): void => {
    if (stored === undefined) return;
    setBusy(true);
    setFailure(null);
    void (async () => {
      const outcome = await writeStartingPoint(storage, stored);
      setBusy(false);
      if (outcome.kind === 'failed') {
        setFailure(outcome.message);
        return;
      }
      const additions: string[] = [];
      if (outcome.written.exercises > 0) {
        additions.push(`${String(outcome.written.exercises)} ejercicios`);
      }
      if (outcome.written.planDays > 0) {
        additions.push(`${String(outcome.written.planDays)} días de rutina`);
      }
      setWritten(additions);
      gate.reload();
    })();
  }, [gate, stored, storage]);

  return (
    <div className="setup">
      <h1 className="ds-screen-title">Tu punto de partida</h1>
      <p className="ds-body ds-body--muted">
        Ya está guardado. Desde aquí solo se añade lo que falte de la biblioteca y de la rutina
        de partida; lo que ya existe no se toca.
      </p>

      <Card>
        <div className="setup__row">
          <span className="ds-body">Perfil</span>
          <span className="ds-meta">{stored?.displayName ?? 'Sin nombre'}</span>
        </div>
        <hr className="ds-hairline" />
        <div className="setup__row">
          <span className="ds-body">Rutina guardada</span>
          <span className="ds-meta">{`${String(planDays)} días`}</span>
        </div>
      </Card>

      {written === null ? null : written.length === 0 ? (
        <Banner tone="info" title="Ya estaba todo." text="No se ha escrito nada nuevo." />
      ) : (
        <Banner tone="info" title="Listo." text={`Se añadieron ${written.join(' y ')}.`} />
      )}

      {failure === null ? null : <ErrorBanner message={failure} onRetry={complete} />}

      <PrimaryAction disabled={busy || stored === undefined} onClick={complete}>
        {busy ? 'Completando…' : 'Completar lo que falte'}
      </PrimaryAction>
      <TextButton align="start" onClick={onDone}>
        Volver a Inicio
      </TextButton>
    </div>
  );
}
