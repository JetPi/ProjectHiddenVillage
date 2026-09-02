#!/usr/bin/env bash
set -euo pipefail

DB_HOST="${PHV_E2E_DB_HOST:-localhost}"
DB_PORT="${PHV_E2E_DB_PORT:-5432}"
DB_NAME="${PHV_E2E_DB_NAME:-project_hidden_village_e2e}"
DB_USER="${PHV_E2E_DB_USER:-postgres}"

CONNECTION_STRING="Host=${DB_HOST};Port=${DB_PORT};Database=${DB_NAME};Username=${DB_USER}"

ASPNETCORE_ENVIRONMENT=Development \
DOTNET_ENVIRONMENT=Development \
PHV_INCLUDE_TEST_SEED_PROFILES=true \
ConnectionStrings__DefaultConnection="${CONNECTION_STRING}" \
dotnet ef database update \
  --project server/ProjectHiddenVillage.Server.csproj \
  --startup-project server/ProjectHiddenVillage.Server.csproj

ASPNETCORE_ENVIRONMENT=Development \
DOTNET_ENVIRONMENT=Development \
PHV_INCLUDE_TEST_SEED_PROFILES=true \
ConnectionStrings__DefaultConnection="${CONNECTION_STRING}" \
dotnet run --project server/ProjectHiddenVillage.Server.csproj --urls http://127.0.0.1:3101
