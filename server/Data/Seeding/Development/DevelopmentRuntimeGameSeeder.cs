using ProjectHiddenVillage.Server.Data.DTOs;
using ProjectHiddenVillage.Server.Api.Interfaces.Game;

namespace ProjectHiddenVillage.Server.Data.Seeding.Development;

public sealed class DevelopmentRuntimeGameSeeder
{
    private const string SeedRuntimeGameCode = "TEST1";
    private static readonly Guid SeedDeckOneId = Guid.Parse("10000000-0000-0000-0000-000000000001");

    private readonly InMemoryGameInstanceRegistry registry;
    private readonly IGameInstanceService gameInstanceService;
    private readonly ILogger<DevelopmentRuntimeGameSeeder> logger;

    public DevelopmentRuntimeGameSeeder(
        InMemoryGameInstanceRegistry registry,
        IGameInstanceService gameInstanceService,
        ILogger<DevelopmentRuntimeGameSeeder> logger)
    {
        this.registry = registry;
        this.gameInstanceService = gameInstanceService;
        this.logger = logger;
    }

    public async Task SeedAsync(CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();

        if (registry.TryGet(SeedRuntimeGameCode, out _))
        {
            logger.LogInformation("Skipping runtime seed game {GameCode} because it already exists in memory.", SeedRuntimeGameCode);
            return;
        }

        var createResult = await gameInstanceService.CreateGameForUser(
            new CreateGameForUserRequest(
                UserId: DevelopmentUserSeeder.SeedUserOneId,
                DeckId: SeedDeckOneId),
            preferredGameCode: SeedRuntimeGameCode);

        if (createResult.IsError)
        {
            logger.LogWarning(
                "Skipping runtime seed game {GameCode}. {ErrorDescription}",
                SeedRuntimeGameCode,
                createResult.FirstError.Description);
            return;
        }

        logger.LogInformation(
            "Seeded runtime development game {GameCode} with player {PlayerId}.",
            SeedRuntimeGameCode,
            DevelopmentUserSeeder.SeedUserOneId);
    }
}