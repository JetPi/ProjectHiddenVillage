using System.IdentityModel.Tokens.Jwt;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using ProjectHiddenVillage.Server.Api.Services.Guests;
using ProjectHiddenVillage.Server.Data;
using ProjectHiddenVillage.Server.Data.DTOs;
using ProjectHiddenVillage.Server.Data.Entities;

namespace ProjectHiddenVillage.Server.Tests;

[TestClass]
public sealed class GuestUserServiceTests
{
    private static readonly DateTimeOffset ReferenceNow = new(2026, 10, 26, 12, 0, 0, TimeSpan.Zero);

    [TestMethod]
    public async Task CreateGuestSessionAsync_ReturnsATokenThatCanOnlyBeAGuest()
    {
        await using var dbContext = CreateDbContext();
        var service = CreateService(dbContext, new StubTimeProvider(ReferenceNow));

        var result = await service.CreateGuestSessionAsync(new GuestUserRequest("  Shadow  "));

        Assert.IsFalse(result.IsError, result.IsError ? result.FirstError.Description : string.Empty);
        Assert.AreEqual("Shadow", result.Value.Username);

        var guest = await dbContext.Users.SingleAsync();
        Assert.IsTrue(guest.IsGuest);
        Assert.AreEqual("Shadow", guest.Username);
        Assert.IsTrue(guest.Email.StartsWith("guest+", StringComparison.Ordinal), guest.Email);
        Assert.IsTrue(guest.Email.EndsWith("@guests.invalid", StringComparison.Ordinal), guest.Email);
        Assert.AreNotEqual(string.Empty, guest.PasswordHash);
        Assert.AreEqual(ReferenceNow, guest.CreatedAtUtc);
        Assert.AreEqual(ReferenceNow, guest.LastSeenAtUtc);

        var token = new JwtSecurityTokenHandler().ReadJwtToken(result.Value.AccessToken);

        Assert.IsNotNull(
            token.Claims.FirstOrDefault(claim => claim.Type == AuthorizationPolicies.GuestClaimType),
            "A guest token has to say it is a guest, that claim is what closes RegisteredUser endpoints.");
        Assert.AreEqual(
            AuthorizationPolicies.GuestClaimValue,
            token.Claims.Single(claim => claim.Type == AuthorizationPolicies.GuestClaimType).Value);
        Assert.IsNull(
            token.Claims.FirstOrDefault(claim => claim.Type == AuthorizationPolicies.CardCatalogAdminClaimType),
            "A guest must never be able to mint an admin token.");
        Assert.IsNull(
            token.Claims.FirstOrDefault(claim => claim.Type == JwtRegisteredClaimNames.Email),
            "Guests have no reachable mailbox, so the token carries no email claim.");
    }

    [TestMethod]
    public async Task CreateGuestSessionAsync_RejectsBlankAndOverlongDisplayNames()
    {
        await using var dbContext = CreateDbContext();
        var service = CreateService(dbContext, new StubTimeProvider(ReferenceNow));

        var blank = await service.CreateGuestSessionAsync(new GuestUserRequest("   "));
        var tooLong = await service.CreateGuestSessionAsync(
            new GuestUserRequest(new string('a', GuestUserService.MaxDisplayNameLength + 1)));

        Assert.IsTrue(blank.IsError);
        Assert.AreEqual("User.Guest.MissingDisplayName", blank.FirstError.Code);
        Assert.IsTrue(tooLong.IsError);
        Assert.AreEqual("User.Guest.DisplayNameTooLong", tooLong.FirstError.Code);
        Assert.AreEqual(0, await dbContext.Users.CountAsync());
    }

    [TestMethod]
    public async Task SweepIdleGuestsAsync_RemovesOnlyGuestsIdleForOverAWeekAndTheirDecks()
    {
        await using var dbContext = CreateDbContext();

        var idleGuest = CreateUser(isGuest: true, lastSeenAtUtc: ReferenceNow.AddDays(-8), email: "guest+idle@guests.invalid");
        var idleGuestDeck = new Deck { Type = DeckType.User, Name = "transient", User = idleGuest };
        var activeGuest = CreateUser(isGuest: true, lastSeenAtUtc: ReferenceNow.AddDays(-2), email: "guest+active@guests.invalid");
        var idleRegisteredUser = CreateUser(isGuest: false, lastSeenAtUtc: ReferenceNow.AddDays(-30), email: "registered@example.com");
        var registeredDeck = new Deck { Type = DeckType.User, Name = "saved", User = idleRegisteredUser };

        dbContext.Users.AddRange(idleGuest, activeGuest, idleRegisteredUser);
        dbContext.Decks.AddRange(idleGuestDeck, registeredDeck);
        await dbContext.SaveChangesAsync();

        var service = CreateService(dbContext, new StubTimeProvider(ReferenceNow));

        var result = await service.SweepIdleGuestsAsync();

        Assert.AreEqual(1, result.RemovedGuests);
        Assert.AreEqual(1, result.RemovedDecks);

        var remainingUserIds = await dbContext.Users.Select(user => user.Id).ToListAsync();
        CollectionAssert.AreEquivalent(
            new[] { activeGuest.Id, idleRegisteredUser.Id },
            remainingUserIds,
            "A guest used within the retention window keeps their row, and a registered user is never collected.");

        var remainingDecks = await dbContext.Decks.ToListAsync();
        Assert.AreEqual(1, remainingDecks.Count);
        Assert.AreEqual(idleRegisteredUser.Id, remainingDecks[0].UserId);
        Assert.AreEqual(
            0,
            remainingDecks.Count(deck => deck.UserId is null),
            "decks.user_id is ON DELETE SET NULL, so the sweep has to delete guest decks before the guest row.");
    }

    [TestMethod]
    public async Task TouchAsync_RefreshesLastSeenOnlyWhenTheThrottleHasElapsed()
    {
        await using var dbContext = CreateDbContext();

        var staleGuest = CreateUser(isGuest: true, lastSeenAtUtc: ReferenceNow.AddMinutes(-30), email: "guest+stale@guests.invalid");
        var freshGuest = CreateUser(isGuest: true, lastSeenAtUtc: ReferenceNow.AddMinutes(-1), email: "guest+fresh@guests.invalid");
        var registeredUser = CreateUser(isGuest: false, lastSeenAtUtc: ReferenceNow.AddMinutes(-30), email: "registered@example.com");

        dbContext.Users.AddRange(staleGuest, freshGuest, registeredUser);
        await dbContext.SaveChangesAsync();

        var service = CreateService(dbContext, new StubTimeProvider(ReferenceNow));

        await service.TouchAsync(staleGuest.Id.ToString("N"));
        await service.TouchAsync(freshGuest.Id.ToString("N"));
        await service.TouchAsync(registeredUser.Id.ToString("N"));
        await service.TouchAsync("not-a-guid");

        var users = await dbContext.Users.AsNoTracking().ToListAsync();

        Assert.AreEqual(ReferenceNow, users.Single(user => user.Id == staleGuest.Id).LastSeenAtUtc);
        Assert.AreEqual(
            ReferenceNow.AddMinutes(-1),
            users.Single(user => user.Id == freshGuest.Id).LastSeenAtUtc,
            "A guest already recorded as recently seen must not cost a write.");
        Assert.AreEqual(
            ReferenceNow.AddMinutes(-30),
            users.Single(user => user.Id == registeredUser.Id).LastSeenAtUtc,
            "Registered users are not part of the guest retention window.");
    }

    [TestMethod]
    public async Task VerifyLogin_RejectsAGuestIdentity()
    {
        await using var dbContext = CreateDbContext();

        var guest = CreateUser(isGuest: true, lastSeenAtUtc: ReferenceNow, email: "guest+login@guests.invalid");
        dbContext.Users.Add(guest);
        await dbContext.SaveChangesAsync();

        var userService = new UserService(dbContext, new PasswordHasher<User>());

        var result = await userService.VerifyLogin(new UserLoginDto(guest.Email, "anything"));

        Assert.IsTrue(result.IsError);
        Assert.AreEqual("Auth.GuestLoginNotAllowed", result.FirstError.Code);
    }

    private static GuestUserService CreateService(ApplicationDbContext dbContext, TimeProvider timeProvider)
    {
        var jwtOptions = Options.Create(new JwtOptions
        {
            Issuer = "ProjectHiddenVillage.Server.Tests",
            Audience = "ProjectHiddenVillage.Client.Tests",
            Key = "this-is-a-test-key-with-sufficient-length-12345",
            AccessTokenLifetimeMinutes = 60,
        });

        return new GuestUserService(
            dbContext,
            new PasswordHasher<User>(),
            new AuthTokenService(jwtOptions),
            Options.Create(new GuestUserOptions()),
            timeProvider,
            NullLogger<GuestUserService>.Instance);
    }

    private static User CreateUser(bool isGuest, DateTimeOffset lastSeenAtUtc, string email)
    {
        return new User
        {
            Username = isGuest ? "Guest" : "Registered",
            Email = email,
            PasswordHash = "hash",
            IsGuest = isGuest,
            CreatedAtUtc = lastSeenAtUtc,
            LastSeenAtUtc = lastSeenAtUtc,
        };
    }

    private static ApplicationDbContext CreateDbContext()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(databaseName: $"guest-user-tests-{Guid.NewGuid()}")
            .Options;

        return new ApplicationDbContext(options);
    }

    private sealed class StubTimeProvider(DateTimeOffset utcNow) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => utcNow;
    }
}
