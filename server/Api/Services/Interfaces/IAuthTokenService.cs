namespace ProjectHiddenVillage.Server;

public interface IAuthTokenService
{
    AuthTokenResult CreateToken(Guid userId, string username, string email);
}
