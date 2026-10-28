using System.Collections.Concurrent;
using ProjectHiddenVillage.Server.Api.Services.Games;

namespace ProjectHiddenVillage.Server;

/// <summary>
/// Taking a move back: one player asks, the other agrees, and the board returns to the last moment either of them
/// was in control. The whole table is frozen while the request waits, so the frozen point cannot move under the
/// answer. See <see cref="GameInstance.RewindPoints"/> for the stack itself.
/// </summary>
public sealed partial class InMemoryGameInstanceRegistry
{
    private readonly ConcurrentDictionary<string, ITimer> redoWatchdogs = new(StringComparer.Ordinal);

    private static void ThrowIfRedoRequestPending(GameInstance instance)
    {
        if (instance.PendingRedoRequest is not null)
        {
            throw new InvalidOperationException("Cannot act while a redo request is waiting for an answer.");
        }
    }

    private RedoRewindPoint CaptureRedoPoint(GameInstance instance, string actingPlayerId)
    {
        return instance.CaptureRewindPoint(actingPlayerId);
    }

    private void CommitRedoPoint(GameInstance instance, RedoRewindPoint? point)
    {
        instance.CommitRewindPoint(point, redoOptions.MaxRewindPoints);
    }

    /// <summary>
    /// Asks the opponent to let the board go back to the newest rewind point. The point is frozen on the request, and
    /// the stop is dropped from the clock, because nobody owes a decision while the table waits for an answer.
    /// </summary>
    public GameInstance RequestRedo(string gameId, string playerId)
    {
        var instance = GetRequired(gameId);

        lock (instance)
        {
            GameEndRules.ThrowIfGameOver(instance.State);

            if (!redoOptions.Enabled)
            {
                throw new InvalidOperationException("Taking a move back is disabled.");
            }

            if (instance.PendingPhasePresentation is not null)
            {
                throw new InvalidOperationException("Cannot ask for a redo while a phase presentation is pending.");
            }

            if (instance.PendingRedoRequest is not null)
            {
                throw new InvalidOperationException("A redo request is already waiting for an answer.");
            }

            if (instance.GetPendingPrompt() is not null)
            {
                throw new InvalidOperationException("Cannot ask for a redo while a decision is pending.");
            }

            if (!instance.State.Players.Any(player => IsSamePlayerId(player.PlayerId, playerId)))
            {
                throw new InvalidOperationException($"Player '{playerId}' was not found in game.");
            }

            var target = instance.FindRewindTarget()
                ?? throw new InvalidOperationException("There is nothing to take back yet.");

            var approverPlayerId = ResolveOpponentPlayerId(instance.State, playerId);

            var request = new PendingRedoRequest
            {
                RequestedByPlayerId = playerId,
                ApproverPlayerId = approverPlayerId,
                RewindPointId = target.PointId,
                TurnNumber = instance.State.TurnNumber,
                Phase = instance.State.Phase.ToString(),
            };

            instance.OpenRedoRequest(request);
            instance.AddActionLogEntry(
                actionType: GameActionLogActionTypes.RedoRequested,
                message: $"Player {playerId} asked to take a move back.",
                playerId: playerId,
                metadata: new Dictionary<string, string>(StringComparer.Ordinal)
                {
                    ["requestId"] = request.RequestId,
                    ["approverPlayerId"] = approverPlayerId,
                    ["rewindPointId"] = target.PointId,
                },
                category: GameActionLogCategory.Action);

            ArmRedoWatchdog(instance.Id, request.RequestId);
            SyncClock(instance);
            return instance;
        }
    }

    /// <summary>
    /// Answers an outstanding request. Only the other player may answer; refusal leaves the board untouched, and
    /// approval restores the frozen point, which consumes it and everything newer than it.
    /// </summary>
    public GameInstance RespondToRedo(string gameId, string playerId, string requestId, bool accepted)
    {
        var instance = GetRequired(gameId);

        lock (instance)
        {
            GameEndRules.ThrowIfGameOver(instance.State);

            var request = instance.PendingRedoRequest
                ?? throw new InvalidOperationException("No redo request is waiting for an answer.");

            if (!string.Equals(request.RequestId, requestId, StringComparison.Ordinal))
            {
                throw new InvalidOperationException("That redo request is no longer current.");
            }

            if (!IsSamePlayerId(request.ApproverPlayerId, playerId))
            {
                throw new InvalidOperationException("Only the other player can answer a redo request.");
            }

            if (!accepted)
            {
                CancelRedoRequest(instance, request, reason: "declined", actingPlayerId: playerId, isDeclined: true);
                SyncClock(instance, forceRearm: true);
                return instance;
            }

            if (!instance.RewindTo(request.RewindPointId))
            {
                throw new InvalidOperationException("The board this redo would return to is no longer available.");
            }

            ClearRedoWatchdog(instance.Id);
            instance.ClearRedoRequest();
            instance.MarkRewindApplied(request.RequestId);
            instance.AddActionLogEntry(
                actionType: GameActionLogActionTypes.RedoAccepted,
                message: $"Player {playerId} accepted the redo; the board went back to turn {request.TurnNumber}.",
                playerId: playerId,
                metadata: new Dictionary<string, string>(StringComparer.Ordinal)
                {
                    ["requestId"] = request.RequestId,
                    ["requestedByPlayerId"] = request.RequestedByPlayerId,
                    ["reason"] = "accepted",
                },
                category: GameActionLogCategory.Action);

            instance.ValidateInvariants();
            SyncClock(instance, forceRearm: true);
            return instance;
        }
    }

    /// <summary>Withdraws a request. A request that is already gone is not an error: a double click must not fail.</summary>
    public GameInstance CancelRedo(string gameId, string playerId)
    {
        var instance = GetRequired(gameId);

        lock (instance)
        {
            var request = instance.PendingRedoRequest;

            if (request is null || !IsSamePlayerId(request.RequestedByPlayerId, playerId))
            {
                return instance;
            }

            CancelRedoRequest(instance, request, reason: "cancelled", actingPlayerId: playerId, isDeclined: false);
            SyncClock(instance, forceRearm: true);
            return instance;
        }
    }

    /// <summary>
    /// Drops the request when a participant who can no longer answer it - the approver, or the requester - went
    /// away, so a closed tab cannot hold the table until the watchdog fires. This path has no hub call of its own,
    /// so it notifies the clients itself.
    /// </summary>
    public GameInstance ReleaseRedoRequest(string gameId, string playerId)
    {
        var instance = GetRequired(gameId);
        var didRelease = false;

        lock (instance)
        {
            var request = instance.PendingRedoRequest;

            if (request is null || !instance.ReleaseRedoRequest(playerId))
            {
                return instance;
            }

            ClearRedoWatchdog(instance.Id);
            instance.AddActionLogEntry(
                actionType: GameActionLogActionTypes.RedoCancelled,
                message: "The redo request was dropped because a participant left.",
                playerId: request.RequestedByPlayerId,
                metadata: new Dictionary<string, string>(StringComparer.Ordinal)
                {
                    ["requestId"] = request.RequestId,
                    ["reason"] = "playerLeft",
                },
                category: GameActionLogCategory.Action);

            SyncClock(instance, forceRearm: true);
            didRelease = true;
        }

        if (didRelease)
        {
            NotifyStateInvalidated(instance.Id);
        }

        return instance;
    }

    private void CancelRedoRequest(
        GameInstance instance,
        PendingRedoRequest request,
        string reason,
        string? actingPlayerId,
        bool isDeclined)
    {
        ClearRedoWatchdog(instance.Id);
        instance.ClearRedoRequest();

        instance.AddActionLogEntry(
            actionType: isDeclined
                ? GameActionLogActionTypes.RedoDeclined
                : GameActionLogActionTypes.RedoCancelled,
            message: isDeclined
                ? $"Player {actingPlayerId} declined the redo request."
                : "The redo request was withdrawn.",
            playerId: actingPlayerId ?? request.RequestedByPlayerId,
            metadata: new Dictionary<string, string>(StringComparer.Ordinal)
            {
                ["requestId"] = request.RequestId,
                ["requestedByPlayerId"] = request.RequestedByPlayerId,
                ["approverPlayerId"] = request.ApproverPlayerId,
                ["reason"] = reason,
            },
            category: GameActionLogCategory.Action);
    }

    private void ArmRedoWatchdog(string gameId, string requestId)
    {
        ClearRedoWatchdog(gameId);

        if (redoOptions.ResponseTimeoutMs <= 0)
        {
            return;
        }

        var watchdog = timeProvider.CreateTimer(
            callback: _ => ExpireRedoRequest(gameId, requestId),
            state: null,
            dueTime: TimeSpan.FromMilliseconds(redoOptions.ResponseTimeoutMs),
            period: Timeout.InfiniteTimeSpan);

        redoWatchdogs[gameId] = watchdog;
    }

    private void ClearRedoWatchdog(string gameId)
    {
        if (redoWatchdogs.TryRemove(gameId, out var watchdog))
        {
            watchdog.Dispose();
        }
    }

    /// <summary>Nobody answered in time: the request lapses and the table plays on from where it was frozen.</summary>
    private void ExpireRedoRequest(string gameId, string requestId)
    {
        ClearRedoWatchdog(gameId);

        if (!instances.TryGetValue(gameId, out var instance) || instance is null)
        {
            return;
        }

        var didExpire = false;

        lock (instance)
        {
            var request = instance.PendingRedoRequest;

            if (request is null || !string.Equals(request.RequestId, requestId, StringComparison.Ordinal))
            {
                return;
            }

            CancelRedoRequest(instance, request, reason: "timeout", actingPlayerId: null, isDeclined: true);
            SyncClock(instance, forceRearm: true);
            didExpire = true;
        }

        if (didExpire)
        {
            NotifyStateInvalidated(instance.Id);
        }
    }
}
