using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using ProjectHiddenVillage.Server.Api.Interfaces.Auth;
namespace ProjectHiddenVillage.Server;

public sealed class AuthTokenService : IAuthTokenService
{
    private readonly JwtOptions jwtOptions;

    public AuthTokenService(IOptions<JwtOptions> jwtOptions)
    {
        this.jwtOptions = jwtOptions.Value;
    }

    public AuthTokenResult CreateToken(Guid userId, string username, string email, bool isCardCatalogAdmin)
    {
        if (string.IsNullOrWhiteSpace(email))
        {
            throw new ArgumentException("Email is required.", nameof(email));
        }

        var claims = CreateIdentityClaims(userId, username);
        claims.Add(new Claim(JwtRegisteredClaimNames.Email, email));

        if (isCardCatalogAdmin)
        {
            claims.Add(new Claim(
                AuthorizationPolicies.CardCatalogAdminClaimType,
                AuthorizationPolicies.CardCatalogAdminClaimValue));
        }

        return WriteToken(claims);
    }

    public AuthTokenResult CreateGuestToken(Guid userId, string displayName)
    {
        var claims = CreateIdentityClaims(userId, displayName);
        claims.Add(new Claim(AuthorizationPolicies.GuestClaimType, AuthorizationPolicies.GuestClaimValue));

        return WriteToken(claims);
    }

    /// <summary>
    /// The claims every token carries. Guests deliberately get no email claim: they have no mailbox, only the
    /// synthetic address the guest row needs to satisfy the unique email index.
    /// </summary>
    private static List<Claim> CreateIdentityClaims(Guid userId, string username)
    {
        if (string.IsNullOrWhiteSpace(username))
        {
            throw new ArgumentException("Username is required.", nameof(username));
        }

        return
        [
            new Claim(JwtRegisteredClaimNames.Sub, userId.ToString()),
            new Claim("username", username),
            new Claim(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString())
        ];
    }

    private AuthTokenResult WriteToken(List<Claim> claims)
    {
        var now = DateTimeOffset.UtcNow;
        var expiresAt = now.AddMinutes(jwtOptions.AccessTokenLifetimeMinutes);

        var securityKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtOptions.Key));
        var signingCredentials = new SigningCredentials(securityKey, SecurityAlgorithms.HmacSha256);

        var tokenDescriptor = new JwtSecurityToken(
            issuer: jwtOptions.Issuer,
            audience: jwtOptions.Audience,
            claims: claims,
            notBefore: now.UtcDateTime,
            expires: expiresAt.UtcDateTime,
            signingCredentials: signingCredentials);

        var token = new JwtSecurityTokenHandler().WriteToken(tokenDescriptor);

        return new AuthTokenResult(token, expiresAt);
    }
}
