# Project Hidden Village

Boilerplate workspace for a Bandai-style card game website.

## Step 1 scope

- Frontend scaffolded with React + TypeScript + Vite in `client`
- Backend folder reserved as placeholder in `server`
- Objective: local run reliability before feature work

## Prerequisites

- Node.js installed
- npm installed
- .NET SDK installed

## Run frontend locally

```bash
cd client
npm install
npm run dev
```

Vite will print a local URL (usually http://localhost:5173).

## Run frontend and backend together

From the project root:

```bash
npm install
npm run dev
```

This starts:

- Frontend: URL shown by Vite in terminal (usually http://127.0.0.1:5173/)
- Backend: http://127.0.0.1:3001/
- Health: http://127.0.0.1:3001/health

## Verify production build locally

```bash
cd client
npm run build
npm run preview
```

## Build frontend and backend together

From the project root:

```bash
npm run build
```

This runs backend build first, then frontend build.

Verified preview URL:

- http://127.0.0.1:4173/

## Step 1 completion status

- Scaffold created in `client` using React + TypeScript + Vite
- Dependency install completed
- Dev server validated at http://127.0.0.1:5173/
- Production build validated with `npm run build`
- Production preview validated at http://127.0.0.1:4173/
- Backend placeholder created in `server`

## Minimal backend runtime

```bash
cd server
dotnet watch run --project ProjectHiddenVillage.Server.csproj --urls http://127.0.0.1:3001
```

Server URL:

- http://127.0.0.1:3001/

Health endpoint:

- http://127.0.0.1:3001/health

API docs:

- Swagger UI: http://127.0.0.1:3001/docs/
- OpenAPI JSON: http://127.0.0.1:3001/docs.json

Build backend:

```bash
cd server
dotnet build ProjectHiddenVillage.Server.csproj
```

## Not included yet

- Card game rules engine
- Deck builder features
- Authentication
- Database or persistence
- Realtime multiplayer
