# T9 — Perfil (`features/profile/`)

The screen the owner opens on purpose, never on the way to a set
(`odd/tasks/dark-premium-redesign.md` T9, specs S1, S4, S8). Its content is now read as
three groups — **Cuenta**, **Entrenamiento**, **Sistema** — and presentation is the whole
of the change: no state, hook, handler, setting, export/import path, sync path or storage
key was touched.

## What the screen argues

Perfil is a screen of facts, not of numbers. Inicio, Sesión and Historial each promote one
figure and let it dominate; here there is nothing to promote — the only figures are a
library count and the size of the store, and inventing a hero out of them would be the
"S6 — no inventar datos" failure in visual form. So the screen argues **order and
chapter** instead: three parts, a heading that says which part you are in, and inside each
part a card per subject. The loudest thing on the screen stays the word `Perfil`; the
quietest is the sentence that explains what a tap costs.

The depth is the shipped one, not a new one: the canvas, the card one step above it, the
raised ground on the single block the screen makes its lead (the identity card — the same
step Inicio gives its today card), and a hairline where a surface ends. No shadow, no
gradient, no card inside a card.

## The composition, in reading order

| # | Block | Where it lives |
|---|---|---|
| 1 | `Perfil` — the screen title | `ProfileScreen.tsx` |
| 2 | Platform notices: storage evicted, not installed, update available, read error, loading | `ProfileScreen.tsx` → `Banner` / `ErrorBanner` |
| 3 | **Cuenta**: the identity card (mark, name or the one field that sets it, `goalsLine`) | `ProfileScreen.tsx` → `ProfileSection` |
| 4 | **Cuenta**: the account — signed out, the form and what refusing costs; signed in, who, the sync state, the last sync, `Sincronizar ahora` / `Cerrar sesión` | `AccountGroup.tsx` → `SignedIn`, `AccountForm.tsx` |
| 5 | **Entrenamiento**: equipment, weight goal, units, the `Ejercicios` row | `ProfileScreen.tsx` → `TrainingSection` |
| 6 | **Entrenamiento**: the health note (unchanged text) | `ProfileScreen.tsx` → `Note` |
| 7 | **Sistema**: `Copia de seguridad` — export and the import disclosure | `BackupGroup.tsx` |
| 8 | **Sistema**: `Almacenamiento` — the inventory, the space and persistence sentences, the typed deletion | `StorageGroup.tsx` |
| 9 | **Sistema**: imported activities, one read-only line | `ProfileScreen.tsx` → `Note` |
| 10 | **Sistema**: `Instalación y versión` — mode, app version, backup format | `InstallGroup.tsx` |

Groups 3–10 are the order the screen already had. Nothing was reordered, and no group can
swallow a block: the training group is not drawn at all while there is no profile
(`data.profile === null`), exactly as its two blocks were hidden before.

## What the grouping is, and what it is not

- It is a `section` named by its own `h2` (`aria-labelledby` with an explicit id), so the
  three chapters are walkable and separable. The heading level is the screen's own: `h1`
  `Perfil`, then `h2` per group, and the sections inside `Sistema` keep the design
  system's `SectionLabel`, which is also an `h2` — no level is skipped.
- It is **one** label per name. `AccountGroup` gained a `showLabel` prop (default `true`)
  because its card printed `Cuenta` and the group now says it; Perfil passes `false`. The
  word is said once, the card keeps every row it had.
- It is not a filter, a tab, an accordion or a route: there is nothing to open and nothing
  to choose. Every control that existed is on screen in the same state it was.
- The headings cost no new component. `--text-card-title` / `--leading-card-title` /
  `--tracking-card-title` — defined in T2 for "a card or block named without competing with
  the screen title" — carry them at 20 px, so the hierarchy is 34 px screen title →
  26 px owner's name → 20 px chapter → 13 px section label → 17 px row.

## Where each fact comes from (S6 — nothing invented)

| On screen | Source at render time |
|---|---|
| the name, `El nombre viene de tu cuenta.` | `profile.displayName`; the field appears only when it is `null` |
| `Mantener peso · 4 equipos` | `goalsLine(profile)` — `weightGoal` and `availableEquipment.length` |
| `Ejercicios 9` / `Biblioteca y rutina · 2 propios` | `data.snapshot.exercises` / `data.snapshot.customExercises` |
| the equipment, goal and unit chips and their pressed state | `profile.availableEquipment`, `weightGoal`, `massUnit` |
| `Cuenta en uso`, `Sincronización`, `Última sincronización…` | `AuthState.email` and `syncStateWords` / `lastSyncLine` / `migrationLine` (`account-sync.ts`) |
| the export sentence and the route that worked | `exportMessage(result)`, `ExportRoute` |
| the imported document's counts | `documentSummary(document)` over the validated `BackupDocument` |
| the failure path `sessions[3]…` | `importProblem` / `importFailureText` (`import.ts`) |
| the inventory rows | `storageInventory(snapshot)` |
| the space and persistence sentences | `storageUsageLine`, `persistenceLine` — the browser's answer, or the honest "no lo dice" |
| `Instalada` / `En una pestaña`, `0.1.0`, `1` | `installState`, `APP_VERSION`, `BACKUP_SCHEMA_VERSION` |
| `2 actividades importadas` | the store's own rows with `provenance !== 'manual'`, and the line is absent at zero |

No percentage, no score, no level and no "completado" was added: the screen still has no
fact of that kind to show.

## Which tokens carry the screen

| Role | Token |
|---|---|
| the ground of a card | `--color-surface` + `--layout-hairline` (from `components/cards.css`) |
| the lead of the first group | `--color-surface-raised` on `.profile__identity-card` |
| a divider between two rows of one card | `--layout-hairline` `--color-hairline` |
| a control's edge (the two fields, the file picker) | `--color-border` — see below |
| a chapter's name | `--text-card-title` — 20 px, weight 600, tracking `--tracking-card-title` |
| a row's label | `--text-label` / `--leading-label` / `--tracking-label`, weight 500 |
| a sentence under a block | `--text-meta` / `--leading-loose` |
| rhythm | `--space-4` inside the screen, `--space-3` between two chapters on top of it |
| the wide window | `max-width: 560px` at `min-width: 720px`, the column Inicio, Historial and Sesión share |

`profile.css` now reads **no** `--color-border` for a divider: every line that divides
neighbours is `--color-hairline`, the quiet edge a surface ends on. One `--color-border`
remains, on the fields and on the file picker, and it is deliberate: a field is a control,
and every control edge in the shipped system draws with `border`
(`components/empty-state.css`, `components/weight-entry.css`, the session's sheet actions).

## The accent

`profile.css` spends **no** accent at all, and that is the argument: Perfil has no primary
action. The loudest control on it is `Exportar copia`, and a filled block there made the
rarest action of the app its loudest element — the shipped comment on that card still says
so. The only accent the owner sees here is the selected state of a chip (equipment, goal,
unit), which is `Chip`'s own `--color-accent-muted` / `--color-accent-text` in
`components/chips.css`, drawn by the design system and not by this screen.

`tests/accent-budget.test.ts` is green and unchanged: the allow-list still carries two
`profile.css` entries (`background: var(--color-accent)` / `…-accent-ink`) that describe a
rest-timer switch this file no longer has. They are dead entries, not live permissions;
`tests/` is outside T9's edit surface, so they were left for T12 (or T13) to retire.

## What was deliberately left alone

- **Behaviour (S4).** No state, effect, handler, hook, storage key, export/import branch or
  sync call was edited. `AccountGroup` gained a presentational prop with a default that
  keeps every other caller exactly as it was (`AccountScreen` does not use it at all).
- **The words.** Every sentence, label and accessible name is the one that shipped,
  including `Sin equipo marcado…`, the health note and the durability note. The one text
  that disappeared from the screen is the duplicate `Cuenta` label.
- **The rest switch** stays deleted (S5) and `UserProfile.autoStartRestTimer` stays in the
  model, untouched: removing a stored field needs a migration, and nothing offers a control
  for it.
- **The shared files.** `tokens.css`, `fonts.css`, `components/**`, `app/shell.css`,
  `app/gallery/**` and every other feature folder are untouched. No token was missing: the
  chapter heading, the raised ground, the hairline, the loose leading and the 560 px column
  all exist already. No new dependency.
- **The gallery (T11)** still shows the design-system components this screen composes with;
  the Perfil-only composition (the groups, the identity card) is not a component and is not
  in it.
- **The brand asset.** `logo-mark.svg` is used exactly as published, at 44 px, never
  recoloured and never redrawn (S2, S3). Its plate lost its ground because the drawing
  fills the whole box: a background behind it was invisible by construction, so it was
  decoration that cost a rule rather than a style.

## Mobile-first and the safe areas (S8)

- One column at every width. At `≥ 720 px` the column is 560 px wide and centred; the cards
  inside it are unchanged.
- No second gutter: the shell owns the horizontal padding and the compact variant at
  320 px, and this file never adds an inset of its own.
- The bottom inset belongs to the tab bar (`--safe-bottom-padding` in `app/shell.css`); the
  screen only leaves `--space-8` of air above it, so nothing sits under the home bar.
- Chips wrap instead of clipping, the setting label and both notes carry
  `overflow-wrap: anywhere`, and the fields are `width: 100%` with a 48 px floor, so a long
  word or a larger text size makes a row taller instead of wider.
- Targets: every chip is `Chip`'s 48 px control, the fields are ≥ 48 px, the file picker is
  a 48 px label over a real input, and the disclosure trigger is 48 px tall.
- The chevron's rotation collapses under `prefers-reduced-motion: reduce`; it is the only
  thing in this file that moves.

## Notes for the next units

- T10 (Resumen) can reuse the chapter heading as it stands: `.profile__group-title` is a
  role, not a Perfil-specific decoration. If a second screen needs it, the honest move is a
  `SectionLabel` variant in `design-system/components/cards.css` — out of T9's surface.
- T12 should check the three groups at 320 px as well as 390/768: the group heading is the
  only new text on the screen, and `Sistema`'s three section labels are the densest stack of
  it.
- The account card's `showLabel` prop is the one API change (default preserves the old
  rendering). If another screen ever names the group itself, it passes the same `false`.

## How this was verified

| Command | Result |
|---|---|
| `grep -rl "ProfileScreen" src --include=*.test.tsx` | no match — this screen has no component test, so its focused suite is the feature's own unit tests |
| `npx vitest run src/features/profile tests/accent-budget.test.ts` | 11 files, 108 tests, all passed (includes the stylesheet accent probe, which reads `profile.css` from disk) |
| `npx tsc --noEmit -p tsconfig.app.json` | exit 0 |

Not measured in this unit: the 390/768 viewport pass (`document.scrollWidth ===
clientWidth`, the rect probe over every element). Nothing in this change introduces a
width — no fixed width, no `nowrap`, every new text node wraps — but the measurement
belongs to the T12 review, and this note says so rather than claiming a number nobody read.
