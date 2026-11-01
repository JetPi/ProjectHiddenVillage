using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using ProjectHiddenVillage.Server.Data;
using ProjectHiddenVillage.Server.Data.Entities;
using ProjectHiddenVillage.Server.Data.Seeding.Bootstrap;

namespace ProjectHiddenVillage.Server.Tests;

[TestClass]
public sealed class AdminBootstrapSeederTests
{
    private const string AdminEmail = "ibrahimzarragaam@gmail.com";

    [TestMethod]
    public async Task SeedAsync_PromotesExistingUser_WithoutTouchingTheStoredPassword()
    {
        await using var dbContext = CreateDbContext();
        var hasher = new PasswordHasher<User>();
        var user = new User { Username = "ibrahim", Email = AdminEmail };
        user.PasswordHash = hasher.HashPassword(user, "OriginalPass1!");
        dbContext.Users.Add(user);
        await dbContext.SaveChangesAsync();

        var changed = await CreateSeeder(dbContext, new AdminBootstrapOptions { Email = AdminEmail })
            .SeedAsync();

        Assert.IsTrue(changed);

        var stored = await dbContext.Users.AsNoTracking().SingleAsync(record => record.Email == AdminEmail);
        Assert.IsTrue(stored.IsCardCatalogAdmin);
        Assert.AreEqual(user.PasswordHash, stored.PasswordHash);
        Assert.AreEqual(
            PasswordVerificationResult.Success,
            hasher.VerifyHashedPassword(stored, stored.PasswordHash, "OriginalPass1!"));
    }

    [TestMethod]
    public async Task SeedAsync_DoesNothing_WhenTheUserIsAlreadyAnAdmin()
    {
        await using var dbContext = CreateDbContext();
        dbContext.Users.Add(new User
        {
            Username = "ibrahim",
            Email = AdminEmail,
            PasswordHash = "hash",
            IsCardCatalogAdmin = true,
        });
        await dbContext.SaveChangesAsync();

        var changed = await CreateSeeder(dbContext, new AdminBootstrapOptions { Email = AdminEmail })
            .SeedAsync();

        Assert.IsFalse(changed);
    }

    [TestMethod]
    public async Task SeedAsync_CreatesTheAdmin_WhenNoAccountExistsAndAPasswordIsConfigured()
    {
        await using var dbContext = CreateDbContext();
        var options = new AdminBootstrapOptions
        {
            Email = AdminEmail,
            Username = "ibrahim",
            Password = "Bootstrapped1!",
        };

        var changed = await CreateSeeder(dbContext, options).SeedAsync();

        Assert.IsTrue(changed);

        var stored = await dbContext.Users.AsNoTracking().SingleAsync(record => record.Email == AdminEmail);
        Assert.IsTrue(stored.IsCardCatalogAdmin);
        Assert.IsFalse(stored.IsGuest);
        Assert.AreEqual("ibrahim", stored.Username);
        Assert.AreEqual(
            PasswordVerificationResult.Success,
            new PasswordHasher<User>().VerifyHashedPassword(stored, stored.PasswordHash, "Bootstrapped1!"));
    }

    [TestMethod]
    public async Task SeedAsync_DerivesTheUsernameFromTheEmail_WhenNoneIsConfigured()
    {
        await using var dbContext = CreateDbContext();
        var options = new AdminBootstrapOptions { Email = AdminEmail, Password = "Bootstrapped1!" };

        await CreateSeeder(dbContext, options).SeedAsync();

        var stored = await dbContext.Users.AsNoTracking().SingleAsync(record => record.Email == AdminEmail);
        Assert.AreEqual("ibrahimzarragaam", stored.Username);
    }

    [TestMethod]
    public async Task SeedAsync_CreatesNothing_WhenNoAccountExistsAndNoPasswordIsConfigured()
    {
        await using var dbContext = CreateDbContext();

        var changed = await CreateSeeder(dbContext, new AdminBootstrapOptions { Email = AdminEmail })
            .SeedAsync();

        Assert.IsFalse(changed);
        Assert.AreEqual(0, await dbContext.Users.CountAsync());
    }

    [TestMethod]
    public async Task SeedAsync_RefusesToPromoteAGuestIdentity()
    {
        await using var dbContext = CreateDbContext();
        dbContext.Users.Add(new User
        {
            Username = "guest",
            Email = AdminEmail,
            PasswordHash = "hash",
            IsGuest = true,
        });
        await dbContext.SaveChangesAsync();

        var changed = await CreateSeeder(dbContext, new AdminBootstrapOptions { Email = AdminEmail })
            .SeedAsync();

        Assert.IsFalse(changed);

        var stored = await dbContext.Users.AsNoTracking().SingleAsync(record => record.Email == AdminEmail);
        Assert.IsFalse(stored.IsCardCatalogAdmin);
    }

    [TestMethod]
    public async Task SeedAsync_DoesNothing_WhenTheConfiguredEmailIsBlank()
    {
        await using var dbContext = CreateDbContext();
        dbContext.Users.Add(new User
        {
            Username = "ibrahim",
            Email = AdminEmail,
            PasswordHash = "hash",
        });
        await dbContext.SaveChangesAsync();

        var changed = await CreateSeeder(dbContext, new AdminBootstrapOptions
        {
            Email = "   ",
            Password = "Bootstrapped1!",
        }).SeedAsync();

        Assert.IsFalse(changed);

        var stored = await dbContext.Users.AsNoTracking().SingleAsync(record => record.Email == AdminEmail);
        Assert.IsFalse(stored.IsCardCatalogAdmin);
    }

    private static AdminBootstrapSeeder CreateSeeder(
        ApplicationDbContext dbContext,
        AdminBootstrapOptions options)
    {
        return new AdminBootstrapSeeder(
            dbContext,
            new PasswordHasher<User>(),
            Options.Create(options),
            NullLogger<AdminBootstrapSeeder>.Instance);
    }

    private static ApplicationDbContext CreateDbContext()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(databaseName: $"admin-bootstrap-seeder-tests-{Guid.NewGuid()}")
            .Options;

        return new ApplicationDbContext(options);
    }
}
