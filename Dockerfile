# API image for Project Hidden Village.
# The Vite client is deployed separately (see client/Dockerfile), so this image only
# publishes server/ProjectHiddenVillage.Server.csproj. The build context must be the
# repository root because the server project links test-data/seed-profiles.json, which
# lives outside server/.

FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

COPY server/ProjectHiddenVillage.Server.csproj server/
RUN dotnet restore server/ProjectHiddenVillage.Server.csproj

COPY server/ server/
COPY test-data/seed-profiles.json test-data/seed-profiles.json

RUN dotnet publish server/ProjectHiddenVillage.Server.csproj \
    -c Release \
    -o /app/publish \
    /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS final
WORKDIR /app

COPY --from=build /app/publish .

# Card art lives on a Fly volume mounted at /data; these keep the app writing there
# instead of into the ephemeral container filesystem.
ENV CardArt__CacheDirectory=/data/card-art-cache \
    CardArt__UploadDirectory=/data/card-art-uploads \
    ASPNETCORE_URLS=http://0.0.0.0:8080 \
    ASPNETCORE_ENVIRONMENT=Production \
    DOTNET_ENVIRONMENT=Production

EXPOSE 8080

ENTRYPOINT ["dotnet", "ProjectHiddenVillage.Server.dll"]
