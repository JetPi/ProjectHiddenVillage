namespace ProjectHiddenVillage.Server.Data.DTOs;

public sealed record UserDto(
	string Username,
	string Email,
	string Password);

public sealed record UserLoginDto(
	string Email,
	string Password);

/// <summary>
/// Asks for a recovery link. Only the address is sent: the flow must not need - or learn - anything else about the
/// account it is asked to recover.
/// </summary>
public sealed record PasswordResetRequestDto(
	string Email);

/// <summary>
/// Spends a recovery link. The new password replaces the stored hash and is subject to the same policy as sign-up.
/// </summary>
public sealed record PasswordResetConfirmDto(
	string Token,
	string NewPassword);
