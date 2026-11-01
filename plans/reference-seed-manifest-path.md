# Reference catalogue never seeded in the container

## Symptom

Live API healthy, `Database__SeedReferenceData=true` in the container, `GET /api/card/catalog` returns
`totalCount: 0`. Admin card view shows an empty catalogue (the endpoint is anonymous, so this was never a
permissions problem).

## Cause

`CatalogManifest.RelativePath` (`../test-data/seed-profiles.json`) was resolved against the content root only.
Development runs from `server/`, so `../test-data` is the repo's directory. In the container the content root is
`/app`, so it resolved to `/test-data/seed-profiles.json`, while the publish step writes
`/app/test-data/seed-profiles.json` (the `Link` in the server csproj). Verified on the box:
`ls /test-data` -> missing, `/app/test-data/seed-profiles.json` -> present.

## Change

- `CatalogManifest.ResolveManifestPath(contentRootPath)` tries the repository layout first, then
  `PublishedRelativePath` (`test-data/seed-profiles.json`), and throws naming both candidates when neither exists.
- `CatalogManifestResolutionTests`: repo layout, published layout, missing file, and `LoadCatalogEntries` reading
  the published layout.

## Verified

`dotnet test --filter "CatalogManifestResolutionTests|SeedManifestAuthoringTests|DevelopmentDeckSeederTests"`
-> 15 passed.

## Deploying

The running image predates the reference seeder (a container with the flag on and this path bug would have
crash-looped instead of serving an empty catalogue), so the fix only takes effect with a fresh image:
`./scripts/deploy.sh`. Seeding is insert-only, so re-running it against a partially seeded table is safe.
