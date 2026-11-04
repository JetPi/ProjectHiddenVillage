using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ProjectHiddenVillage.Server.Api.Interfaces.Auth;
using ProjectHiddenVillage.Server.Api.Interfaces.User;
using ProjectHiddenVillage.Server.Data.DTOs;

namespace ProjectHiddenVillage.Server;

[ApiController]
[Route("api/[controller]")]
public sealed class UserController : ApiControllerBase
{
	private readonly IUserService userService;
	private readonly IGuestUserService guestUserService;
	private readonly IAuthTokenService authTokenService;

	public UserController(
		IUserService userService,
		IGuestUserService guestUserService,
		IAuthTokenService authTokenService)
	{
		this.userService = userService;
		this.guestUserService = guestUserService;
		this.authTokenService = authTokenService;
	}

	[HttpPost]
	[ProducesResponseType(typeof(UserResponse), StatusCodes.Status201Created)]
	[ProducesResponseType(typeof(string), StatusCodes.Status400BadRequest)]
	[ProducesResponseType(typeof(string), StatusCodes.Status409Conflict)]
	public async Task<ActionResult<UserResponse>> CreateUser([FromBody] UserDto userDto)
	{
		var result = await userService.CreateUser(userDto);
		if (result.IsError)
		{
			return ProblemFromErrors<UserResponse>(result.Errors);
		}

		return Created($"/api/user/{result.Value.Id}", result.Value);
	}

	/// <summary>
	/// Starts a guest session from a display name. This is what keeps every game mode playable without an
	/// account: the guest gets a real player id and token, but owns nothing durable.
	/// </summary>
	[HttpPost("guest")]
	[ProducesResponseType(typeof(LoginResponse), StatusCodes.Status200OK)]
	[ProducesResponseType(typeof(string), StatusCodes.Status400BadRequest)]
	public async Task<ActionResult<LoginResponse>> CreateGuestSession([FromBody] GuestUserRequest request)
	{
		var result = await guestUserService.CreateGuestSessionAsync(request);
		if (result.IsError)
		{
			return ProblemFromErrors<LoginResponse>(result.Errors);
		}

		return Ok(result.Value);
	}

	[HttpPost("login")]
	[ProducesResponseType(typeof(LoginResponse), StatusCodes.Status200OK)]
	[ProducesResponseType(typeof(string), StatusCodes.Status400BadRequest)]
	[ProducesResponseType(typeof(string), StatusCodes.Status401Unauthorized)]
	[ProducesResponseType(typeof(string), StatusCodes.Status404NotFound)]
	public async Task<ActionResult<LoginResponse>> Login([FromBody] UserLoginDto loginDto)
	{
		var loginResult = await userService.VerifyLogin(loginDto);
		if (loginResult.IsError)
		{
			return ProblemFromErrors<LoginResponse>(loginResult.Errors);
		}

		var userResult = await userService.GetUser(loginResult.Value);
		if (userResult.IsError)
		{
			return ProblemFromErrors<LoginResponse>(userResult.Errors);
		}

		var tokenResult = authTokenService.CreateToken(
			userResult.Value.Id,
			userResult.Value.Username,
			userResult.Value.Email,
			userResult.Value.IsCardCatalogAdmin);

		return Ok(new LoginResponse(
			Id: userResult.Value.Id,
			Username: userResult.Value.Username,
			Email: userResult.Value.Email,
			AccessToken: tokenResult.AccessToken,
			ExpiresAt: tokenResult.ExpiresAt,
			IsCardCatalogAdmin: userResult.Value.IsCardCatalogAdmin));
	}

	/// <summary>
	/// The caller's own record, resolved from the token instead of a route value. The client's admin route guard
	/// asks this question here so the answer comes from the server: a flag written into localStorage cannot make
	/// someone an admin, and a revoked or expired token answers 401 no matter what the browser believes.
	/// </summary>
	[Authorize]
	[HttpGet("me")]
	[ProducesResponseType(typeof(UserResponse), StatusCodes.Status200OK)]
	[ProducesResponseType(StatusCodes.Status401Unauthorized)]
	[ProducesResponseType(StatusCodes.Status404NotFound)]
	public async Task<ActionResult<UserResponse>> GetCurrentUser()
	{
		var rawUserId = User.FindFirstValue(ClaimTypes.NameIdentifier)
			?? User.FindFirstValue(JwtRegisteredClaimNames.Sub);

		if (!Guid.TryParse(rawUserId, out var userId))
		{
			return Unauthorized();
		}

		var result = await userService.GetUser(userId.ToString());
		if (result.IsError)
		{
			return ProblemFromErrors<UserResponse>(result.Errors);
		}

		return Ok(result.Value);
	}

	/// <summary>
	/// Another account's record. Authenticated only: the response carries the account's email and whether it is an
	/// administrator, which is exactly the pair an anonymous visitor would need to enumerate the admin accounts -
	/// and hiding the admin screens behind a guard while publishing that list would be pointless.
	/// </summary>
	[Authorize]
	[HttpGet("{userId}")]
	[ProducesResponseType(typeof(UserResponse), StatusCodes.Status200OK)]
	[ProducesResponseType(StatusCodes.Status401Unauthorized)]
	[ProducesResponseType(typeof(string), StatusCodes.Status400BadRequest)]
	[ProducesResponseType(typeof(string), StatusCodes.Status404NotFound)]
	public async Task<ActionResult<UserResponse>> GetUser(string userId)
	{
		var result = await userService.GetUser(userId);
		if (result.IsError)
		{
			return ProblemFromErrors<UserResponse>(result.Errors);
		}

		return Ok(result.Value);
	}

	/// <summary>
	/// The account list, with the same reasoning as <see cref="GetUser"/>: it names every administrator.
	/// </summary>
	[Authorize]
	[HttpGet]
	[ProducesResponseType(typeof(PagedResponse<UserResponse>), StatusCodes.Status200OK)]
	[ProducesResponseType(StatusCodes.Status401Unauthorized)]
	[ProducesResponseType(typeof(string), StatusCodes.Status400BadRequest)]
	public async Task<ActionResult<PagedResponse<UserResponse>>> GetUsers([FromQuery] int page = 1, [FromQuery] int pageSize = 100)
	{
		var result = await userService.GetUsers(page, pageSize);
		if (result.IsError)
		{
			return ProblemFromErrors<PagedResponse<UserResponse>>(result.Errors);
		}

		return Ok(result.Value);
	}
}