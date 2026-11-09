using System.IdentityModel.Tokens.Jwt;
using ErrorOr;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using ProjectHiddenVillage.Server.Api.Interfaces.Auth;
using ProjectHiddenVillage.Server.Api.Interfaces.User;
using ProjectHiddenVillage.Server.Api.Services.Auth;
using ProjectHiddenVillage.Server.Data.DTOs;

namespace ProjectHiddenVillage.Server.Tests;

/// <summary>
/// The controller is the only place the two answers that must never differ are produced: a request is 202 whether
/// or not the address exists, and a confirm is either a session or one generic rejection.
/// </summary>
[TestClass]
public sealed class UserControllerPasswordResetTests
{
    private static readonly Guid PlayerId = Guid.Parse("30000000-0000-0000-0000-000000000001");

    private static readonly UserResponse PlayerRecord = new(
        PlayerId, "player", "player@example.com", false, AuthVersion: 5);

    [TestMethod]
    public async Task Request_ReturnsAccepted()
    {
        var controller = BuildController(new StubPasswordResetService());

        var response = await controller.RequestPasswordReset(new PasswordResetRequestDto("player@example.com"));

        Assert.IsInstanceOfType<AcceptedResult>(response);
    }

    [TestMethod]
    public async Task Request_ReturnsNotFound_WhenRecoveryIsDisabled()
    {
        var stub = new StubPasswordResetService
        {
            RequestResult = Error.NotFound(
                PasswordResetService.DisabledCode,
                "Password recovery is not available."),
        };
        var controller = BuildController(stub);

        var response = await controller.RequestPasswordReset(new PasswordResetRequestDto("player@example.com"));

        Assert.IsInstanceOfType<NotFoundObjectResult>(response);
    }

    [TestMethod]
    public async Task Confirm_ReturnsASessionCarryingTheCurrentPasswordGeneration()
    {
        var controller = BuildController(new StubPasswordResetService { ConfirmResult = PlayerId });

        var response = await controller.ConfirmPasswordReset(
            new PasswordResetConfirmDto("token", "ReplacementPass2!"));

        var ok = response.Result as OkObjectResult;
        Assert.IsNotNull(ok);
        var payload = ok.Value as LoginResponse;
        Assert.IsNotNull(payload);
        Assert.AreEqual(PlayerId, payload.Id);
        Assert.IsFalse(string.IsNullOrWhiteSpace(payload.AccessToken));

        var token = new JwtSecurityTokenHandler().ReadJwtToken(payload.AccessToken);
        var versionClaim = token.Claims.Single(claim => claim.Type == AuthorizationPolicies.AuthVersionClaimType);
        Assert.AreEqual("5", versionClaim.Value);

        Assert.AreEqual("no-store", controller.Response.Headers.CacheControl.ToString());
    }

    [TestMethod]
    public async Task Confirm_ReturnsBadRequest_ForAnUnusableLink()
    {
        var stub = new StubPasswordResetService
        {
            ConfirmResult = Error.Validation(
                PasswordResetService.InvalidTokenCode,
                "This password reset link is invalid or has expired. Request a new one."),
        };
        var controller = BuildController(stub);

        var response = await controller.ConfirmPasswordReset(
            new PasswordResetConfirmDto("expired", "ReplacementPass2!"));

        Assert.IsInstanceOfType<BadRequestObjectResult>(response.Result);
    }

    private static UserController BuildController(IPasswordResetService passwordResetService)
    {
        var controller = new UserController(
            new StubUserService(),
            new StubGuestUserService(),
            CreateAuthTokenService(),
            passwordResetService);

        controller.ControllerContext = new ControllerContext
        {
            HttpContext = new DefaultHttpContext(),
        };

        return controller;
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
        public Task<ErrorOr<UserResponse>> CreateUser(UserDto userDto) => throw new NotSupportedException();

        public Task<ErrorOr<string>> VerifyLogin(UserLoginDto loginDto) => throw new NotSupportedException();

        public Task<ErrorOr<UserResponse>> GetUser(string userId) =>
            Task.FromResult<ErrorOr<UserResponse>>(PlayerRecord);

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

    private sealed class StubPasswordResetService : IPasswordResetService
    {
        public ErrorOr<Success> RequestResult { get; init; } = Result.Success;

        public ErrorOr<Guid> ConfirmResult { get; init; } = Guid.Empty;

        public Task<ErrorOr<Success>> RequestAsync(
            PasswordResetRequestDto request,
            string? requestedFromIp,
            CancellationToken cancellationToken = default) =>
            Task.FromResult(RequestResult);

        public Task<ErrorOr<Guid>> ConfirmAsync(
            PasswordResetConfirmDto request,
            CancellationToken cancellationToken = default) =>
            Task.FromResult(ConfirmResult);
    }
}
