using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using ProjectHiddenVillage.Server.Api.Interfaces.Auth;
using ProjectHiddenVillage.Server.Data;

namespace ProjectHiddenVillage.Server.Api.Services.Auth;

public sealed class AuthVersionValidator : IAuthTokenVersionValidator
{
    private readonly ApplicationDbContext dbContext;
    private readonly IMemoryCache cache;

    public AuthVersionValidator(ApplicationDbContext dbContext, IMemoryCache cache)
    {
        this.dbContext = dbContext;
        this.cache = cache;
    }

    public async Task<bool> IsCurrentAsync(ClaimsPrincipal principal, CancellationToken cancellationToken = default)
    {
        // Guests cannot be recovered and cannot be signed in to, so their tokens have no version to compare and are
        // left exactly as they were before this check existed.
        if (principal.HasClaim(AuthorizationPolicies.GuestClaimType, AuthorizationPolicies.GuestClaimValue))
        {
            return true;
        }

        if (!TryGetUserId(principal, out var userId))
        {
            return false;
        }

        var rawVersion = principal.FindFirst(AuthorizationPolicies.AuthVersionClaimType)?.Value;
        if (!int.TryParse(rawVersion, out var tokenVersion))
        {
            // A token minted before this feature shipped carries no claim. Treating it as current would keep a
            // stolen pre-reset token alive for its whole lifetime, so the cost of the rollout is one forced login.
            return false;
        }

        var currentVersion = await GetCurrentVersionAsync(userId, cancellationToken);

        return currentVersion is not null && currentVersion.Value == tokenVersion;
    }

    private async Task<int?> GetCurrentVersionAsync(Guid userId, CancellationToken cancellationToken)
    {
        var cacheKey = AuthVersionCache.Key(userId);

        if (cache.TryGetValue(cacheKey, out int cached))
        {
            return cached;
        }

        var version = await dbContext.Users
            .AsNoTracking()
            .Where(record => record.Id == userId)
            .Select(record => (int?)record.AuthVersion)
            .SingleOrDefaultAsync(cancellationToken);

        if (version is null)
        {
            // The account is gone; nothing it signed can authenticate. Not cached, so a recreated identity with the
            // same id (there is none today) would not inherit the refusal.
            return null;
        }

        cache.Set(cacheKey, version.Value, AuthVersionCache.Lifetime);

        return version.Value;
    }

    private static bool TryGetUserId(ClaimsPrincipal principal, out Guid userId)
    {
        var rawUserId = principal.FindFirstValue(ClaimTypes.NameIdentifier)
            ?? principal.FindFirstValue(JwtRegisteredClaimNames.Sub);

        return Guid.TryParse(rawUserId, out userId);
    }
}
