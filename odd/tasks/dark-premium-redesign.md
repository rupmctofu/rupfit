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

T1. Audit the architecture and record it. **Done** — see `docs/redesign/00-audit.md`.
T2. Token layer: define the missing tokens the app already reads (`--text-card-title`,
    `--leading-card-title` in `app/shell.css`), add shadow tokens, and stage the elevated dark
    grounds (bg / surface / surface-raised) so cards separate without borders everywhere. S1, S3.
T3. Typography: load the chosen face self-hosted, define the scale (display, card title, body,
    micro) and the large numeral treatment for load and reps. S1.
T4. Base components re-skinned in place: Card, PrimaryAction, Chip, DataRow, Metric/DataStrip,
    Numeral, Stepper, SetRow, Banner, EmptyState, Icon, nav. S1, S7.
T4. Base components re-skinned in place. **Done** — hairline token, hairline-based depth, numeral treatment,
     tab bar closed by a hairline, gallery copy telling the truth. 1189 tests green.
T4b. Clean-up decided by the owner: delete the gallery-only rest bar (`RestTimerBar` + its gallery
     section, since S5 forbids rest timers), delete the orange comparison skin (`data-skin="a"` in
     tokens and the gallery switch, one accent only), and keep `color-mix` for state tints with the
     plain declarations as fallback. Blocked on T5 only because both units touch
     `src/app/gallery/**`.
T5. Inicio (`features/home/HomeScreen.tsx`): today's workout as the protagonist, weekly progress,
    what's next. Data already available; no invented figures. S1, S6.
T6. Sesión (`features/session/SessionScreen.tsx`): numbers dominate, one accent fill on the pinned
    action, no rest timers. The riskiest screen: behaviour files stay untouched. S5.
T7. Historial (`features/progress/ProgressScreen.tsx`): volume evolution, PRs, body weight, session
    list, all from existing aggregates. S6.
T8. Ejercicios (`features/train/TrainScreen.tsx`): routines as cards, library browsable. S1.
T9. Perfil (`features/profile/ProfileScreen.tsx`): grouped Account / Training / System. S1.
T10. Resumen (`features/summary/SummaryScreen.tsx`): sense of achievement, PRs with their own
     treatment, comparison from existing data only. S6.
T11. Gallery (`#/galeria`) re-rendered in lockstep, or it misrepresents the system. S1.
T12. Review: `npm test`, `npm run typecheck`, `npm run build`, every screen at 390 and 768, no
     horizontal scroll, contrast checked, no behaviour diff. S4, S8.

## Log

L1. (owner, brief) "Quiero realizar un rework visual completo de Rupfit… que parezca un producto
    comercial terminado… La prioridad es mejorar radicalmente la experiencia visual sin sacrificar
    funcionalidad, claridad ni velocidad de uso." Plus the attached six-screen reference
    (dark premium, purple, photographic cards, four-tab bottom bar).
L2. (owner) Typeface: Plus Jakarta Sans self-hosted. Theme: dark only, leave the light block alone.
L3. (owner) Delete the rest bar. Keep `color-mix` with its plain fallback. Delete the orange
    comparison skin so the system has a single accent.
