using ProjectHiddenVillage.Server.Api.Interfaces.Game;

namespace ProjectHiddenVillage.Server.Api.Services.Games;

/// <summary>
/// In-memory presence bookkeeping: one process, like the <c>InMemoryGameInstanceRegistry</c> it serves.
///
/// Ids are normalized on the way in because the three producers disagree on formatting: the hub derives a
/// player id as a dash-free GUID ("N" format), the game state stores the same form, while the client's auth
/// session carries the dashed form and game ids are upper-cased when they are mapped. Normalizing here keeps
/// every comparison in the tracker a plain dictionary lookup.
///
/// Besides who is watching right now, the tracker remembers the instant a player's last connection went away.
/// That record is what lets a handshake tolerate a refresh - see <see cref="GetPresenceDeadline"/> and
/// <c>plans/rematch-opponent-presence.md</c>.
/// </summary>
public sealed class GamePresenceTracker : IGamePresenceTracker
{
    /// <summary>
    /// How long a departure is remembered. The record only exists to describe a player who is not watching, and a
    /// departure nobody has come back to stops mattering long before this; pruning keeps the tracker bounded by the
    /// players who are actually away.
    /// </summary>
    private static readonly TimeSpan LastSeenRetention = TimeSpan.FromMinutes(60);

    private readonly object syncRoot = new();
    private readonly TimeProvider timeProvider;

    /// <summary>Which games (and as which player) every live connection is watching.</summary>
    private readonly Dictionary<string, HashSet<ConnectionAddress>> addressesByConnectionId =
        new(StringComparer.Ordinal);

    /// <summary>When a player's last connection for a game went away, for every player who is not watching it now.</summary>
    private readonly Dictionary<string, Dictionary<string, DateTimeOffset>> lastSeenByGameId =
        new(StringComparer.Ordinal);

    public GamePresenceTracker(TimeProvider? timeProvider = null)
    {
        this.timeProvider = timeProvider ?? TimeProvider.System;
    }

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

            // Watching again is proof the player is still there: a departure record would only describe the moment
            // before this connection arrived.
            ForgetDepartureLocked(normalizedGameId, normalizedPlayerId);
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

            var now = timeProvider.GetUtcNow();

            foreach (var address in addresses)
            {
                // One closed tab among several is not a departure: the record is only written once the player has no
                // connection left to this game.
                if (!IsWatchedLocked(address))
                {
                    RecordDepartureLocked(address.GameId, address.PlayerId, now);
                }
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
            return IsWatchedLocked(new ConnectionAddress(normalizedGameId, normalizedPlayerId));
        }
    }

    public DateTimeOffset? GetPresenceDeadline(string gameId, string playerId, TimeSpan grace)
    {
        var normalizedGameId = NormalizeGameId(gameId);
        var normalizedPlayerId = NormalizePlayerId(playerId);

        if (normalizedGameId.Length == 0 || normalizedPlayerId.Length == 0)
        {
            return null;
        }

        lock (syncRoot)
        {
            // Watching right now is the whole answer, and so is a player this process never saw: a board is allowed to
            // assume company it cannot observe rather than gray out a rematch after a restart.
            if (IsWatchedLocked(new ConnectionAddress(normalizedGameId, normalizedPlayerId)))
            {
                return null;
            }

            return lastSeenByGameId.TryGetValue(normalizedGameId, out var lastSeenByPlayer)
                && lastSeenByPlayer.TryGetValue(normalizedPlayerId, out var lastSeen)
                ? lastSeen + grace
                : null;
        }
    }

    /// <summary>Whether any live connection still watches the given game as the given player.</summary>
    private bool IsWatchedLocked(ConnectionAddress address)
    {
        return addressesByConnectionId.Values.Any(addresses => addresses.Contains(address));
    }

    private void RecordDepartureLocked(string gameId, string playerId, DateTimeOffset now)
    {
        PruneDeparturesLocked(now);

        if (!lastSeenByGameId.TryGetValue(gameId, out var lastSeenByPlayer))
        {
            lastSeenByPlayer = new Dictionary<string, DateTimeOffset>(StringComparer.Ordinal);
            lastSeenByGameId[gameId] = lastSeenByPlayer;
        }

        lastSeenByPlayer[playerId] = now;
    }

    private void ForgetDepartureLocked(string gameId, string playerId)
    {
        if (!lastSeenByGameId.TryGetValue(gameId, out var lastSeenByPlayer)
            || !lastSeenByPlayer.Remove(playerId))
        {
            return;
        }

        if (lastSeenByPlayer.Count == 0)
        {
            lastSeenByGameId.Remove(gameId);
        }
    }

    private void PruneDeparturesLocked(DateTimeOffset now)
    {
        var cutoff = now - LastSeenRetention;

        foreach (var gameId in lastSeenByGameId.Keys.ToList())
        {
            var lastSeenByPlayer = lastSeenByGameId[gameId];

            foreach (var playerId in lastSeenByPlayer.Keys.ToList())
            {
                if (lastSeenByPlayer[playerId] < cutoff)
                {
                    lastSeenByPlayer.Remove(playerId);
                }
            }

            if (lastSeenByPlayer.Count == 0)
            {
                lastSeenByGameId.Remove(gameId);
            }
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
