using ProjectHiddenVillage.Server.Api.Interfaces.Game;

namespace ProjectHiddenVillage.Server.Api.Services.Games;

/// <summary>
/// In-memory presence bookkeeping: one process, like the <c>InMemoryGameInstanceRegistry</c> it serves.
///
/// Ids are normalized on the way in because the three producers disagree on formatting: the hub derives a
/// player id as a dash-free GUID ("N" format), the game state stores the same form, while the client's auth
/// session carries the dashed form and game ids are upper-cased when they are mapped. Normalizing here keeps
/// every comparison in the tracker a plain dictionary lookup.
/// </summary>
public sealed class GamePresenceTracker : IGamePresenceTracker
{
    private readonly object syncRoot = new();

    /// <summary>Which games (and as which player) every live connection is watching.</summary>
    private readonly Dictionary<string, HashSet<ConnectionAddress>> addressesByConnectionId =
        new(StringComparer.Ordinal);

    public void RegisterConnection(string gameId, string playerId, string connectionId)
    {
        var normalizedGameId = NormalizeGameId(gameId);
        var normalizedPlayerId = NormalizePlayerId(playerId);
        var normalizedConnectionId = NormalizeConnectionId(connectionId);

        if (normalizedGameId.Length == 0
            || normalizedPlayerId.Length == 0
            || normalizedConnectionId.Length == 0)
        {
            return;
        }

        lock (syncRoot)
        {
            if (!addressesByConnectionId.TryGetValue(normalizedConnectionId, out var addresses))
            {
                addresses = [];
                addressesByConnectionId[normalizedConnectionId] = addresses;
            }

            addresses.Add(new ConnectionAddress(normalizedGameId, normalizedPlayerId));
        }
    }

    public IReadOnlyList<GamePresenceAddress> RemoveConnection(string connectionId)
    {
        var normalizedConnectionId = NormalizeConnectionId(connectionId);
        if (normalizedConnectionId.Length == 0)
        {
            return [];
        }

        lock (syncRoot)
        {
            if (!addressesByConnectionId.Remove(normalizedConnectionId, out var addresses))
            {
                return [];
            }

            return addresses
                .Select(address => new GamePresenceAddress(address.GameId, address.PlayerId))
                .OrderBy(address => address.GameId, StringComparer.Ordinal)
                .ThenBy(address => address.PlayerId, StringComparer.Ordinal)
                .ToList();
        }
    }

    public IReadOnlyList<string> GetConnectedPlayerIds(string gameId)
    {
        var normalizedGameId = NormalizeGameId(gameId);
        if (normalizedGameId.Length == 0)
        {
            return [];
        }

        lock (syncRoot)
        {
            return addressesByConnectionId.Values
                .SelectMany(addresses => addresses)
                .Where(address => string.Equals(address.GameId, normalizedGameId, StringComparison.Ordinal))
                .Select(address => address.PlayerId)
                .Distinct(StringComparer.Ordinal)
                .OrderBy(playerId => playerId, StringComparer.Ordinal)
                .ToList();
        }
    }

    public bool IsPlayerConnected(string gameId, string playerId)
    {
        var normalizedGameId = NormalizeGameId(gameId);
        var normalizedPlayerId = NormalizePlayerId(playerId);

        if (normalizedGameId.Length == 0 || normalizedPlayerId.Length == 0)
        {
            return false;
        }

        lock (syncRoot)
        {
            return addressesByConnectionId.Values.Any(addresses => addresses.Contains(
                new ConnectionAddress(normalizedGameId, normalizedPlayerId)));
        }
    }

    /// <summary>Game keys follow the hub's own game-id normalization (trim + upper case).</summary>
    private static string NormalizeGameId(string gameId)
    {
        return gameId.Trim().ToUpperInvariant();
    }

    /// <summary>
    /// Player ids are canonicalized to the engine's dash-free lower-case form, which is what the hub derives
    /// from the auth claim (<c>Guid.ToString("N")</c>) and what the game state stores: a client's auth session
    /// carries the dashed form while the board's player ids do not, and a presentation's required ack set has
    /// to be comparable with both.
    /// </summary>
    private static string NormalizePlayerId(string playerId)
    {
        return playerId.Trim().ToLowerInvariant().Replace("-", string.Empty);
    }

    private static string NormalizeConnectionId(string connectionId)
    {
        // Connection ids are opaque SignalR strings: case and dashes are significant, so only trim them.
        return connectionId.Trim();
    }

    private readonly record struct ConnectionAddress(string GameId, string PlayerId);
}
