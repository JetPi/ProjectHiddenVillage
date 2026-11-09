using System.Security.Cryptography;
using System.Text;
using ErrorOr;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Options;
using ProjectHiddenVillage.Server.Api.Interfaces.Auth;
using ProjectHiddenVillage.Server.Api.Services.Email;
using ProjectHiddenVillage.Server.Data;
using ProjectHiddenVillage.Server.Data.DTOs;
using ProjectHiddenVillage.Server.Data.Entities;

namespace ProjectHiddenVillage.Server.Api.Services.Auth;

/// <summary>
/// The recovery flow: a link is issued for a registered address, the link is spent once to replace the password,
/// and every session minted before the change stops authenticating because <c>AuthVersion</c> moved.
///
/// The two rules that shape the whole class:
/// - nothing an anonymous caller can observe may reveal whether an address has an account, so an unknown address,
///   a guest, a cooldown hit and a delivered link all end in the same success;
/// - a stored row must never be enough to reset an account, so only the hash of the token is persisted.
/// </summary>
public sealed class PasswordResetService : IPasswordResetService
{
    /// <summary>One code for every way a link can be unusable: unknown, already spent, expired, or a guest.</summary>
    public const string InvalidTokenCode = "Auth.PasswordReset.InvalidToken";

    public const string DisabledCode = "Auth.PasswordReset.Disabled";

    private const int TokenSizeBytes = 32;

    /// <summary>Guards against a caller posting a megabyte of junk as a "token".</summary>
    private const int MaxTokenLength = 128;

    private readonly ApplicationDbContext dbContext;
    private readonly IPasswordHasher<User> passwordHasher;
    private readonly IEmailSender emailSender;
    private readonly EmailOptions emailOptions;
    private readonly PasswordResetOptions options;
    private readonly TimeProvider timeProvider;
    private readonly IMemoryCache authVersionCache;
    private readonly ILogger<PasswordResetService> logger;

    public PasswordResetService(
        ApplicationDbContext dbContext,
        IPasswordHasher<User> passwordHasher,
        IEmailSender emailSender,
        IOptions<EmailOptions> emailOptions,
        IOptions<PasswordResetOptions> options,
        TimeProvider timeProvider,
        IMemoryCache authVersionCache,
        ILogger<PasswordResetService> logger)
    {
        this.dbContext = dbContext;
        this.passwordHasher = passwordHasher;
        this.emailSender = emailSender;
        this.emailOptions = emailOptions.Value;
        this.options = options.Value;
        this.timeProvider = timeProvider;
        this.authVersionCache = authVersionCache;
        this.logger = logger;
    }

    public async Task<ErrorOr<Success>> RequestAsync(
        PasswordResetRequestDto request,
        string? requestedFromIp,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);

        if (!options.Enabled)
        {
            return Error.NotFound(DisabledCode, "Password recovery is not available.");
        }

        var now = timeProvider.GetUtcNow();
        var email = request.Email.Trim();

        var user = await dbContext.Users.SingleOrDefaultAsync(
            record => record.Email == email,
            cancellationToken);

        // Unknown, or a guest whose synthetic @guests.invalid address has no mailbox and whose password cannot be
        // used to sign in anyway. The response is byte-for-byte the one a delivered link produces.
        if (user is null || user.IsGuest)
        {
            return Result.Success;
        }

        PurgeStaleTokens(user.Id, now);

        // The window is longer than the hourly cap, so one read answers both "has this burst already been capped"
        // and "was a link sent in the last minute".
        var recentTokens = await dbContext.PasswordResetTokens
            .Where(record => record.UserId == user.Id && record.CreatedAtUtc > now.AddHours(-1))
            .OrderByDescending(record => record.CreatedAtUtc)
            .ToListAsync(cancellationToken);

        if (!CanIssueAnotherLink(recentTokens, now))
        {
            return Result.Success;
        }

        // One live link per account: asking again retires the previous one, so a forwarded older mail is dead the
        // moment the account holder asks for a new one.
        foreach (var outstanding in recentTokens.Where(record => record.ConsumedAtUtc is null))
        {
            outstanding.ConsumedAtUtc = now;
        }

        var rawToken = CreateToken();
        var expiresAt = now.AddMinutes(options.TokenLifetimeMinutes);

        dbContext.PasswordResetTokens.Add(new PasswordResetToken
        {
            UserId = user.Id,
            TokenHash = HashToken(rawToken),
            CreatedAtUtc = now,
            ExpiresAtUtc = expiresAt,
            RequestedFromIp = NormalizeIp(requestedFromIp)
        });

        // Persist before handing the mail to the provider: a link that can arrive must already be redeemable, and a
        // failed save must not leave a token in circulation that the database has never seen.
        await dbContext.SaveChangesAsync(cancellationToken);

        var resetUrl =
            $"{emailOptions.AppPublicBaseUrl.TrimEnd('/')}/reset-password?token={Uri.EscapeDataString(rawToken)}";

        try
        {
            await emailSender.SendPasswordResetAsync(
                new PasswordResetEmail(user.Email, user.Username, resetUrl, expiresAt),
                cancellationToken);
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            // Logged, never surfaced: a 500 that happens only when the address exists is an enumeration oracle, and
            // the operator warning at startup is what makes a misconfigured provider visible.
            logger.LogError(exception, "Password reset mail for user {UserId} could not be sent.", user.Id);
        }

        return Result.Success;
    }

    public async Task<ErrorOr<Guid>> ConfirmAsync(
        PasswordResetConfirmDto request,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);

        if (!options.Enabled)
        {
            return Error.NotFound(DisabledCode, "Password recovery is not available.");
        }

        var rawToken = request.Token.Trim();
        if (rawToken.Length is 0 or > MaxTokenLength)
        {
            return InvalidToken();
        }

        var now = timeProvider.GetUtcNow();
        var tokenHash = HashToken(rawToken);

        var record = await dbContext.PasswordResetTokens
            .Include(entity => entity.User)
            .SingleOrDefaultAsync(entity => entity.TokenHash == tokenHash, cancellationToken);

        if (record is null || record.ConsumedAtUtc is not null || record.ExpiresAtUtc <= now || record.User.IsGuest)
        {
            return InvalidToken();
        }

        var user = record.User;

        user.PasswordHash = passwordHasher.HashPassword(user, request.NewPassword);
        user.PasswordChangedAtUtc = now;
        // The old sessions die here: every token minted before this bump carries the previous version and is
        // refused by the validation pipeline from its next request on.
        user.AuthVersion += 1;

        record.ConsumedAtUtc = now;

        var siblings = await dbContext.PasswordResetTokens
            .Where(entity => entity.UserId == user.Id && entity.Id != record.Id && entity.ConsumedAtUtc == null)
            .ToListAsync(cancellationToken);

        foreach (var sibling in siblings)
        {
            sibling.ConsumedAtUtc = now;
        }

        await dbContext.SaveChangesAsync(cancellationToken);

        // Drop the memoised version so the very next request with an old token is refused without waiting for the
        // cache window to lapse. The database is the authority; this only keeps revocation immediate.
        authVersionCache.Remove(AuthVersionCache.Key(user.Id));

        logger.LogInformation("Password reset completed for user {UserId}.", user.Id);

        return user.Id;
    }

    private bool CanIssueAnotherLink(List<PasswordResetToken> recentTokens, DateTimeOffset now)
    {
        if (recentTokens.Count >= options.MaxRequestsPerHourPerEmail)
        {
            return false;
        }

        var lastIssuedAt = recentTokens.FirstOrDefault()?.CreatedAtUtc;

        return lastIssuedAt is null ||
            lastIssuedAt.Value <= now.AddSeconds(-options.RequestCooldownSeconds);
    }

    /// <summary>
    /// Drops rows past their retention window. Deleting through the change tracker rather than ExecuteDelete keeps
    /// the service usable under the in-memory provider the tests run on, and the row count here is one per request
    /// for a single account, so the extra read costs nothing.
    /// </summary>
    private void PurgeStaleTokens(Guid userId, DateTimeOffset now)
    {
        var cutoff = now.AddHours(-Math.Max(options.TokenRetentionHours, 1));

        var stale = dbContext.PasswordResetTokens
            .Where(record => record.UserId == userId && record.CreatedAtUtc < cutoff)
            .ToList();

        if (stale.Count > 0)
        {
            dbContext.PasswordResetTokens.RemoveRange(stale);
        }
    }

    private static Error InvalidToken() =>
        Error.Validation(
            InvalidTokenCode,
            "This password reset link is invalid or has expired. Request a new one.");

    /// <summary>
    /// 32 random bytes in URL-safe form. The entropy is what makes guessing pointless; the encoding is only there so
    /// the token survives a query string and a mail client's link detection unchanged.
    /// </summary>
    private static string CreateToken() =>
        Base64UrlTextEncoder.Encode(RandomNumberGenerator.GetBytes(TokenSizeBytes));

    private static string HashToken(string token) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token))).ToLowerInvariant();

    private static string? NormalizeIp(string? requestedFromIp)
    {
        if (string.IsNullOrWhiteSpace(requestedFromIp))
        {
            return null;
        }

        var trimmed = requestedFromIp.Trim();

        return trimmed.Length <= 64 ? trimmed : trimmed[..64];
    }
}
