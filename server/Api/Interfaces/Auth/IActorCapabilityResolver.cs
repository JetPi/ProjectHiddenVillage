namespace ProjectHiddenVillage.Server.Api.Interfaces.Auth;

/// <summary>
/// The authority on what an account may do, answered from the database rather than from the token.
///
/// A token states what the caller was when it was minted. The <c>card_catalog_admin</c> claim therefore outlives
/// a demotion, a deletion, or a stolen token by however long the token lives (see
/// <c>Jwt:AccessTokenLifetimeMinutes</c>). This resolver is the read-back that makes every admin check reflect
/// the <c>users</c> row as it stands now, and it is the single place that reads that column on a request path -
/// the authorization policy and the deck owner-or-admin branch both go through it.
/// </summary>
public interface IActorCapabilityResolver
{
    /// <summary>
    /// True only when a stored row exists for <paramref name="userId"/>, it is not a guest identity, and its
    /// catalogue-admin flag is set. Anything else - a missing row, a guest row, a demoted account - is false.
    /// </summary>
    Task<bool> IsCardCatalogAdminAsync(Guid userId, CancellationToken cancellationToken = default);
}
