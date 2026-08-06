using Microsoft.EntityFrameworkCore;
using ProjectHiddenVillage.Server.Data.Entities;
using DataGameInstance = ProjectHiddenVillage.Server.Data.Entities.GameInstance;

namespace ProjectHiddenVillage.Server.Data.Seeding.Development;

public sealed class DevelopmentGameInstanceSeeder
{
    private static readonly Guid SeedGameInstanceId = Guid.Parse("30000000-0000-0000-0000-000000000001");
    private const string SeedGameJoinCode = "TEST1";

    private static readonly Guid SeedDeckOneId = Guid.Parse("10000000-0000-0000-0000-000000000001");
    private static readonly Guid SeedDeckTwoId = Guid.Parse("10000000-0000-0000-0000-000000000002");

    private readonly ApplicationDbContext dbContext;
    private readonly ILogger<DevelopmentGameInstanceSeeder> logger;

    public DevelopmentGameInstanceSeeder(
        ApplicationDbContext dbContext,
        ILogger<DevelopmentGameInstanceSeeder> logger)
    {
        this.dbContext = dbContext;
        this.logger = logger;
    }

    public async Task SeedAsync(CancellationToken cancellationToken = default)
    {
        var gameExists = await dbContext.GameInstances
            .AsNoTracking()
            .AnyAsync(game => game.Id == SeedGameInstanceId, cancellationToken);

        var joinCodeExists = await dbContext.GameInstances
            .AsNoTracking()
            .AnyAsync(game => game.JoinCode == SeedGameJoinCode, cancellationToken);

        if (gameExists || joinCodeExists)
        {
            logger.LogInformation(
                "Skipping seed game instance {GameInstanceId} because id or join code already exists.",
                SeedGameInstanceId);
            return;
        }

        var playerOneExists = await dbContext.Users
            .AsNoTracking()
            .AnyAsync(user => user.Id == DevelopmentUserSeeder.SeedUserOneId, cancellationToken);
        var playerTwoExists = await dbContext.Users
            .AsNoTracking()
            .AnyAsync(user => user.Id == DevelopmentUserSeeder.SeedUserTwoId, cancellationToken);

        if (!playerOneExists || !playerTwoExists)
        {
            logger.LogWarning(
                "Skipping seed game instance {GameInstanceId} because seeded users are missing.",
                SeedGameInstanceId);
            return;
        }

        var playerOneDeckExists = await dbContext.Decks
            .AsNoTracking()
            .AnyAsync(deck => deck.Id == SeedDeckOneId, cancellationToken);
        var playerTwoDeckExists = await dbContext.Decks
            .AsNoTracking()
            .AnyAsync(deck => deck.Id == SeedDeckTwoId, cancellationToken);

        if (!playerOneDeckExists || !playerTwoDeckExists)
        {
            logger.LogWarning(
                "Skipping seed game instance {GameInstanceId} because seeded decks are missing.",
                SeedGameInstanceId);
            return;
        }

        var gameInstance = new DataGameInstance
        {
            Id = SeedGameInstanceId,
            JoinCode = SeedGameJoinCode,
            Player1UserId = DevelopmentUserSeeder.SeedUserOneId,
            Player2UserId = DevelopmentUserSeeder.SeedUserTwoId,
            Player1DeckId = SeedDeckOneId,
            Player2DeckId = SeedDeckTwoId,
            Player1CurrentChakras = [true, true, true, true, true, true],
            Player2CurrentChakras = [true, true, true, true, true, true],
            Player1SummonCard = true,
            Player2SummonCard = true,
            CreatedAtUtc = DateTimeOffset.UtcNow
        };

        dbContext.GameInstances.Add(gameInstance);
        await dbContext.SaveChangesAsync(cancellationToken);

        logger.LogInformation(
            "Seeded development game instance {GameInstanceId} with players {Player1UserId} and {Player2UserId}.",
            gameInstance.Id,
            gameInstance.Player1UserId,
            gameInstance.Player2UserId);
    }
}