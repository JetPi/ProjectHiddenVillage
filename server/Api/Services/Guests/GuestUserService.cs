using System.Security.Cryptography;
using ErrorOr;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using ProjectHiddenVillage.Server.Api.Interfaces.Auth;
using ProjectHiddenVillage.Server.Api.Interfaces.User;
using ProjectHiddenVillage.Server.Data;
using ProjectHiddenVillage.Server.Data.Entities;

namespace ProjectHiddenVillage.Server.Api.Services.Guests;

public sealed class GuestUserService : IGuestUserService
{
    /// <summary>Matches the login form's own input limit, so the server never accepts what the UI cannot show.</summary>
    public const int MaxDisplayNameLength = 24;

    /// <summary>
    /// Guest rows need an email because <c>users.email</c> is required and uniquely indexed. This domain is
    /// reserved by RFC 2606, so nothing here can ever be mistaken for a reachable address.
    /// </summary>
    private const string SyntheticEmailDomain = "guests.invalid";

    private readonly ApplicationDbContext dbContext;
    private readonly IPasswordHasher<User> passwordHasher;
    private readonly IAuthTokenService authTokenService;
    private readonly GuestUserOptions options;
    private readonly TimeProvider timeProvider;
    private readonly ILogger<GuestUserService> logger;

    public GuestUserService(
        ApplicationDbContext dbContext,
        IPasswordHasher<User> passwordHasher,
        IAuthTokenService authTokenService,
        IOptions<GuestUserOptions> options,
        TimeProvider timeProvider,
        ILogger<GuestUserService> logger)
    {
        this.dbContext = dbContext;
        this.passwordHasher = passwordHasher;
        this.authTokenService = authTokenService;
        this.options = options.Value;
        this.timeProvider = timeProvider;
        this.logger = logger;
    }

    public async Task<ErrorOr<LoginResponse>> CreateGuestSessionAsync(
        GuestUserRequest request,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);

        var displayName = (request.DisplayName ?? string.Empty).Trim();
        if (displayName.Length == 0)
        {
            return Error.Validation(
                code: "User.Guest.MissingDisplayName",
                description: "A display name is required to play as a guest.");
        }

        if (displayName.Length > MaxDisplayNameLength)
        {
            return Error.Validation(
                code: "User.Guest.DisplayNameTooLong",
                description: $"A guest display name cannot exceed {MaxDisplayNameLength} characters.");
        }

        var now = timeProvider.GetUtcNow();
        var guestId = Guid.NewGuid();

        var guest = new User
        {
            Id = guestId,
            Username = displayName,
            Email = $"guest+{guestId:N}@{SyntheticEmailDomain}",
            IsGuest = true,
            CreatedAtUtc = now,
            LastSeenAtUtc = now
        };

        // Nobody knows this password - the guest authenticates only through the token minted below. It still has
        // to be a real hash so the column stays well-formed for the password hasher's own verification path.
        guest.PasswordHash = passwordHasher.HashPassword(guest, CreateUnusablePassword());

        dbContext.Users.Add(guest);

        try
        {
            await dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException)
        {
            return Error.Failure(
                code: "User.Guest.PersistFailed",
                description: "The guest session could not be created.");
        }

        var token = authTokenService.CreateGuestToken(guest.Id, guest.Username);

        return new LoginResponse(
            Id: guest.Id,
            Username: guest.Username,
            Email: guest.Email,
            AccessToken: token.AccessToken,
            ExpiresAt: token.ExpiresAt);
    }

    public async Task TouchAsync(string playerId, CancellationToken cancellationToken = default)
    {
        if (!Guid.TryParse(playerId, out var guestId))
        {
            return;
        }

        var now = timeProvider.GetUtcNow();
        var throttleCutoff = now.AddMinutes(-Math.Max(0, options.TouchThrottleMinutes));

        // Tracked read plus conditional write: a guest already recorded as recently seen costs no write at all,
        // which is what keeps this affordable on every game entry.
        var guest = await dbContext.Users
            .SingleOrDefaultAsync(
                user => user.Id == guestId && user.IsGuest && user.LastSeenAtUtc < throttleCutoff,
                cancellationToken);

        if (guest is null)
        {
            return;
        }

        guest.LastSeenAtUtc = now;
        await dbContext.SaveChangesAsync(cancellationToken);
    }

    public async Task<GuestUserSweepResult> SweepIdleGuestsAsync(CancellationToken cancellationToken = default)
    {
        var cutoff = timeProvider.GetUtcNow().AddDays(-Math.Max(0, options.RetentionDays));
        var batchSize = Math.Max(1, options.SweepBatchSize);

        var expiredGuests = await dbContext.Users
            .Where(user => user.IsGuest && user.LastSeenAtUtc < cutoff)
            .OrderBy(user => user.LastSeenAtUtc)
            .Take(batchSize)
            .ToListAsync(cancellationToken);

        if (expiredGuests.Count == 0)
        {
            return new GuestUserSweepResult(RemovedDecks: 0, RemovedGuests: 0);
        }

        var expiredGuestIds = expiredGuests.Select(guest => guest.Id).ToList();

        // Decks go first on purpose. decks.user_id is ON DELETE SET NULL, so deleting the guest first would turn
        // their transient decks into ownerless rows that no retention rule would look at again - the leak the
        // sweep exists to prevent. (Saved decks cascade, and guests cannot create them in the first place.)
        var transientDecks = await dbContext.Decks
            .Where(deck => deck.UserId.HasValue && expiredGuestIds.Contains(deck.UserId.Value))
            .ToListAsync(cancellationToken);

        dbContext.Decks.RemoveRange(transientDecks);
        dbContext.Users.RemoveRange(expiredGuests);
        await dbContext.SaveChangesAsync(cancellationToken);

        logger.LogInformation(
            "Guest retention sweep removed {GuestCount} guest(s) idle since before {Cutoff:o} and {DeckCount} transient deck(s).",
            expiredGuests.Count,
            cutoff,
            transientDecks.Count);

        return new GuestUserSweepResult(RemovedDecks: transientDecks.Count, RemovedGuests: expiredGuests.Count);
    }

    private static string CreateUnusablePassword()
    {
        return Convert.ToBase64String(RandomNumberGenerator.GetBytes(32));
    }
}
