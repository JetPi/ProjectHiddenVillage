using Microsoft.AspNetCore.SignalR;
using ProjectHiddenVillage.Server.Api.Hubs;
using ProjectHiddenVillage.Server.Api.Interfaces.Game;

namespace ProjectHiddenVillage.Server.Api.Services.Games;

/// <summary>
/// The transport side of <see cref="IGameStateBroadcaster"/>: the same "the authoritative state changed"
/// notification the hub sends for its own mutations, for the changes nobody called in for - the phase
/// automation's presentation-acknowledgement timeout.
///
/// The hub keeps sending its own notification inline (its callers already have the group membership work
/// done); this path exists so the engine never has to know about SignalR.
/// </summary>
public sealed class GamesHubStateBroadcaster(IHubContext<GamesHub> hubContext) : IGameStateBroadcaster
{
    /// <summary>The event the clients listen for; they pull the state when they see it.</summary>
    public const string StateInvalidatedEventName = "GameStateInvalidated";

    private readonly IHubContext<GamesHub> hubContext = hubContext;

    public Task NotifyGameStateInvalidatedAsync(string gameId)
    {
        var normalizedGameId = gameId.Trim().ToUpperInvariant();
        return hubContext.Clients.Group(normalizedGameId).SendAsync(StateInvalidatedEventName, normalizedGameId);
    }
}
