# Server

Minimal backend runtime for Project Hidden Village.

## Stack

- Node.js
- Express
- TypeScript

## Run locally

```bash
npm install
npm run dev
```

The server starts on http://127.0.0.1:3001.

## Health endpoint

- GET /health

## API documentation

- Swagger UI: http://127.0.0.1:3001/docs
- OpenAPI JSON: http://127.0.0.1:3001/docs.json

The OpenAPI spec now includes domain tags and reusable schemas for planned features:

- Tags: Health, Cards, Decks, Matches
- Schemas: HealthResponse, Card, Deck, Match

Example response:

```json
{
	"status": "ok",
	"service": "project-hidden-village-server",
	"timestamp": "2026-07-18T15:10:46.613Z"
}
```

## Build

```bash
npm run build
```
