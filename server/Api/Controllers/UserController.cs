using Microsoft.AspNetCore.Mvc;
using ProjectHiddenVillage.Server.Data.DTOs;

namespace ProjectHiddenVillage.Server;

[ApiController]
[Route("api/[controller]")]
public sealed class UserController : ApiControllerBase
{
	private readonly UserService userService;
	private readonly AuthTokenService authTokenService;

	public UserController(UserService userService, AuthTokenService authTokenService)
	{
		this.userService = userService;
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
			userResult.Value.Email);

		return Ok(new LoginResponse(
			Id: userResult.Value.Id,
			Username: userResult.Value.Username,
			Email: userResult.Value.Email,
			AccessToken: tokenResult.AccessToken,
			ExpiresAt: tokenResult.ExpiresAt));
	}

	[HttpGet("{userId}")]
	[ProducesResponseType(typeof(UserResponse), StatusCodes.Status200OK)]
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

	[HttpGet]
	[ProducesResponseType(typeof(PagedResponse<UserResponse>), StatusCodes.Status200OK)]
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