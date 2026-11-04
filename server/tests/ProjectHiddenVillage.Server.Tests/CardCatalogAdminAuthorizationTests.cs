using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text.Encodings.Web;
using ErrorOr;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using ProjectHiddenVillage.Server.Api.Interfaces.Auth;
using ProjectHiddenVillage.Server.Api.Interfaces.Deck;
using ProjectHiddenVillage.Server.Data;
using ProjectHiddenVillage.Server.Data.DTOs;
using ProjectHiddenVillage.Server.Data.Entities;
using ProjectHiddenVillage.Server.Data.Seeding.Development;

namespace ProjectHiddenVillage.Server.Tests;

/// <summary>
/// The policy used to trust the <c>card_catalog_admin</c> claim for as long as the token lived, which - with a
/// thirty-day lifetime - kept a demoted administrator writing to the catalogue. These tests pin the second check:
/// the requirement is satisfied only when the stored account still says so, and every other shape of principal is
/// refused without letting the request through.
/// </summary>
[TestClass]
public sealed class CardCatalogAdminAuthorizationTests
{
    private static readonly Guid AdminId = Guid.Parse("21000000-0000-0000-0000-000000000001");
    private static readonly Guid DemotedId = Guid.Parse("21000000-0000-0000-0000-000000000002");
    private static readonly Guid GuestId = Guid.Parse("21000000-0000-0000-0000-000000000003");
    private static readonly Guid MissingId = Guid.Parse("21000000-0000-0000-0000-000000000004");

    [TestMethod]
    public async Task Handler_Succeeds_ForAStoredAdministrator()
    {
        await using var dbContext = CreateDbContext();
        await SeedUserAsync(dbContext, AdminId, isAdmin: true);

        var context = await EvaluateAsync(dbContext, BuildPrincipal(AdminId));

        Assert.IsTrue(context.HasSucceeded, "A stored administrator must keep working without signing in again.");
    }

    [TestMethod]
    public async Task Handler_Fails_WhenTheAccountWasDemotedAfterTheTokenWasMinted()
    {
        await using var dbContext = CreateDbContext();
        await SeedUserAsync(dbContext, DemotedId, isAdmin: false);

        var context = await EvaluateAsync(dbContext, BuildPrincipal(DemotedId));

        Assert.IsFalse(
            context.HasSucceeded,
            "The token still carries the claim, but the account is no longer an administrator.");
    }

    [TestMethod]
    public async Task Handler_Fails_WhenTheAccountNoLongerExists()
    {
        await using var dbContext = CreateDbContext();
        await SeedUserAsync(dbContext, AdminId, isAdmin: true);

        var context = await EvaluateAsync(dbContext, BuildPrincipal(MissingId));

        Assert.IsFalse(context.HasSucceeded, "A token for a deleted account must not outlive the row.");
    }

    [TestMethod]
    public async Task Handler_Fails_ForAGuestRowThatSomehowCarriesTheFlag()
    {
        await using var dbContext = CreateDbContext();
        dbContext.Users.Add(new User
        {
            Id = GuestId,
            Username = "guest-user",
            Email = "guest@guests.invalid",
            IsGuest = true,
            IsCardCatalogAdmin = true,
        });
        await dbContext.SaveChangesAsync();

        var context = await EvaluateAsync(dbContext, BuildPrincipal(GuestId));

        Assert.IsFalse(context.HasSucceeded, "A guest identity can never be an administrator.");
    }

    [TestMethod]
    public async Task Handler_Fails_WithoutTheAdminClaim_AndNeverReadsTheDatabase()
    {
        await using var dbContext = CreateDbContext();

        var context = await EvaluateAsync(
            dbContext,
            BuildPrincipal(AdminId, withAdminClaim: false),
            new ThrowingCapabilityResolver());

        Assert.IsFalse(context.HasSucceeded, "An ordinary player's token is refused before the database is asked.");
    }

    [TestMethod]
    public async Task Handler_Fails_WhenThePrincipalNamesNoUser()
    {
        await using var dbContext = CreateDbContext();

        var context = await EvaluateAsync(
            dbContext,
            BuildPrincipal(userId: null),
            new ThrowingCapabilityResolver());

        Assert.IsFalse(context.HasSucceeded, "A claim with no subject cannot identify an account to check.");
    }

    [TestMethod]
    public async Task Handler_ReadsTheSubjectClaim_WhenThereIsNoNameIdentifier()
    {
        await using var dbContext = CreateDbContext();
        await SeedUserAsync(dbContext, AdminId, isAdmin: true);

        var context = await EvaluateAsync(dbContext, BuildPrincipal(AdminId, useNameIdentifier: false));

        Assert.IsTrue(context.HasSucceeded, "A token minted with mapped claims disabled carries only `sub`.");
    }

    [TestMethod]
    public async Task Resolver_ReturnsFalse_ForAnUnknownAccount()
    {
        await using var dbContext = CreateDbContext();
        var resolver = new ActorCapabilityResolver(dbContext);

        Assert.IsFalse(await resolver.IsCardCatalogAdminAsync(MissingId));
        Assert.IsFalse(await resolver.IsCardCatalogAdminAsync(Guid.Empty));
    }

    [TestMethod]
    public async Task DeleteDeck_PassesAdminTrue_ForAStoredAdministrator()
    {
        await using var dbContext = CreateDbContext();
        await SeedUserAsync(dbContext, AdminId, isAdmin: true);

        var deckService = new RecordingDeckService();
        var controller = BuildDeckController(deckService, dbContext, BuildPrincipal(AdminId));

        await controller.DeleteDeck("deck-1");

        Assert.IsTrue(deckService.LastIsAdmin);
    }

    [TestMethod]
    public async Task DeleteDeck_PassesAdminFalse_WhenTheAdministratorWasDemoted()
    {
        // The deck endpoints are plain [Authorize]: the policy's database check never runs for them, so the
        // controller has to ask the resolver itself or a demoted admin keeps the catalogue-wide delete.
        await using var dbContext = CreateDbContext();
        await SeedUserAsync(dbContext, DemotedId, isAdmin: false);

        var deckService = new RecordingDeckService();
        var controller = BuildDeckController(deckService, dbContext, BuildPrincipal(DemotedId));

        await controller.DeleteDeck("deck-1");

        Assert.IsFalse(deckService.LastIsAdmin);
    }

    [TestMethod]
    public async Task DevelopmentBypass_DoesNotAuthenticate_WithoutTheOptIn()
    {
        var result = await AuthenticateWithBypassAsync(allowBypass: false);

        Assert.IsTrue(result.None, "Development alone must not hand out a principal any more.");
    }

    [TestMethod]
    public async Task DevelopmentBypass_Authenticates_WhenTheOptInIsSet()
    {
        var result = await AuthenticateWithBypassAsync(allowBypass: true);

        Assert.IsTrue(result.Succeeded);
        Assert.IsNotNull(result.Principal);
        Assert.AreEqual(
            DevelopmentUserSeeder.SeedUserOneId.ToString("D"),
            result.Principal!.FindFirstValue(ClaimTypes.NameIdentifier));
    }

    /// <summary>
    /// Runs the requirement the way the authorization pipeline does: the handler is asked, and success is what the
    /// pipeline would act on.
    /// </summary>
    private static async Task<AuthorizationHandlerContext> EvaluateAsync(
        ApplicationDbContext dbContext,
        ClaimsPrincipal principal,
        IActorCapabilityResolver? resolver = null)
    {
        var handler = new CardCatalogAdminAuthorizationHandler(
            resolver ?? new ActorCapabilityResolver(dbContext),
            NullLogger<CardCatalogAdminAuthorizationHandler>.Instance);

        var context = new AuthorizationHandlerContext(
            [new CardCatalogAdminRequirement()],
            principal,
            resource: null);

        await handler.HandleAsync(context);

        return context;
    }

    private static ClaimsPrincipal BuildPrincipal(
        Guid? userId,
        bool useNameIdentifier = true,
        bool withAdminClaim = true)
    {
        var claims = new List<Claim>();

        if (userId is { } id)
        {
            claims.Add(useNameIdentifier
                ? new Claim(ClaimTypes.NameIdentifier, id.ToString())
                : new Claim(JwtRegisteredClaimNames.Sub, id.ToString()));
        }

        if (withAdminClaim)
        {
            claims.Add(new Claim(
                AuthorizationPolicies.CardCatalogAdminClaimType,
                AuthorizationPolicies.CardCatalogAdminClaimValue));
        }

        return new ClaimsPrincipal(new ClaimsIdentity(claims, "Test"));
    }

    private static DeckController BuildDeckController(
        RecordingDeckService deckService,
        ApplicationDbContext dbContext,
        ClaimsPrincipal principal)
    {
        var controller = new DeckController(deckService, new ActorCapabilityResolver(dbContext));

        controller.ControllerContext = new ControllerContext
        {
            HttpContext = new DefaultHttpContext { User = principal },
        };

        return controller;
    }

    private static async Task<AuthenticateResult> AuthenticateWithBypassAsync(bool allowBypass)
    {
        var settings = new Dictionary<string, string?>();
        if (allowBypass)
        {
            settings[DevelopmentAuthenticationHandler.AllowBypassEnvironmentVariable] = "true";
        }

        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(settings)
            .Build();

        var handler = new DevelopmentAuthenticationHandler(
            new TestOptionsMonitor<AuthenticationSchemeOptions>(new AuthenticationSchemeOptions()),
            NullLoggerFactory.Instance,
            UrlEncoder.Default,
            configuration,
            new TestHostEnvironment("Development"));

        var scheme = new AuthenticationScheme(
            DevelopmentAuthenticationHandler.SchemeName,
            displayName: null,
            handlerType: typeof(DevelopmentAuthenticationHandler));

        var httpContext = new DefaultHttpContext();
        httpContext.Request.Scheme = "http";
        httpContext.Request.Host = new HostString("localhost");

        var pipelineHandler = (IAuthenticationHandler)handler;
        await pipelineHandler.InitializeAsync(scheme, httpContext);

        return await pipelineHandler.AuthenticateAsync();
    }

    private static async Task SeedUserAsync(ApplicationDbContext dbContext, Guid userId, bool isAdmin)
    {
        dbContext.Users.Add(new User
        {
            Id = userId,
            Username = $"user-{userId:N}",
            Email = $"{userId:N}@hiddenvillage.local",
            IsCardCatalogAdmin = isAdmin,
        });

        await dbContext.SaveChangesAsync();
    }

    private static ApplicationDbContext CreateDbContext()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(databaseName: $"catalog-admin-authorization-tests-{Guid.NewGuid()}")
            .Options;

        return new ApplicationDbContext(options);
    }

    /// <summary>Fails the test if the handler reaches for the database on a principal it should have refused first.</summary>
    private sealed class ThrowingCapabilityResolver : IActorCapabilityResolver
    {
        public Task<bool> IsCardCatalogAdminAsync(Guid userId, CancellationToken cancellationToken = default)
        {
            throw new AssertFailedException("The database must not be consulted for this principal.");
        }
    }

    /// <summary>Records the admin flag the controller hands the service, which is the value the owner-or-admin branch uses.</summary>
    private sealed class RecordingDeckService : IDeckService
    {
        public bool LastIsAdmin { get; private set; }

        public Task<ErrorOr<string>> CreateDeck(CreateDeckRequest request) => throw new NotSupportedException();

        public Task<ErrorOr<string>> CreateFixtureDeckAsync(CreateDeckRequest request) => throw new NotSupportedException();

        public Task<ErrorOr<DeckResponse>> CreatePublicDeckAsync(CreatePublicDeckRequest request) =>
            throw new NotSupportedException();

        public Task<ErrorOr<DeckResponse>> UpdateDeckAsync(
            string deckId,
            UpdateDeckRequest request,
            Guid? requestingUserId = null,
            bool isAdmin = false)
        {
            LastIsAdmin = isAdmin;
            throw new NotSupportedException();
        }

        public Task<ErrorOr<bool>> DeleteDeck(string deckId, Guid? requestingUserId = null, bool isAdmin = false)
        {
            LastIsAdmin = isAdmin;
            return Task.FromResult<ErrorOr<bool>>(true);
        }

        public Task<ErrorOr<DeckResponse>> GetDeck(string deckId, bool populate = false, Guid? viewerUserId = null) =>
            throw new NotSupportedException();

        public Task<ErrorOr<List<DeckResponse>>> GetDecks(
            Guid? userId = null,
            bool populate = false,
            DeckType? type = null,
            Guid? viewerUserId = null) =>
            throw new NotSupportedException();
    }

    private sealed class TestOptionsMonitor<TOptions>(TOptions value) : IOptionsMonitor<TOptions>
        where TOptions : class
    {
        public TOptions CurrentValue => value;

        public TOptions Get(string? name) => value;

        public IDisposable? OnChange(Action<TOptions, string?> listener) => null;
    }

    private sealed class TestHostEnvironment(string environmentName) : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = environmentName;

        public string ApplicationName { get; set; } = "ProjectHiddenVillage.Server.Tests";

        public string ContentRootPath { get; set; } = AppContext.BaseDirectory;

        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }
}
