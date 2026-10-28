using System.Globalization;

namespace ProjectHiddenVillage.Server.Api.Services.Games;

/// <summary>
/// Projects the action clock into the payload. The client is given an absolute deadline plus the server's own
/// reading of now, so it counts down locally but never has to trust its own clock: a machine whose clock is ten
/// minutes off still renders the right number of seconds.
/// </summary>
public static partial class GameStateResponseMapper
{
    private static GameClockResponse? ToGameClockResponse(GameInstance game)
    {
        ArgumentNullException.ThrowIfNull(game);

        var clock = game.Clock;
        if (clock is null)
        {
            return null;
        }

        // The clock's own time provider, not the ambient clock: the deadline in this payload was armed from it, so
        // the client's "server now" and its remaining seconds have to come from the same source.
        var now = clock.UtcNow;
        var remainingInStop = clock.RemainingInStop(now);

        return new GameClockResponse(
            IsEnabled: clock.IsEnabled,
            OwningPlayerId: clock.OwningPlayerId,
            StopKind: clock.StopKind.ToString(),
            DeadlineUtc: clock.DeadlineUtc?.ToUniversalTime().ToString("O", CultureInfo.InvariantCulture),
            ServerNowUtc: now.ToUniversalTime().ToString("O", CultureInfo.InvariantCulture),
            SecondsRemainingInStop: remainingInStop is { } remaining
                ? (int)Math.Ceiling(remaining.TotalSeconds)
                : null,
            Players: game.State.Players
                .Select(player => new GameClockPlayerResponse(
                    PlayerId: player.PlayerId,
                    SecondsRemainingInPool: (int)Math.Ceiling(clock.RemainingPool(player.PlayerId).TotalSeconds),
                    ConsecutiveTimeouts: clock.ConsecutiveTimeouts(player.PlayerId),
                    TimeoutsBeforeForfeit: clock.Policy.TimeoutsBeforeForfeit))
                .ToList());
    }
}
