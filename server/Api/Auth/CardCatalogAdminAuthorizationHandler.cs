using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using ProjectHiddenVillage.Server.Api.Interfaces.Auth;

namespace ProjectHiddenVillage.Server;

/// <summary>
/// Answers <see cref="CardCatalogAdminRequirement"/> by asking the database what the caller is now.
///
/// Every failure path leaves the requirement unsatisfied, which the pipeline turns into the same 403 a non-admin
/// receives - the handler never grants on a missing claim, a missing user id, a missing row, a guest row, or a
/// cleared admin flag. A database failure is not caught here on purpose: it surfaces as a 500 rather than as a
/// quiet "allowed", and the request is refused either way.
/// </summary>
public sealed class CardCatalogAdminAuthorizationHandler(
    IActorCapabilityResolver capabilityResolver,
    ILogger<CardCatalogAdminAuthorizationHandler> logger)
    : AuthorizationHandler<CardCatalogAdminRequirement>
{
    protected override async Task HandleRequirementAsync(
        AuthorizationHandlerContext context,
        CardCatalogAdminRequirement requirement)
    {
        if (context.User?.Identity?.IsAuthenticated != true)
        {
            return;
        }

        // The claim is re-checked here, not only in the policy, so the handler is safe to reuse from a policy
        // that forgets it. It also keeps the database read off the path of an ordinary player's token.
        if (!context.User.HasClaim(
                AuthorizationPolicies.CardCatalogAdminClaimType,
                AuthorizationPolicies.CardCatalogAdminClaimValue))
        {
            return;
        }

        if (!TryResolveUserId(context.User, out var userId))
        {
            logger.LogWarning(
                "Refusing a card-catalogue admin requirement: the principal carries the admin claim but names no user id.");
            return;
        }

        if (await capabilityResolver.IsCardCatalogAdminAsync(userId))
        {
            context.Succeed(requirement);
            return;
        }

        logger.LogWarning(
            "Refusing a card-catalogue admin requirement for {UserId}: the token carries the admin claim but the stored account is not an administrator.",
            userId);
    }

    /// <summary>
    /// The same pair every controller already parses: the JWT handler maps <c>sub</c> to NameIdentifier today,
    /// but a token minted with mapped claims disabled would carry only <c>sub</c>.
    /// </summary>
    private static bool TryResolveUserId(ClaimsPrincipal principal, out Guid userId)
    {
        var rawUserId = principal.FindFirstValue(ClaimTypes.NameIdentifier)
            ?? principal.FindFirstValue(JwtRegisteredClaimNames.Sub);

        return Guid.TryParse(rawUserId, out userId);
    }
}
