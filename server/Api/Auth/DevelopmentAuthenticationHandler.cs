using System.Security.Claims;
using System.Text.Encodings.Web;
using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.Options;
using ProjectHiddenVillage.Server.Data.Seeding.Development;

namespace ProjectHiddenVillage.Server;

public sealed class DevelopmentAuthenticationHandler : AuthenticationHandler<AuthenticationSchemeOptions>
{
    public const string SchemeName = "DevelopmentBypass";
    private const string DevUserIdHeader = "X-Dev-User-Id";

    public DevelopmentAuthenticationHandler(
        IOptionsMonitor<AuthenticationSchemeOptions> options,
        ILoggerFactory logger,
        UrlEncoder encoder)
        : base(options, logger, encoder)
    {
    }

    protected override Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        var userId = ResolveDevelopmentUserId();

        var claims = new[]
        {
            new Claim(ClaimTypes.NameIdentifier, userId.ToString("D")),
            new Claim(ClaimTypes.Name, "Development User"),
            new Claim(AuthorizationPolicies.CardCatalogAdminClaimType, AuthorizationPolicies.CardCatalogAdminClaimValue),
        };

        var identity = new ClaimsIdentity(claims, SchemeName);
        var principal = new ClaimsPrincipal(identity);
        var ticket = new AuthenticationTicket(principal, SchemeName);

        return Task.FromResult(AuthenticateResult.Success(ticket));
    }

    private Guid ResolveDevelopmentUserId()
    {
        if (Request.Headers.TryGetValue(DevUserIdHeader, out var values) &&
            Guid.TryParse(values.FirstOrDefault(), out var userId))
        {
            return userId;
        }

        return DevelopmentUserSeeder.SeedUserOneId;
    }
}