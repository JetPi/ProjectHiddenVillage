# Project Hidden Village Client

React + TypeScript + Vite frontend with Tailwind CSS and route-based view architecture.

## Current Views

- `/` -> Login view
- `/game` -> Game view

## Folder Structure

```text
src/
  app/
    AppRouter.tsx
    routes.tsx
  views/
    login/
      LoginView.tsx
    game/
      GameView.tsx
  components/
    layout/
      PageShell.tsx
    ui/
      AppButton.tsx
      Panel.tsx
  services/
    api/
      httpClient.ts
  state/
    sessionStore.ts
  types/
    game.ts
  styles/
    theme.css
  index.css
  main.tsx
```

## Run

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Notes

- Tailwind is configured through the Vite plugin.
- Global styles stay in `src/index.css`; view styling should prefer Tailwind utility classes.
- Shared UI primitives should be added under `src/components/ui`.
