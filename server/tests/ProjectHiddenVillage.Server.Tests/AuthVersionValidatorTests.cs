using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using ProjectHiddenVillage.Server.Api.Services.Auth;
using ProjectHiddenVillage.Server.Data;
using ProjectHiddenVillage.Server.Data.Entities;

namespace ProjectHiddenVillage.Server.Tests;

[TestClass]
public sealed class AuthVersionValidatorTests
{
    [TestMethod]
    public async Task IsCurrent_AcceptsATokenMintedAgainstTheStoredVersion()
    {
        await using var dbContext = CreateDbContext();
        var user = SeedUser(dbContext, authVersion: 0);
        var validator = CreateValidator(dbContext);

        Assert.IsTrue(await validator.IsCurrentAsync(BuildPrincipal(user.Id, "0")));
    }

    [TestMethod]
    public async Task IsCurrent_RefusesATokenFromAnOlderPasswordGeneration()
    {
        await using var dbContext = CreateDbContext();
        var user = SeedUser(dbContext, authVersion: 3);
        var validator = CreateValidator(dbContext);

        Assert.IsFalse(await validator.IsCurrentAsync(BuildPrincipal(user.Id, "2")));
    }

    [TestMethod]
    public async Task IsCurrent_RefusesARegisteredTokenWithoutAVersionClaim()
    {
        // Tokens minted before this feature shipped carry no `ver`. Accepting them would keep a stolen pre-reset
        // token alive for its whole lifetime, so the rollout costs everyone one login instead.
        await using var dbContext = CreateDbContext();
        var user = SeedUser(dbContext, authVersion: 0);
        var validator = CreateValidator(dbContext);

        Assert.IsFalse(await validator.IsCurrentAsync(BuildPrincipal(user.Id, version: null)));
    }

    [TestMethod]
    public async Task IsCurrent_AcceptsGuestsWithoutLookingAnythingUp()
    {
        await using var dbContext = CreateDbContext();
        var validator = CreateValidator(dbContext);

        var principal = new ClaimsPrincipal(new ClaimsIdentity(
        [
            new Claim(ClaimTypes.NameIdentifier, Guid.NewGuid().ToString()),
            new Claim(AuthorizationPolicies.GuestClaimType, AuthorizationPolicies.GuestClaimValue),
        ], "Test"));

        Assert.IsTrue(await validator.IsCurrentAsync(principal));
    }

    [TestMethod]
    public async Task IsCurrent_RefusesATokenWhoseAccountIsGone()
    {
        await using var dbContext = CreateDbContext();
        var validator = CreateValidator(dbContext);

        Assert.IsFalse(await validator.IsCurrentAsync(BuildPrincipal(Guid.NewGuid(), "0")));
    }

    [TestMethod]
    public async Task IsCurrent_SeesABumpImmediatelyOnceTheCacheEntryIsEvicted()
    {
        await using var dbContext = CreateDbContext();
        var user = SeedUser(dbContext, authVersion: 0);
        var cache = new MemoryCache(new MemoryCacheOptions());
        var validator = new AuthVersionValidator(dbContext, cache);
        var principal = BuildPrincipal(user.Id, "0");

        Assert.IsTrue(await validator.IsCurrentAsync(principal));

        user.AuthVersion = 1;
        await dbContext.SaveChangesAsync();

        Assert.IsTrue(
            await validator.IsCurrentAsync(principal),
            "Within the cache window the old answer is expected; the reset evicts the entry rather than waiting.");

        cache.Remove(AuthVersionCache.Key(user.Id));

        Assert.IsFalse(await validator.IsCurrentAsync(principal));
    }

    private static AuthVersionValidator CreateValidator(ApplicationDbContext dbContext) =>
        new(dbContext, new MemoryCache(new MemoryCacheOptions()));

    private static ApplicationDbContext CreateDbContext()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(databaseName: $"auth-version-tests-{Guid.NewGuid()}")
            .Options;

        return new ApplicationDbContext(options);
    }

    private static User SeedUser(ApplicationDbContext dbContext, int authVersion)
    {
        var user = new User
        {
            Username = "player",
            Email = $"{Guid.NewGuid():N}@example.com",
            PasswordHash = "hash",
            AuthVersion = authVersion,
        };

        dbContext.Users.Add(user);
        dbContext.SaveChanges();

        return user;
    }

    private static ClaimsPrincipal BuildPrincipal(Guid userId, string? version)
    {
        var claims = new List<Claim>
        {
            new(ClaimTypes.NameIdentifier, userId.ToString()),
        };

        if (version is not null)
        {
            claims.Add(new Claim(AuthorizationPolicies.AuthVersionClaimType, version));
        }

        return new ClaimsPrincipal(new ClaimsIdentity(claims, "Test"));
    }
}
