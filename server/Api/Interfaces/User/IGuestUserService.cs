using ErrorOr;

namespace ProjectHiddenVillage.Server.Api.Interfaces.User;

/// <summary>What a retention sweep collected. Reported so tests and logs can tell the two deletes apart.</summary>
public sealed record GuestUserSweepResult(int RemovedDecks, int RemovedGuests);

public interface IGuestUserService
{
    /// <summary>
    /// Creates a throwaway identity from a display name and returns the session the client plays with. No email
    /// or password is involved: the guest exists only to own a player id, and the token is minted here.
    /// </summary>
    Task<ErrorOr<LoginResponse>> CreateGuestSessionAsync(
        GuestUserRequest request,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Records that the guest is still around, so the retention sweeper measures idleness correctly. Cheap by
    /// design: it only writes when the recorded value is older than the throttle, and it ignores non-guests.
    /// </summary>
    Task TouchAsync(string playerId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Deletes guests idle for longer than the retention window, together with the transient decks they own.
    /// Returns what was removed; never throws for "nothing to do".
    /// </summary>
    Task<GuestUserSweepResult> SweepIdleGuestsAsync(CancellationToken cancellationToken = default);
}
