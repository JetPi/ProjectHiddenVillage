using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using ProjectHiddenVillage.Server.Data.Entities;

namespace ProjectHiddenVillage.Server.Data.Seeding.Development;

public sealed class DevelopmentUserSeeder
{
    public static readonly Guid SeedUserOneId = Guid.Parse("20000000-0000-0000-0000-000000000001");
    public static readonly Guid SeedUserTwoId = Guid.Parse("20000000-0000-0000-0000-000000000002");

    private static readonly IReadOnlyList<SeedUserDefinition> SeedUsers =
    [
        new SeedUserDefinition(
            UserId: SeedUserOneId,
            Username: "test-user-1",
            Email: "test-user-1@hiddenvillage.local",
            Password: "TestUser1!"),
        new SeedUserDefinition(
            UserId: SeedUserTwoId,
            Username: "test-user-2",
            Email: "test-user-2@hiddenvillage.local",
            Password: "TestUser2!")
    ];

    private readonly ApplicationDbContext dbContext;
    private readonly IPasswordHasher<User> passwordHasher;
    private readonly ILogger<DevelopmentUserSeeder> logger;

    public DevelopmentUserSeeder(
        ApplicationDbContext dbContext,
        IPasswordHasher<User> passwordHasher,
        ILogger<DevelopmentUserSeeder> logger)
    {
        this.dbContext = dbContext;
        this.passwordHasher = passwordHasher;
        this.logger = logger;
    }

    public async Task SeedAsync(CancellationToken cancellationToken = default)
    {
        foreach (var seedUser in SeedUsers)
        {
            var existsById = await dbContext.Users
                .AsNoTracking()
                .AnyAsync(user => user.Id == seedUser.UserId, cancellationToken);

            if (existsById)
            {
                logger.LogInformation("Skipping seed user {UserId} because it already exists.", seedUser.UserId);
                continue;
            }

            var existsByEmail = await dbContext.Users
                .AsNoTracking()
                .AnyAsync(user => user.Email == seedUser.Email, cancellationToken);

            if (existsByEmail)
            {
                logger.LogWarning(
                    "Skipping seed user {UserId} because email '{Email}' already exists.",
                    seedUser.UserId,
                    seedUser.Email);
                continue;
            }

            var user = new User
            {
                Id = seedUser.UserId,
                Username = seedUser.Username,
                Email = seedUser.Email
            };

            user.PasswordHash = passwordHasher.HashPassword(user, seedUser.Password);

            dbContext.Users.Add(user);
            await dbContext.SaveChangesAsync(cancellationToken);

            logger.LogInformation("Seeded development user {UserId} ({Email}).", user.Id, user.Email);
        }
    }

    private sealed record SeedUserDefinition(
        Guid UserId,
        string Username,
        string Email,
        string Password);
}