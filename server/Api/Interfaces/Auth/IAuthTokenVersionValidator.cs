using System.Security.Claims;

namespace ProjectHiddenVillage.Server.Api.Interfaces.Auth;

/// <summary>
/// Answers whether the token in hand was minted against the account's current password generation. A password reset
/// bumps that generation, so every older token is refused.
/// </summary>
public interface IAuthTokenVersionValidator
{
    Task<bool> IsCurrentAsync(ClaimsPrincipal principal, CancellationToken cancellationToken = default);
}
