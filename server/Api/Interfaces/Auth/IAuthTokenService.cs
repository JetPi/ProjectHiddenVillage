namespace ProjectHiddenVillage.Server.Api.Interfaces.Auth;

public interface IAuthTokenService
{
    /// <summary>
    /// Mints a registered account's session token. <paramref name="authVersion"/> is copied into the <c>ver</c>
    /// claim so validation can refuse the token once a password reset increments the stored version.
    /// </summary>
    AuthTokenResult CreateToken(
        Guid userId,
        string username,
        string email,
        bool isCardCatalogAdmin,
        int authVersion = 0);

    /// <summary>
    /// Mints the token a guest plays with. It carries no email and no admin claim, and it is the guest claim
    /// that keeps <see cref="AuthorizationPolicies.RegisteredUser"/> endpoints closed to it.
    /// </summary>
    AuthTokenResult CreateGuestToken(Guid userId, string displayName);
}
