# Server

Minimal backend runtime for Project Hidden Village.

## Stack

- .NET SDK
- ASP.NET Core Minimal API
- Swagger (Swashbuckle)

## Run locally

```bash
dotnet watch run --project ProjectHiddenVillage.Server.csproj --urls http://127.0.0.1:3001
```

The server starts on http://127.0.0.1:3001.

## Health endpoint

- GET /health

## API documentation

- Swagger UI: http://127.0.0.1:3001/docs/
- OpenAPI JSON: http://127.0.0.1:3001/docs.json

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
dotnet build ProjectHiddenVillage.Server.csproj
```
