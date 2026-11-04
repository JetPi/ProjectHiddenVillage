using System.Security.Claims;
using System.Text.Encodings.Web;
using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.Options;
using ProjectHiddenVillage.Server.Data.Seeding.Development;

namespace ProjectHiddenVillage.Server;

/// <summary>
/// Development-only stand-in for a bearer token: it authenticates the request as a seeded user so the local client
/// and the e2e suite do not have to log in before every call.
///
/// It gives every caller the <c>card_catalog_admin</c> claim, which is exactly why it must never answer for someone
/// who did not ask for it: this handler runs *after* the environment check in <c>Program.cs</c> (the scheme is only
/// registered in Development), but the environment is a string a deployment can get wrong. So it additionally
/// requires <c>PHV_ALLOW_DEVELOPMENT_BYPASS=true</c>. Without that opt-in an anonymous request gets the ordinary
/// challenge - a 401, the same answer production gives - instead of a silent admin session.
///
/// The claim it mints is still only a claim: <see cref="CardCatalogAdminAuthorizationHandler"/> re-checks the stored
/// row, so a bypass identity pointing at a non-admin account cannot write to the catalogue.
/// </summary>
public sealed class DevelopmentAuthenticationHandler : AuthenticationHandler<AuthenticationSchemeOptions>
{
    public const string SchemeName = "DevelopmentBypass";

    /// <summary>
    /// The opt-in. Development alone is not enough: the bypass has to be asked for by name, in the environment that
    /// asks for it, so a compose file that loses its <c>ASPNETCORE_ENVIRONMENT</c> pin fails closed.
    /// </summary>
    public const string AllowBypassEnvironmentVariable = "PHV_ALLOW_DEVELOPMENT_BYPASS";

    private const string DevUserIdHeader = "X-Dev-User-Id";

    private readonly IConfiguration configuration;
    private readonly IHostEnvironment environment;

    public DevelopmentAuthenticationHandler(
        IOptionsMonitor<AuthenticationSchemeOptions> options,
        ILoggerFactory logger,
        UrlEncoder encoder,
        IConfiguration configuration,
        IHostEnvironment environment)
        : base(options, logger, encoder)
    {
        this.configuration = configuration;
        this.environment = environment;
    }

    protected override Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        if (!IsBypassAllowed())
        {
            // NoResult rather than Fail: the caller is anonymous, not broken. The JWT challenge then produces the
            // same 401 body a tokenless production request gets.
            return Task.FromResult(AuthenticateResult.NoResult());
        }

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

    private bool IsBypassAllowed()
    {
        if (!environment.IsDevelopment())
        {
            return false;
        }

        var configured = configuration[AllowBypassEnvironmentVariable];

        return bool.TryParse(configured, out var enabled) && enabled
            || string.Equals(configured, "1", StringComparison.Ordinal);
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
