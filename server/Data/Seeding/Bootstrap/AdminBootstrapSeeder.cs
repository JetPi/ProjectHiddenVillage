using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using ProjectHiddenVillage.Server.Data.Entities;

namespace ProjectHiddenVillage.Server.Data.Seeding.Bootstrap;

public sealed class AdminBootstrapSeeder
{
    private readonly ApplicationDbContext dbContext;
    private readonly IPasswordHasher<User> passwordHasher;
    private readonly AdminBootstrapOptions options;
    private readonly ILogger<AdminBootstrapSeeder> logger;

    public AdminBootstrapSeeder(
        ApplicationDbContext dbContext,
        IPasswordHasher<User> passwordHasher,
        IOptions<AdminBootstrapOptions> options,
        ILogger<AdminBootstrapSeeder> logger)
    {
        this.dbContext = dbContext;
        this.passwordHasher = passwordHasher;
        this.options = options.Value;
        this.logger = logger;
    }

    public async Task<bool> SeedAsync(CancellationToken cancellationToken = default)
    {
        var email = options.Email.Trim();
        if (string.IsNullOrWhiteSpace(email))
        {
            logger.LogWarning("Admin bootstrap is enabled but AdminBootstrap:Email is empty.");
            return false;
        }

        var existingUser = await dbContext.Users
            .SingleOrDefaultAsync(record => record.Email == email, cancellationToken);

        return existingUser is null
            ? await CreateAdminAsync(email, cancellationToken)
            : await PromoteAsync(existingUser, email, cancellationToken);
    }

    private async Task<bool> PromoteAsync(User user, string email, CancellationToken cancellationToken)
    {
        if (user.IsGuest)
        {
            logger.LogWarning("Admin bootstrap skipped {Email}: the row is a guest identity.", email);
            return false;
        }

        if (user.IsCardCatalogAdmin)
        {
            logger.LogInformation("Admin bootstrap: {Email} is already a card catalogue admin.", email);
            return false;
        }

        user.IsCardCatalogAdmin = true;
        await dbContext.SaveChangesAsync(cancellationToken);

        logger.LogInformation("Admin bootstrap promoted {Email}; the stored password was left untouched.", email);
        return true;
    }

    private async Task<bool> CreateAdminAsync(string email, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(options.Password))
        {
            logger.LogWarning(
                "Admin bootstrap found no account for {Email} and AdminBootstrap:Password is empty, so nothing was created.",
                email);
            return false;
        }

        var user = new User
        {
            Username = ResolveUsername(email),
            Email = email,
            IsCardCatalogAdmin = true,
        };

        user.PasswordHash = passwordHasher.HashPassword(user, options.Password);

        dbContext.Users.Add(user);
        await dbContext.SaveChangesAsync(cancellationToken);

        logger.LogInformation(
            "Admin bootstrap created the admin account {Email}; sign in, change its password and disable the bootstrap.",
            email);
        return true;
    }

    private string ResolveUsername(string email)
    {
        var configuredUsername = options.Username.Trim();
        if (!string.IsNullOrWhiteSpace(configuredUsername))
        {
            return configuredUsername;
        }

        var separatorIndex = email.IndexOf('@');
        return separatorIndex > 0 ? email[..separatorIndex] : email;
    }
}
