# Plan: Move client text into i18n translation files (en.json)

## Goal

Wire up `react-i18next` (already installed) and move every user-facing string in the
client into `en.json`, so components read text via `t(...)` instead of raw literals.
English-only for now, but structured so more locales can be added later without
restructuring.

## Scope (approved)

Everything user-facing:

- Shared UI (`client/src/components/ui/**`), forms (`components/forms/**`), feedback
  (`components/feedback/**`), 404 (`views/NotFoundView.tsx`)
- App shell (`client/src/app/**`)
- Auth (`client/src/views/login/**`)
- Game (`client/src/views/game/**`)
- Admin card editor (`client/src/views/admin/**`)

Includes JSX text, `title`, `aria-label`, `placeholder`, toast messages, and copy that
lives in constants modules and pure helpers.

## Non-goals

- No language switcher UI (English only; infra allows adding later).
- Server-provided labels (e.g. engine effect names) are not translated here.
- No change to option **values** that are sent to the API / used as enum wire values.

## Infrastructure decisions

- **Files**: `client/src/i18n/en.json` (resources) + `client/src/i18n/index.ts`
  (init). Import `'@/i18n'` in `client/src/main.tsx` **before** `createRoot(...).render`
  so the first render already has English.
- **Resources bundled/synchronous** (no HTTP backend, no lazy namespace loading) so the
  first paint is English. This is required because e2e asserts on visible text.
- **Config**: `lng: 'en'`, `fallbackLng: 'en'`, `interpolation: { escapeValue: false }`,
  `initReactI18next` plugin.
- **Optional type safety**: `client/src/i18n/i18next.d.ts` with `CustomTypeOptions`
  pointing at `en.json` resources, so `t()` keys are checked at compile time.

## Key naming convention

Dotted, camelCase leaf keys grouped by area; mirrors the folder tree.

```
common.*            shared actions (close, cancel, confirm, loading, remove)
components.ui.*     AppButton / Panel / cards / game resource widgets
components.forms.*  labels, placeholders, helper/error text
feedback.*          error boundaries, toasts, loading chip
app.*               route transition / hydrate fallback
notFound.*          404 view
auth.*              login + sign-in views, validation, toasts
game.phase.*        PhaseValues copy
game.prompt.*       prompt titles/subtitles/options
game.overlay.*      game over / notice / banners
game.zone.*         board zones, trash pile, no actions
admin.catalog.*     search, filters, sort, pagination
admin.effects.*     effect editor labels/options
admin.*             remaining admin copy + toasts
```

## Usage rules (important with this codebase)

- `useTranslation()` is a **hook**: call it only in components / hooks. Per
  `.clinerules/01-architecture.md`, never call hooks from lowercase helpers.
- **constants modules** (e.g. `views/admin/constants/*`, `PhaseValues`,
  prompt copy buckets): store **translation keys** (or key maps), and resolve them in the
  component / hook that renders them via `t(...)`.
- **pure helpers** that build text (e.g. `buildGameOutcomePresentation`,
  `toReadableOptionLabel`): accept `t` as a parameter, or return a key that the caller
  translates. Do not import hooks.
- **non-component modules** (route handlers, thrown `Error` messages, module-level
  config): import the `i18n` singleton and call `i18n.t(...)`.
- **enum fallbacks**: keep existing dynamic fallbacks by using
  `t(key, { defaultValue: existingFallback })`.
- **embedded markup**: use the `Trans` component when a sentence wraps inline JSX.

## Enum / wire-value safety

Several label constants pair a server-bound `value` with a display `label`
(e.g. `{ value: 'Leader', label: 'Leader' }`, `'Destroy Card'` effect kinds). Only the
**displayed label** moves to `en.json`; the `value` must remain byte-identical and is
never passed through `t()`.

## Dynamic strings

Convert string concatenation / templates to interpolation keys:

- `showAppInfoToast('Logged in as ' + authUsername)` ->
  `t('auth.toasts.loggedInAs', { username })`
- `` `Please select a ${deckModeLabel} before continuing.` `` ->
  interpolation with a translated `deckModeLabel`
- Phase indicator `Selecting tribute materials (needs: ...)` -> `{{needs}}`
- Count strings (`1 card` / `N cards`) -> i18next plurals (`_one` / `_other`)

## Verification

- `en.json` values must byte-match the literals they replace so the default English
  render is unchanged.
- `cd client && npm run typecheck && npm run lint`.
- Run the e2e suite (at minimum `gameview.*` and `admin.card-editor.spec.ts`); the
  specs assert on exact English copy, so any drift indicates a mismatch between
  `en.json` and the original string.
