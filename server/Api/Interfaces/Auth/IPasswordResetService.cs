using ErrorOr;
using ProjectHiddenVillage.Server.Data.DTOs;

namespace ProjectHiddenVillage.Server.Api.Interfaces.Auth;

public interface IPasswordResetService
{
    /// <summary>
    /// Issues a recovery link when the address belongs to a registered account. The caller answers the same way
    /// whether a link was sent, suppressed by the cooldown, or skipped because the address is unknown or a guest:
    /// the response must never reveal which addresses exist.
    /// </summary>
    Task<ErrorOr<Success>> RequestAsync(
        PasswordResetRequestDto request,
        string? requestedFromIp,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Spends a link and replaces the password, bumping <c>AuthVersion</c> so every session minted before the reset
    /// stops authenticating. Returns the account id; minting the new session is the caller's job.
    /// </summary>
    Task<ErrorOr<Guid>> ConfirmAsync(
        PasswordResetConfirmDto request,
        CancellationToken cancellationToken = default);
}
