using System.IdentityModel.Tokens.Jwt;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using Microsoft.Extensions.Options;

namespace ProjectHiddenVillage.Server.Tests;

[TestClass]
public sealed class AuthTokenServiceTests
{
    [TestMethod]
    public void CreateToken_IncludesCardCatalogAdminClaim_WhenUserIsAdmin()
    {
        var service = CreateService();

        var result = service.CreateToken(
            userId: Guid.NewGuid(),
            username: "admin-user",
            email: "admin@example.com",
            isCardCatalogAdmin: true);

        var token = new JwtSecurityTokenHandler().ReadJwtToken(result.AccessToken);
        var adminClaim = token.Claims.FirstOrDefault(claim => claim.Type == AuthorizationPolicies.CardCatalogAdminClaimType);

        Assert.IsNotNull(adminClaim);
        Assert.AreEqual(AuthorizationPolicies.CardCatalogAdminClaimValue, adminClaim.Value);
    }

    [TestMethod]
    public void CreateToken_OmitsCardCatalogAdminClaim_WhenUserIsNotAdmin()
    {
        var service = CreateService();

        var result = service.CreateToken(
            userId: Guid.NewGuid(),
            username: "standard-user",
            email: "user@example.com",
            isCardCatalogAdmin: false);

        var token = new JwtSecurityTokenHandler().ReadJwtToken(result.AccessToken);
        var adminClaim = token.Claims.FirstOrDefault(claim => claim.Type == AuthorizationPolicies.CardCatalogAdminClaimType);

        Assert.IsNull(adminClaim);
    }

    private static AuthTokenService CreateService()
    {
        var jwtOptions = Options.Create(new JwtOptions
        {
            Issuer = "ProjectHiddenVillage.Server.Tests",
            Audience = "ProjectHiddenVillage.Client.Tests",
            Key = "this-is-a-test-key-with-sufficient-length-12345",
            AccessTokenLifetimeMinutes = 60,
        });

        return new AuthTokenService(jwtOptions);
    }
}
