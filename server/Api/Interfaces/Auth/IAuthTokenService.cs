namespace ProjectHiddenVillage.Server.Api.Interfaces.Auth;

public interface IAuthTokenService
{
    AuthTokenResult CreateToken(Guid userId, string username, string email, bool isCardCatalogAdmin);

    /// <summary>
    /// Mints the token a guest plays with. It carries no email and no admin claim, and it is the guest claim
    /// that keeps <see cref="AuthorizationPolicies.RegisteredUser"/> endpoints closed to it.
    /// </summary>
    AuthTokenResult CreateGuestToken(Guid userId, string displayName);
}
