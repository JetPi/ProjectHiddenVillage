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
    private readonly HashSet<string> cardCatalogAdminEmails;

    public AuthTokenService(IOptions<JwtOptions> jwtOptions, IConfiguration configuration)
    {
        this.jwtOptions = jwtOptions.Value;
        cardCatalogAdminEmails = configuration
            .GetSection("Authorization:CardCatalogAdmins:Emails")
            .Get<string[]>()
            ?.Where(email => !string.IsNullOrWhiteSpace(email))
            .Select(email => email.Trim())
            .ToHashSet(StringComparer.OrdinalIgnoreCase)
            ?? [];
    }

    public AuthTokenResult CreateToken(Guid userId, string username, string email)
    {
        if (string.IsNullOrWhiteSpace(username))
        {
            throw new ArgumentException("Username is required.", nameof(username));
        }

        if (string.IsNullOrWhiteSpace(email))
        {
            throw new ArgumentException("Email is required.", nameof(email));
        }

        var now = DateTimeOffset.UtcNow;
        var expiresAt = now.AddMinutes(jwtOptions.AccessTokenLifetimeMinutes);

        var claims = new List<Claim>
        {
            new Claim(JwtRegisteredClaimNames.Sub, userId.ToString()),
            new Claim(JwtRegisteredClaimNames.Email, email),
            new Claim("username", username),
            new Claim(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString())
        };

        if (cardCatalogAdminEmails.Contains(email))
        {
            claims.Add(new Claim(
                AuthorizationPolicies.CardCatalogAdminClaimType,
                AuthorizationPolicies.CardCatalogAdminClaimValue));
        }

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
