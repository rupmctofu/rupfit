# Tres levantamientos, un día cada uno

The owner does not recognise the plan the app shows him. The four days become three strength
days anchored by the squat, the bench press and the conventional deadlift, plus the mobility
and core day. Names follow the anchor lift, so the week says what the day is for.

Specs are the contract; the Log is the record. Subagents read until `## Log`.

## Specs

- **S1.** The owner's own words: "Podemos dejar eso claro que yo tenga los entrenos así pierna,
  sentadilla, pressbanca y peso muerto y luego ya lo demás los otros ejercicios ponemos un día
  de movilidad y core, pero que básicamente sea eso en el entreno".
- **S2.** The plan is four days, named after what anchors them and using the app's existing
  `LIFT / FOCUS` convention (`src/features/home/format.ts:104-131`, whose own example is
  `SENTADILLA / PIERNA` and `PESO MUERTO / TRACCIÓN`): `SENTADILLA / PIERNA`,
  `PRESS BANCA / EMPUJE`, `PESO MUERTO / TRACCIÓN`, `MOVILIDAD Y CORE`. The bare names were
  considered and rejected: `dayFocus` returns the half after the slash, so a bare name loses
  the day's focus subtitle on the routine cards.
- **S3.** The third day is anchored by the conventional deadlift, `seed-ex-peso-muerto`
  ("Peso muerto"). The Romanian deadlift stops being a day-1 slot; it stays in the library.
- **S4.** SENTADILLA: sentadilla trasera, prensa, curl femoral sentado, Nordic curl asistido,
  Copenhagen plank adaptado, gemelos de pie, sóleo sentado, caminata inclinada.
- **S5.** PRESS BANCA: press banca, press banca inclinado, press de hombro, elevaciones
  laterales, extensiones de tríceps, extensión de tríceps sobre la cabeza, caminata inclinada.
- **S6.** PESO MUERTO: peso muerto, remo con barra, dominadas asistidas, jalón al pecho, face
  pull, curl de bíceps con barra, curl en polea, caminata inclinada.
- **S7.** MOVILIDAD Y CORE keeps its seven items and its order unchanged.
- **S8.** The anchor lift is the first item of its day and carries the `strength` role, so the
  prescription (sets, reps, RIR, rest) keeps coming from the block table.
- **S9.** A store seeded with the previous four days keeps its plan days, its item ids and its
  history. No session, set or historic row loses the day or the exercise it points at.
- **S10.** A day whose name the owner edited in Ejercicios is not overwritten by the launch
  refresh; only the shapes the previous release wrote verbatim are replaced.
- **S11.** The week keeps its three fixture layouts (league, cup, none) and the match day keeps
  no training; only the day names the layout places change.
- **S12.** The layouts are not reordered. In a league week PESO MUERTO therefore lands on the
  day after the match. The owner chose this over moving the day, and the consequence is
  recorded here so no later release "fixes" it by surprise.

## Tasks

| ID | Spec | Route | Commit |
| --- | --- | --- | --- |
| T1 | S1-S8 | inline | d080819: `tests/training-program.test.ts` pins the four days, RED first |
| T2 | S2-S8 | inline | d080819: `src/core/seed/plan.ts` |
| T3 | S2, S11, S12 | inline | d080819: `src/features/week/week.ts` plus the bridge test |
| T4 | S3, S9, S10 | inline | d080819: `src/features/onboarding/plan-refresh.ts` plus two tests |
| T5 | S2-S7 | inline | d080819: `src/features/home/demo.tsx` and the suite |
| T6 | S1-S12 | inline | d080819: `docs/product-requirements.md`, `odd/tasks/five-day-plan.md` |
| T7 | S1-S12 | inline | d080819: 1220 tests, typecheck and build see L8 |

## Log

- **L1.** Owner, verbatim: "Estoy viendo la app y veo que lo que nos basamos tal vez me estoy
  equivocando, pero en principio íamos hablado de hacer un día de pool, un día de push y un día
  de piernas. Y yo miro en mi app y sale torso a partido copa, movilidad core, pierna y torso B.
  Entonces no sé si eso está estructurado bien o eso se quedó en el aire y luego tengo días que
  el partido dejó sin fecha, sentadilla, peso muerto, pressbanca. Esto está en Lily y no entiendo
  qué hace. Podemos dejar eso claro que yo tenga los entrenos así pierna, sentadilla, pressbanca
  y peso muerto y luego ya lo demás los otros ejercicios ponemos un día de movilidad y core, pero
  que básicamente sea eso en el entreno".
- **L2.** Owner answered the plan question with "3 fuerza anclados + movilidad y core", and the
  deadlift question with "Peso muerto convencional". Both are decisions, not suggestions: S2 and
  S3 follow from them.
- **L3.** Evidence gathered before any write: the seed table is `src/core/seed/plan.ts:225-280`;
  the role bridge is `src/features/week/week.ts:53-65` (`ROLE_NAMES`, `PREVIOUS_ROLE_NAMES`);
  the launch refresh is `src/features/onboarding/plan-refresh.ts:73-119` (`REPLACED_SEED_DAYS`,
  `APPENDED_SEED_ITEMS`); `seed-ex-peso-muerto` exists at `src/core/seed/exercises.ts:80`.
- **L4.** Owner's other two observations are not this feature and stay as they are: "el partido
  dejó sin fecha" is the documented consequence of a stored `WeekLayout` that no longer matches
  the week's fixture (regla S10 en `src/features/week/agenda.ts:17-19`), and "Lily" is the
  exercise library block of the routine editor (`src/features/train/RoutineEditor.tsx:336-358`),
  not the program.
- **L5.** Presented with the consequence that the deadlift day falls on MD+1 in a league week,
  the owner chose "Dejar la semana como está". That is S12. It is his call, taken with the cost
  in front of him; the feature does not move the layouts.
- **L6.** Blast radius measured before the first write: 4 real source files (`core/seed/plan.ts`,
  `features/week/week.ts`, `features/onboarding/plan-refresh.ts`, `features/home/demo.tsx`),
  ~5 comment/UI-copy files, and 14 test files with 69 occurrences of the retired names.
  `seed-item-<key>-<n>` ids are positional and renumber on reorder; nothing in storage holds an
  item id, so history is safe, but a store seeded by the previous release needs a new
  `REPLACED_SEED_DAYS` shape or it never receives the redistribution.
- **L7.** `WEEK_TEMPLATES` is role-based, and `week-plan.ts:223` protects `role: 'leg'` from the
  day after the match while knowing nothing about a deadlift on `upper-b`. With S12 that gap is
  accepted, not fixed.
- **L8.** Implemented in `d080819` on `feature/pwa-platform`: the four seed days renamed and
  redistributed, the role bridge (`ROLE_NAMES` plus the three retired names in
  `PREVIOUS_ROLE_NAMES`), six entries in `REPLACED_SEED_DAYS` covering the two previous
  generations of the three strength days, the walk append re-pointed to the new tail positions,
  the demo plan, FR-3.1 and FR-3.2, and two tests that did not exist: the migration of a
  previous-release store, and `weekDaysOf(seedPlanDays())`. Checks: 1220 tests (79 files),
  `tsc` in both projects, `build` — all clean. `src/core/seed/plan.ts`'s `fisico` entry is
  identical to the one in `d080819^`, and `week-plan.ts` is not in the commit.
- **L9.** The independent verifier was not admitted (the launch was refused for lacking the
  `Risk: item N` declaration in its own text, and the instruction was not to retry), so the
  checks are inline and not independent. Found while doing them, and recorded rather than
  fixed: `stillTheShape` compares name, item count and exercise order, so a day whose owner
  changed only sets, reps or rest — without renaming, adding, removing or reordering an
  exercise — is still "the shape the previous release wrote" and gets rewritten. What is lost
  is those numbers; logged weights and session history are not in the plan and are untouched.
  Tightening the test would stop the rename reaching any device that ever tweaked a
  prescription, which defeats the release, so the cost is accepted and named here.
