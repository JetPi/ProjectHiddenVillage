using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using ProjectHiddenVillage.Server.Api.Services.Auth;
using ProjectHiddenVillage.Server.Api.Services.Email;
using ProjectHiddenVillage.Server.Data;
using ProjectHiddenVillage.Server.Data.DTOs;
using ProjectHiddenVillage.Server.Data.Entities;

namespace ProjectHiddenVillage.Server.Tests;

[TestClass]
public sealed class PasswordResetServiceTests
{
    private static readonly DateTimeOffset ReferenceNow = new(2026, 11, 9, 12, 0, 0, TimeSpan.Zero);

    private const string OriginalPassword = "OriginalPass1!";
    private const string ReplacementPassword = "ReplacementPass2!";

    [TestMethod]
    public async Task Request_StoresOnlyTheHash_AndMailsTheRawToken()
    {
        await using var dbContext = CreateDbContext();
        var user = SeedUser(dbContext, "player@example.com");
        var sender = new RecordingEmailSender();
        var service = CreateService(dbContext, CreateClock(), sender);

        var result = await service.RequestAsync(new PasswordResetRequestDto(user.Email), "203.0.113.5");

        Assert.IsFalse(result.IsError);
        var stored = await dbContext.PasswordResetTokens.SingleAsync();
        Assert.AreEqual(1, sender.Sent.Count);
        Assert.AreEqual("player@example.com", sender.Sent[0].RecipientEmail);
        Assert.AreEqual("203.0.113.5", stored.RequestedFromIp);
        Assert.AreEqual(64, stored.TokenHash.Length);

        var rawToken = ReadTokenFromResetUrl(sender.Sent[0].ResetUrl);
        Assert.AreNotEqual(rawToken, stored.TokenHash, "The row must not hold anything that can be replayed.");
        Assert.AreEqual(Hash(rawToken), stored.TokenHash);
    }

    [TestMethod]
    public async Task Request_IsSilentForUnknownAddresses()
    {
        await using var dbContext = CreateDbContext();
        var sender = new RecordingEmailSender();
        var service = CreateService(dbContext, CreateClock(), sender);

        var result = await service.RequestAsync(new PasswordResetRequestDto("nobody@example.com"), null);

        Assert.IsFalse(result.IsError, "The endpoint answers 202 for an unknown address; the service must agree.");
        Assert.AreEqual(0, sender.Sent.Count);
        Assert.AreEqual(0, await dbContext.PasswordResetTokens.CountAsync());
    }

    [TestMethod]
    public async Task Request_SkipsGuestIdentities()
    {
        await using var dbContext = CreateDbContext();
        var guest = SeedUser(dbContext, "guest+abc@guests.invalid", isGuest: true);
        var sender = new RecordingEmailSender();
        var service = CreateService(dbContext, CreateClock(), sender);

        await service.RequestAsync(new PasswordResetRequestDto(guest.Email), null);

        Assert.AreEqual(0, sender.Sent.Count, "A guest has no mailbox and cannot be signed in to.");
        Assert.AreEqual(0, await dbContext.PasswordResetTokens.CountAsync());
    }

    [TestMethod]
    public async Task Request_RespectsTheCooldown_ThenRetiresTheOlderLink()
    {
        await using var dbContext = CreateDbContext();
        var user = SeedUser(dbContext, "player@example.com");
        var clock = CreateClock();
        var sender = new RecordingEmailSender();
        var service = CreateService(dbContext, clock, sender);

        await service.RequestAsync(new PasswordResetRequestDto(user.Email), null);
        clock.Advance(TimeSpan.FromSeconds(30));
        await service.RequestAsync(new PasswordResetRequestDto(user.Email), null);

        Assert.AreEqual(1, sender.Sent.Count);
        Assert.AreEqual(1, await dbContext.PasswordResetTokens.CountAsync());

        clock.Advance(TimeSpan.FromSeconds(31));
        await service.RequestAsync(new PasswordResetRequestDto(user.Email), null);

        Assert.AreEqual(2, sender.Sent.Count);
        var tokens = await dbContext.PasswordResetTokens.OrderBy(token => token.CreatedAtUtc).ToListAsync();
        Assert.IsNotNull(tokens[0].ConsumedAtUtc, "The first link must die when a newer one is issued.");
        Assert.IsNull(tokens[1].ConsumedAtUtc);
    }

    [TestMethod]
    public async Task Request_StopsAtTheHourlyCap()
    {
        await using var dbContext = CreateDbContext();
        var user = SeedUser(dbContext, "player@example.com");
        var clock = CreateClock();
        var sender = new RecordingEmailSender();
        var service = CreateService(
            dbContext,
            clock,
            sender,
            options: new PasswordResetOptions { MaxRequestsPerHourPerEmail = 2 });

        await service.RequestAsync(new PasswordResetRequestDto(user.Email), null);
        clock.Advance(TimeSpan.FromSeconds(61));
        await service.RequestAsync(new PasswordResetRequestDto(user.Email), null);
        clock.Advance(TimeSpan.FromSeconds(61));
        await service.RequestAsync(new PasswordResetRequestDto(user.Email), null);

        Assert.AreEqual(2, sender.Sent.Count);
        Assert.AreEqual(2, await dbContext.PasswordResetTokens.CountAsync());
    }

    [TestMethod]
    public async Task Confirm_ReplacesThePassword_BumpsTheVersion_AndSpendsTheLink()
    {
        await using var dbContext = CreateDbContext();
        var user = SeedUser(dbContext, "player@example.com");
        var clock = CreateClock();
        var sender = new RecordingEmailSender();
        var service = CreateService(dbContext, clock, sender);
        var hasher = new PasswordHasher<User>();

        await service.RequestAsync(new PasswordResetRequestDto(user.Email), null);
        var rawToken = ReadTokenFromResetUrl(sender.Sent[0].ResetUrl);

        var confirm = await service.ConfirmAsync(new PasswordResetConfirmDto(rawToken, ReplacementPassword));

        Assert.IsFalse(confirm.IsError);
        Assert.AreEqual(user.Id, confirm.Value);

        var stored = await dbContext.Users.SingleAsync(record => record.Id == user.Id);
        Assert.AreEqual(1, stored.AuthVersion);
        Assert.AreEqual(ReferenceNow, stored.PasswordChangedAtUtc);
        Assert.AreEqual(
            PasswordVerificationResult.Success,
            hasher.VerifyHashedPassword(stored, stored.PasswordHash, ReplacementPassword));
        Assert.AreEqual(
            PasswordVerificationResult.Failed,
            hasher.VerifyHashedPassword(stored, stored.PasswordHash, OriginalPassword));

        var tokenRow = await dbContext.PasswordResetTokens.SingleAsync();
        Assert.IsNotNull(tokenRow.ConsumedAtUtc);

        var replay = await service.ConfirmAsync(new PasswordResetConfirmDto(rawToken, "AnotherPass3!"));
        Assert.IsTrue(replay.IsError);
        Assert.AreEqual(PasswordResetService.InvalidTokenCode, replay.FirstError.Code);
    }

    [TestMethod]
    public async Task Confirm_RejectsAnExpiredLink()
    {
        await using var dbContext = CreateDbContext();
        var user = SeedUser(dbContext, "player@example.com");
        var clock = CreateClock();
        var sender = new RecordingEmailSender();
        var service = CreateService(dbContext, clock, sender);

        await service.RequestAsync(new PasswordResetRequestDto(user.Email), null);
        var rawToken = ReadTokenFromResetUrl(sender.Sent[0].ResetUrl);
        clock.Advance(TimeSpan.FromMinutes(61));

        var result = await service.ConfirmAsync(new PasswordResetConfirmDto(rawToken, ReplacementPassword));

        Assert.IsTrue(result.IsError);
        Assert.AreEqual(PasswordResetService.InvalidTokenCode, result.FirstError.Code);
    }

    [TestMethod]
    public async Task Confirm_ReturnsOneGenericErrorForAnUnknownToken()
    {
        await using var dbContext = CreateDbContext();
        var service = CreateService(dbContext, CreateClock(), new RecordingEmailSender());

        var result = await service.ConfirmAsync(new PasswordResetConfirmDto("not-a-real-token", ReplacementPassword));

        Assert.IsTrue(result.IsError);
        Assert.AreEqual(PasswordResetService.InvalidTokenCode, result.FirstError.Code);
        Assert.AreEqual(
            "This password reset link is invalid or has expired. Request a new one.",
            result.FirstError.Description);
    }

    [TestMethod]
    public async Task Request_PurgesRowsPastTheRetentionWindow()
    {
        await using var dbContext = CreateDbContext();
        var user = SeedUser(dbContext, "player@example.com");
        var stale = new PasswordResetToken
        {
            UserId = user.Id,
            TokenHash = new string('a', 64),
            CreatedAtUtc = ReferenceNow.AddHours(-25),
            ExpiresAtUtc = ReferenceNow.AddHours(-24),
            ConsumedAtUtc = ReferenceNow.AddHours(-25),
        };
        dbContext.PasswordResetTokens.Add(stale);
        await dbContext.SaveChangesAsync();

        var service = CreateService(dbContext, CreateClock(), new RecordingEmailSender());

        await service.RequestAsync(new PasswordResetRequestDto(user.Email), null);

        var remaining = await dbContext.PasswordResetTokens.ToListAsync();
        Assert.AreEqual(1, remaining.Count);
        Assert.AreNotEqual(stale.Id, remaining[0].Id);
    }

    [TestMethod]
    public async Task Request_DoesNothingWhenRecoveryIsDisabled()
    {
        await using var dbContext = CreateDbContext();
        var user = SeedUser(dbContext, "player@example.com");
        var sender = new RecordingEmailSender();
        var service = CreateService(
            dbContext,
            CreateClock(),
            sender,
            options: new PasswordResetOptions { Enabled = false });

        var result = await service.RequestAsync(new PasswordResetRequestDto(user.Email), null);

        Assert.IsTrue(result.IsError);
        Assert.AreEqual(PasswordResetService.DisabledCode, result.FirstError.Code);
        Assert.AreEqual(0, sender.Sent.Count);
    }

    [TestMethod]
    public async Task Request_StillSucceedsWhenTheProviderRejectsTheMail()
    {
        await using var dbContext = CreateDbContext();
        var user = SeedUser(dbContext, "player@example.com");
        var sender = new RecordingEmailSender { ThrowOnSend = true };
        var service = CreateService(dbContext, CreateClock(), sender);

        var result = await service.RequestAsync(new PasswordResetRequestDto(user.Email), null);

        Assert.IsFalse(
            result.IsError,
            "A failure that only happens for existing addresses would itself be an enumeration oracle.");
        Assert.AreEqual(1, await dbContext.PasswordResetTokens.CountAsync());
    }

    private static TestClockProvider CreateClock() => new(ReferenceNow);

    private static ApplicationDbContext CreateDbContext()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(databaseName: $"password-reset-tests-{Guid.NewGuid()}")
            .Options;

        return new ApplicationDbContext(options);
    }

    private static User SeedUser(ApplicationDbContext dbContext, string email, bool isGuest = false)
    {
        var user = new User
        {
            Username = isGuest ? "Guest" : "Player",
            Email = email,
            IsGuest = isGuest,
        };
        user.PasswordHash = new PasswordHasher<User>().HashPassword(user, OriginalPassword);

        dbContext.Users.Add(user);
        dbContext.SaveChanges();

        return user;
    }

    private static PasswordResetService CreateService(
        ApplicationDbContext dbContext,
        TimeProvider clock,
        IEmailSender sender,
        PasswordResetOptions? options = null,
        EmailOptions? emailOptions = null)
    {
        return new PasswordResetService(
            dbContext,
            new PasswordHasher<User>(),
            sender,
            Options.Create(emailOptions ?? new EmailOptions { AppPublicBaseUrl = "https://game.test" }),
            Options.Create(options ?? new PasswordResetOptions()),
            clock,
            new MemoryCache(new MemoryCacheOptions()),
            NullLogger<PasswordResetService>.Instance);
    }

    private static string ReadTokenFromResetUrl(string resetUrl)
    {
        var token = resetUrl[(resetUrl.IndexOf("token=", StringComparison.Ordinal) + "token=".Length)..];

        return Uri.UnescapeDataString(token);
    }

    private static string Hash(string token) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token))).ToLowerInvariant();

    private sealed class RecordingEmailSender : IEmailSender
    {
        public List<PasswordResetEmail> Sent { get; } = [];

        public bool ThrowOnSend { get; init; }

        public bool IsConfigured => true;

        public Task SendPasswordResetAsync(PasswordResetEmail email, CancellationToken cancellationToken = default)
        {
            Sent.Add(email);

            return ThrowOnSend
                ? Task.FromException(new EmailDeliveryException("provider down"))
                : Task.CompletedTask;
        }
    }
}
