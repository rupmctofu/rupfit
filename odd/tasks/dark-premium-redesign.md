# Rupfit — dark premium performance redesign

Visual redesign of the existing app. Behaviour, data, persistence and sync stay untouched.
This document is the spec subagents read; keep it current as decisions land.

## Specs

S1. "No quiero simplemente cambiar colores, añadir sombras o redondear tarjetas. Quiero elevar
    la calidad visual de toda la aplicación." — the redesign is the whole language, not a reskin pass.

S2. "Mantener el logotipo original de Rupfit. No redibujar, reinterpretar ni sustituir el símbolo R."
    The assets are `public/logo-mark.svg`, `public/logo-mark-ink.svg`, `public/logo-lockup.svg`;
    their fills are baked (`#a892ff`, `#f6f3ff`) and must not be regenerated in CSS.

S3. "Mantener la paleta purple original." The purples live in `src/design-system/tokens.css`
    (`--color-accent:#a892ff`, `--color-accent-ink:#171329`). No lime, no orange as brand colours.

S4. "No eliminar funcionalidades. No modificar la lógica de entrenamiento. No alterar algoritmos de
    progresión. No modificar estructuras de datos. No cambiar la persistencia. No romper la
    sincronización." Behaviour is read-only for this work.

S5. "No introducir temporizadores de descanso ni referencias visuales a descansos programados."

S6. "No inventar datos ni porcentajes. Utilizar exclusivamente los datos existentes."
    PRs stay derived (`features/progress/aggregates.ts`), never stored.

S7. "La navegación inferior debe tener: Inicio, Historial, Ejercicios, Perfil." The active item
    uses the corporate purple.

S8. "Diseño mobile-first", with touch targets large enough, no accidental horizontal scroll, and
    iOS safe areas respected.

## Tasks

T1. Audit the architecture and record it. **Done** — `docs/redesign/00-audit.md`, 606bd30.
T2. Token layer. **Done** (2294ca8) — `--text-card-title`/`--leading-card-title` defined,
    `--shadow-card/-raised/-lift/-sheet`, the ground ramp `surface` → `surface-raised` →
    `surface-hover`, `--color-hairline`. S1, S3.
T3. Typography. **Done** (2294ca8) — Plus Jakarta Sans self-hosted in `public/fonts/`, the scale
    through `--text-display`, and `--text-numeral-load` / `--text-numeral-reps`. S1.
T4. Base components re-skinned in place: Card, PrimaryAction, Chip, DataRow, Metric/DataStrip,
    Numeral, Stepper, SetRow, Banner, EmptyState, Icon, nav. **Done** (2294ca8) — hairline-based
    depth across `design-system/components/*.css`, numeral treatment, tab bar closed by a hairline.
T4b. Clean-up decided by the owner: delete the gallery-only rest bar (`RestTimerBar` + its gallery
     section, since S5 forbids rest timers), delete the orange comparison skin (`data-skin="a"` in
     tokens and the gallery switch, one accent only), keep `color-mix` with the plain declarations
     as fallback. **Done** (2294ca8) — no `RestTimerBar` and no `data-skin` left under `src/`.
T5. Inicio (`features/home/HomeScreen.tsx`): today's workout as the protagonist, weekly progress,
    what's next. **Done** (5aeb5a8, note `docs/redesign/05-inicio.md`). S1, S6.
T6. Sesión (`features/session/SessionScreen.tsx`): numbers dominate, one accent fill on the pinned
    action, no rest timers. **Done** (483c56f, note `docs/redesign/06-sesion.md`). S5.
T7. Historial (`features/progress/ProgressScreen.tsx`): volume evolution, PRs, body weight, session
    list, all from existing aggregates. **Done** (8dd6bcc, note `docs/redesign/07-historial.md`). S6.
T8. Ejercicios (`features/train/TrainScreen.tsx`): routines as cards, library browsable. **Done**
    (f4c6361, note `docs/redesign/08-ejercicios.md`). S1.
T9. Perfil (`features/profile/ProfileScreen.tsx`): grouped Account / Training / System. **Done**
    (ec55498, note `docs/redesign/09-perfil.md`). S1.
T10. Resumen (`features/summary/SummaryScreen.tsx`): sense of achievement, PRs with their own
     treatment, comparison from existing data only. **Done** (533440c, note
     `docs/redesign/10-resumen.md`). S6.
T11. Gallery (`#/galeria`) re-rendered in lockstep, or it misrepresents the system. **Done**
     (9954ccf). S1.
T12. Review: `npm test`, `npm run typecheck`, `npm run build`, every screen at 390 and 768, no
     horizontal scroll, contrast checked, no behaviour diff. **Done** — see L6. S4, S8.
T13. Docs the clean-up left behind: `RestTimerBar` is still documented in `src/design-system/README.md`
     and `docs/design-system.md`, and skin A in the same two. **Done** (b087029) — every claim the
     code no longer honours is stated as removed in place, section numbering kept. `design/system.md`
     turned out to have no generator and to be stale far beyond this scope; it now says so.
T14. Debris of the deleted rest bar: `--shadow-inset-success` and `--rest-bar-content-height` in
     `tokens.css` are read by nothing, and `tests/accent-budget.test.ts` still allow-lists two
     `profile.css` accent declarations that belonged to the deleted rest switch. Remove all three
     so the system carries no token or permission for a component it does not ship. S5. **Done**
     (db745aa).
T15. One screen-title role: `--text-display` existed but each tab screen spelled the rule itself,
     so Ejercicios and Resumen opened at 40 px while Historial and Perfil stayed at 32 px. The role
     now lives once as `.ds-display-title` in `foundation.css` and the four screens read it; nested
     flows (onboarding, the routine editor) keep `ds-screen-title`, because they are a step inside
     a screen and not the screen. S1. **Done**.

## State at hand-off

Branch `feat/dark-premium-redesign`. Every task is closed: 2294ca8 (T2-T4b), 9954ccf (T11),
5aeb5a8 (T5), 483c56f (T6), 8dd6bcc (T7), 606bd30 (T1), 533440c (T10), ec55498 (T9), f4c6361 (T8),
b087029 (T13), db745aa (T14), and one commit for T15.

## Log

L1. (owner, brief) "Quiero realizar un rework visual completo de Rupfit… que parezca un producto
    comercial terminado… La prioridad es mejorar radicalmente la experiencia visual sin sacrificar
    funcionalidad, claridad ni velocidad de uso." Plus the attached six-screen reference
    (dark premium, purple, photographic cards, four-tab bottom bar).
L2. (owner) Typeface: Plus Jakarta Sans self-hosted. Theme: dark only, leave the light block alone.
L3. (owner) Delete the rest bar. Keep `color-mix` with its plain fallback. Delete the orange
    comparison skin so the system has a single accent.
L4. (T13 evidence) `design/system.md` has no generator in `package.json` or `tools/`; it is edited by
    hand and disagrees with `tokens.css` on dark surfaces, chart series, weights and the type roles.
    It now carries a note saying so. Regenerating or retiring it is an open decision, not part of T13.
L5. (T13 evidence) `src/features/progress/ExerciseDetailScreen.tsx:289` prints `Descanso` from
    `prescription.restSeconds`. That is prescribed-rest *text*, the same thing the gallery already
    keeps in `targetLine` and the same reading of S5 this feature has used since T4b: no timer, no
    countdown, no progress line. Left as it ships (S4). If the owner reads S5 as forbidding the text
    too, this is the one place to change and it is a data-display change, not a redesign one.
L6. (T12 evidence, measured not asserted) `npx vitest run` and `npm run build` (which runs both
    `tsc` projects) both exit 0. In a real store seeded through `#/empezar`, at 390×844 and
    768×1024, for `#/inicio`, `#/entrenar`, `#/progreso`, `#/perfil`, `#/resumen/demo` and
    `#/galeria`: `document.scrollWidth` never exceeds `window.innerWidth` and no element crosses
    the horizontal edge. The only nodes that do are the `ds-visually-hidden` data tables inside the
    gallery's charts, which are off-screen by design. The tab screens' `h1` computes to 39.9993 px
    and weight 700 in all four. The identity card's monogram measures 44×44 with 21 px of card
    padding inside the card, so the cropped look in a downscaled full-page capture was a scaling
    artefact, not a clip.
L7. (decision) One screen-title role: `.ds-display-title` in `foundation.css`, read by Inicio's
    siblings — Ejercicios, Historial, Perfil — and by Resumen. Onboarding and the routine editor
    keep `ds-screen-title`: they are a step inside a screen, not the screen. Inicio has no heading
    that names it (its `h1` is the greeting, at the card-title role) and that is how T5 shipped it;
    changing it is a design decision, not a defect.
L8. (T8 judgement, for the owner) «library browsable» is satisfied by the routine sheet's existing
    `Añadir un ejercicio` list, restyled: 68 rows, still reachable, still the same interaction. A
    library section on the Ejercicios screen itself was deliberately refused — a read-only dump of
    68 rows with no action is twice the screen and promises a browse/detail feature that does not
    exist. If the owner wants that section, it is new UI and new behaviour, not a restyle.
