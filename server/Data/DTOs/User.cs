namespace ProjectHiddenVillage.Server.Data.DTOs;

public sealed record UserDto(
	string Username,
	string Email,
	string Password);

public sealed record UserLoginDto(
	string Email,
	string Password);
