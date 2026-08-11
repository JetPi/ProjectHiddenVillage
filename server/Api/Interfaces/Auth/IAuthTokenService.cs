namespace ProjectHiddenVillage.Server.Api.Interfaces.Auth;

public interface IAuthTokenService
{
    AuthTokenResult CreateToken(Guid userId, string username, string email);
}
