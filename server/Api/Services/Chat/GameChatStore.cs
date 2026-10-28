using System.Collections.Concurrent;
using ErrorOr;
using Microsoft.Extensions.Options;
using ProjectHiddenVillage.Server.Api.Interfaces.Chat;

namespace ProjectHiddenVillage.Server.Api.Services.Chat;

public sealed class GameChatStore : IGameChatStore
{
    private readonly ConcurrentDictionary<string, ChatRoom> rooms = new(StringComparer.Ordinal);
    private readonly GameChatOptions options;
    private readonly TimeProvider timeProvider;

    /// <summary>The last opportunistic sweep, in UTC ticks. The store is a singleton, so one field is enough.</summary>
    private long lastSweepUtcTicks;

    public GameChatStore(IOptions<GameChatOptions> options, TimeProvider timeProvider)
    {
        this.options = options.Value;
        this.timeProvider = timeProvider;
    }

    public ErrorOr<GameChatMessageResponse> Append(string gameId, string senderPlayerId, string? text)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(gameId);
        ArgumentException.ThrowIfNullOrWhiteSpace(senderPlayerId);

        if (!options.Enabled)
        {
            return Error.Validation(
                code: GameChatErrorCodes.Disabled,
                description: "Chat is disabled on this server.");
        }

        var textResult = GameChatRules.NormalizeText(text, options);
        if (textResult.IsError)
        {
            return textResult.Errors;
        }

        var now = timeProvider.GetUtcNow();
        SweepIfDue(now);

        var room = rooms.GetOrAdd(
            NormalizeGameId(gameId),
            _ => new ChatRoom { LastActivityUtc = now });

        lock (room.SyncRoot)
        {
            room.LastActivityUtc = now;

            var budget = room.GetOrCreateBudget(senderPlayerId, options.SendBudgetPerMinute, now);
            if (!budget.TryConsume(now))
            {
                return Error.Validation(
                    code: GameChatErrorCodes.RateLimited,
                    description: "Too many chat messages. Wait a moment before sending another one.");
            }

            room.LastSequence += 1;
            var message = new GameChatMessageResponse(
                room.LastSequence,
                Guid.NewGuid().ToString("N"),
                senderPlayerId,
                now,
                textResult.Value);

            room.Messages.AddLast(message);

            var maxMessages = Math.Max(1, options.MaxMessagesPerGame);
            while (room.Messages.Count > maxMessages)
            {
                room.Messages.RemoveFirst();
            }

            return message;
        }
    }

    public GameChatHistoryResponse ReadHistory(string gameId, long sinceSequence)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(gameId);

        var normalizedGameId = NormalizeGameId(gameId);
        if (!rooms.TryGetValue(normalizedGameId, out var room))
        {
            return new GameChatHistoryResponse(normalizedGameId, 0, []);
        }

        var floor = Math.Max(0, sinceSequence);

        lock (room.SyncRoot)
        {
            var messages = room.Messages
                .Where(message => message.Sequence > floor)
                .ToList();

            return new GameChatHistoryResponse(normalizedGameId, room.LastSequence, messages);
        }
    }

    private static string NormalizeGameId(string gameId)
    {
        return gameId.Trim().ToUpperInvariant();
    }

    private void SweepIfDue(DateTimeOffset now)
    {
        var interval = TimeSpan.FromMinutes(Math.Max(1, options.SweepIntervalMinutes));
        var lastTicks = Interlocked.Read(ref lastSweepUtcTicks);

        if (lastTicks != 0 && now.UtcTicks - lastTicks < interval.Ticks)
        {
            return;
        }

        // Only the caller that moves the timestamp sweeps: the loser of the race lets the winner do the work.
        if (Interlocked.CompareExchange(ref lastSweepUtcTicks, now.UtcTicks, lastTicks) != lastTicks)
        {
            return;
        }

        Sweep(now);
    }

    private void Sweep(DateTimeOffset now)
    {
        var idleTtl = TimeSpan.FromMinutes(Math.Max(1, options.RoomIdleMinutes));

        foreach (var entry in rooms)
        {
            TryRemoveIdle(entry.Key, entry.Value, now, idleTtl);
        }

        var overflow = rooms.Count - Math.Max(1, options.MaxRooms);
        if (overflow <= 0)
        {
            return;
        }

        // Over the cap, the quietest rooms go first: they are the ones nobody is typing into.
        var oldest = rooms
            .OrderBy(entry => entry.Value.LastActivityUtc)
            .Take(overflow)
            .ToList();

        foreach (var entry in oldest)
        {
            TryRemoveIdle(entry.Key, entry.Value, now, TimeSpan.Zero);
        }
    }

    /// <summary>
    /// The idle check runs under the room's own lock, the same lock an append takes while it refreshes the activity
    /// stamp, so a room cannot be dropped between the check and a message landing in it.
    /// </summary>
    private bool TryRemoveIdle(string gameId, ChatRoom room, DateTimeOffset now, TimeSpan idleTtl)
    {
        lock (room.SyncRoot)
        {
            if (now - room.LastActivityUtc < idleTtl)
            {
                return false;
            }

            return rooms.TryRemove(gameId, out _);
        }
    }

    private sealed class ChatRoom
    {
        internal object SyncRoot { get; } = new();

        internal LinkedList<GameChatMessageResponse> Messages { get; } = new();

        internal Dictionary<string, ChatSendBudget> Budgets { get; } = new(StringComparer.Ordinal);

        internal long LastSequence { get; set; }

        internal DateTimeOffset LastActivityUtc { get; set; }

        internal ChatSendBudget GetOrCreateBudget(string playerId, int sendBudgetPerMinute, DateTimeOffset now)
        {
            if (!Budgets.TryGetValue(playerId, out var budget))
            {
                budget = new ChatSendBudget(sendBudgetPerMinute, now);
                Budgets[playerId] = budget;
            }

            return budget;
        }
    }
}
