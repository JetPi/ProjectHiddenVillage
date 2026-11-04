using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using ErrorOr;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using ProjectHiddenVillage.Server.Api.Interfaces.Auth;
using ProjectHiddenVillage.Server.Api.Interfaces.User;
using ProjectHiddenVillage.Server.Data.DTOs;

namespace ProjectHiddenVillage.Server.Tests;

/// <summary>
/// The two answers the admin route guard depends on: the login response must say whether the account is an
/// administrator, and `/api/user/me` must resolve the caller from the token rather than from anything the client
/// sends. Without the first the client cannot gate anything; without the second the gate would only be reading
/// localStorage, which the browser can rewrite.
/// </summary>
[TestClass]
public sealed class UserControllerCurrentUserTests
{
    private static readonly Guid AdminId = Guid.Parse("20000000-0000-0000-0000-000000000001");
    private static readonly Guid RegularId = Guid.Parse("20000000-0000-0000-0000-000000000002");

    private static readonly UserResponse AdminRecord = new(
        AdminId, "admin-user", "admin@hiddenvillage.local", true);

    private static readonly UserResponse RegularRecord = new(
        RegularId, "regular-user", "user@hiddenvillage.local", false);

    [TestMethod]
    public async Task Login_ReportsAdminCapability_ForAnAdministrator()
    {
        var controller = BuildController(new StubUserService(AdminRecord));

        var response = await controller.Login(new UserLoginDto("admin@hiddenvillage.local", "Admin1!"));

        var ok = response.Result as OkObjectResult;
        Assert.IsNotNull(ok);
        var payload = ok.Value as LoginResponse;
        Assert.IsNotNull(payload);
        Assert.IsTrue(payload.IsCardCatalogAdmin, "An admin must be able to learn that it is one, or no screen can gate on it.");
    }

    [TestMethod]
    public async Task Login_ReportsNoAdminCapability_ForARegularAccount()
    {
        var controller = BuildController(new StubUserService(RegularRecord));

        var response = await controller.Login(new UserLoginDto("user@hiddenvillage.local", "User1!"));

        var ok = response.Result as OkObjectResult;
        Assert.IsNotNull(ok);
        var payload = ok.Value as LoginResponse;
        Assert.IsNotNull(payload);
        Assert.IsFalse(payload.IsCardCatalogAdmin);
    }

    [TestMethod]
    public async Task GetCurrentUser_ResolvesTheCallerFromTheToken()
    {
        var controller = BuildController(
            new StubUserService(AdminRecord),
            principal: BuildPrincipal(AdminId));

        var response = await controller.GetCurrentUser();

        var ok = response.Result as OkObjectResult;
        Assert.IsNotNull(ok);
        var payload = ok.Value as UserResponse;
        Assert.IsNotNull(payload);
        Assert.AreEqual(AdminId, payload.Id);
        Assert.IsTrue(payload.IsCardCatalogAdmin);
    }

    [TestMethod]
    public async Task GetCurrentUser_ReadsTheSubjectClaim_WhenThereIsNoNameIdentifier()
    {
        // The JWT handler maps `sub` to NameIdentifier today, but a token minted with mapped claims disabled would
        // carry only `sub`. The endpoint has to answer either way rather than call the caller anonymous.
        var controller = BuildController(
            new StubUserService(RegularRecord),
            principal: BuildPrincipal(RegularId, useNameIdentifier: false));

        var response = await controller.GetCurrentUser();

        var ok = response.Result as OkObjectResult;
        Assert.IsNotNull(ok);
        var payload = ok.Value as UserResponse;
        Assert.IsNotNull(payload);
        Assert.AreEqual(RegularId, payload.Id);
        Assert.IsFalse(payload.IsCardCatalogAdmin);
    }

    [TestMethod]
    public async Task GetCurrentUser_ReturnsUnauthorized_WhenTheTokenNamesNobody()
    {
        var controller = BuildController(
            new StubUserService(AdminRecord),
            principal: new ClaimsPrincipal(new ClaimsIdentity()));

        var response = await controller.GetCurrentUser();

        Assert.IsInstanceOfType<UnauthorizedResult>(response.Result);
    }

    private static UserController BuildController(IUserService userService, ClaimsPrincipal? principal = null)
    {
        var controller = new UserController(userService, new StubGuestUserService(), CreateAuthTokenService());

        controller.ControllerContext = new ControllerContext
        {
            HttpContext = new DefaultHttpContext
            {
                User = principal ?? new ClaimsPrincipal(new ClaimsIdentity()),
            },
        };

        return controller;
    }

    private static ClaimsPrincipal BuildPrincipal(Guid userId, bool useNameIdentifier = true)
    {
        var claim = useNameIdentifier
            ? new Claim(ClaimTypes.NameIdentifier, userId.ToString())
            : new Claim(JwtRegisteredClaimNames.Sub, userId.ToString());

        return new ClaimsPrincipal(new ClaimsIdentity([claim], "Test"));
    }

    private static AuthTokenService CreateAuthTokenService()
    {
        return new AuthTokenService(Options.Create(new JwtOptions
        {
            Issuer = "ProjectHiddenVillage.Server.Tests",
            Audience = "ProjectHiddenVillage.Client.Tests",
            Key = "this-is-a-test-key-with-sufficient-length-12345",
            AccessTokenLifetimeMinutes = 60,
        }));
    }

    private sealed class StubUserService : IUserService
    {
        private readonly UserResponse record;

        public StubUserService(UserResponse record)
        {
            this.record = record;
        }

        public Task<ErrorOr<UserResponse>> CreateUser(UserDto userDto) => throw new NotSupportedException();

        public Task<ErrorOr<string>> VerifyLogin(UserLoginDto loginDto) =>
            Task.FromResult<ErrorOr<string>>(record.Id.ToString());

        public Task<ErrorOr<UserResponse>> GetUser(string userId) =>
            Task.FromResult<ErrorOr<UserResponse>>(record);

        public Task<ErrorOr<PagedResponse<UserResponse>>> GetUsers(int page = 1, int pageSize = 100) =>
            throw new NotSupportedException();
    }

    private sealed class StubGuestUserService : IGuestUserService
    {
        public Task<ErrorOr<LoginResponse>> CreateGuestSessionAsync(
            GuestUserRequest request,
            CancellationToken cancellationToken = default) => throw new NotSupportedException();

        public Task TouchAsync(string playerId, CancellationToken cancellationToken = default) =>
            Task.CompletedTask;

        public Task<GuestUserSweepResult> SweepIdleGuestsAsync(CancellationToken cancellationToken = default) =>
            Task.FromResult(new GuestUserSweepResult(0, 0));
    }
}
