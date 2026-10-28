namespace ProjectHiddenVillage.Server;

/// <summary>
/// Taking a move back. A rewind point is captured before a player acts, so the stack reads as "the moments a
/// player was in control"; an approved redo restores the newest such moment, consumes it, and drops the points
/// that described the future it just took back. Points older than the restored one stay, which is what makes
/// repeated approvals walk further back through the game.
/// </summary>
public sealed partial class GameInstance
{
    private readonly List<RedoRewindPoint> rewindPoints = [];

    public IReadOnlyList<RedoRewindPoint> RewindPoints => rewindPoints;

    public PendingRedoRequest? PendingRedoRequest { get; private set; }

    /// <summary>Id of the request whose approval moved the board, so a client can tell a rewind push from a normal one.</summary>
    public string? LastRewindId { get; private set; }

    /// <summary>True when the board has a point behind it that is not where it already is.</summary>
    public bool HasRewindTarget => FindRewindTarget() is not null;

    public RedoRewindPoint CaptureRewindPoint(string capturedForPlayerId)
    {
        return new RedoRewindPoint
        {
            CapturedForPlayerId = capturedForPlayerId ?? string.Empty,
            TurnNumber = State.TurnNumber,
            Phase = State.Phase,
            State = GameStateSnapshot.Clone(State),
            PendingPrompts = GameStateSnapshot.ClonePrompts(PendingPrompts),
            Fingerprint = GameStateFingerprint.Compute(State, PendingPrompts),
        };
    }

    /// <summary>
    /// Pushes a captured point, unless the mutation it preceded changed nothing: a refused action must not leave a
    /// point behind that "takes back" a board identical to the live one.
    /// </summary>
    public RedoRewindPoint? CommitRewindPoint(RedoRewindPoint? point, int maxRewindPoints)
    {
        if (point is null || maxRewindPoints <= 0)
        {
            return null;
        }

        if (string.Equals(point.Fingerprint, GameStateFingerprint.Compute(State, PendingPrompts), StringComparison.Ordinal))
        {
            return null;
        }

        rewindPoints.Add(point);

        while (rewindPoints.Count > maxRewindPoints)
        {
            rewindPoints.RemoveAt(0);
        }

        return point;
    }

    /// <summary>The newest point that differs from the live board, i.e. the last moment somebody was in control.</summary>
    public RedoRewindPoint? FindRewindTarget()
    {
        var current = GameStateFingerprint.Compute(State, PendingPrompts);

        for (var index = rewindPoints.Count - 1; index >= 0; index -= 1)
        {
            if (!string.Equals(rewindPoints[index].Fingerprint, current, StringComparison.Ordinal))
            {
                return rewindPoints[index];
            }
        }

        return null;
    }

    /// <summary>
    /// Puts the board back and consumes the point, together with every point newer than it. The action log is not
    /// part of a rewind: it is the record that a rewind happened.
    /// </summary>
    public bool RewindTo(string rewindPointId)
    {
        var index = rewindPoints.FindLastIndex(point =>
            string.Equals(point.PointId, rewindPointId, StringComparison.Ordinal));

        if (index < 0)
        {
            return false;
        }

        var point = rewindPoints[index];

        GameStateSnapshot.CopyInto(State, point.State);

        PendingPrompts.Clear();
        foreach (var prompt in GameStateSnapshot.ClonePrompts(point.PendingPrompts))
        {
            PendingPrompts.Enqueue(prompt);
        }

        ClearPhasePresentation();
        rewindPoints.RemoveRange(index, rewindPoints.Count - index);

        return true;
    }

    public void OpenRedoRequest(PendingRedoRequest request)
    {
        ArgumentNullException.ThrowIfNull(request);
        PendingRedoRequest = request;
    }

    public void ClearRedoRequest()
    {
        PendingRedoRequest = null;
    }

    public void MarkRewindApplied(string requestId)
    {
        LastRewindId = requestId;
    }

    /// <summary>Drops the outstanding request when the player it waits on can no longer answer it.</summary>
    public bool ReleaseRedoRequest(string playerId)
    {
        var request = PendingRedoRequest;

        if (request is null)
        {
            return false;
        }

        if (!string.Equals(request.ApproverPlayerId, playerId, StringComparison.Ordinal)
            && !string.Equals(request.RequestedByPlayerId, playerId, StringComparison.Ordinal))
        {
            return false;
        }

        PendingRedoRequest = null;
        return true;
    }
}
