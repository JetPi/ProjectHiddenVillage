namespace ProjectHiddenVillage.Server;

/// <summary>
/// A phase transition the engine performed on its own and stopped on, waiting for every connected participant
/// to acknowledge that their client has finished presenting it (see
/// <c>plans/server-owned-phase-transitions.md</c>).
///
/// It is deliberately **not** a prompt. A prompt means a player owes the engine a decision, and this must never
/// leak into the prompt UI, the <c>resolve-prompt</c> action list or the client pickers: it is a presentation
/// receipt, and the only thing it can be answered with is "I am done animating".
///
/// It lives on the <see cref="GameInstance"/> (runtime orchestration, like the prompt queue and the action log)
/// rather than on the rules snapshot, because its required-ack set is derived from who is currently connected.
/// </summary>
public sealed class PendingPhasePresentation
{
    private readonly List<string> requiredAckPlayerIds;
    private readonly List<string> acknowledgedPlayerIds = [];

    public PendingPhasePresentation(
        string presentationId,
        GamePhase phase,
        PhasePresentationKind kind,
        int turnNumber,
        IEnumerable<string> requiredAckPlayerIds)
    {
        if (string.IsNullOrWhiteSpace(presentationId))
        {
            throw new InvalidOperationException("A phase presentation requires an id.");
        }

        PresentationId = presentationId;
        Phase = phase;
        Kind = kind;
        TurnNumber = turnNumber;

        // A player who is connected twice (two tabs) still acks once, and a blank id can never be required.
        this.requiredAckPlayerIds = (requiredAckPlayerIds ?? [])
            .Where(playerId => !string.IsNullOrWhiteSpace(playerId))
            .Distinct(StringComparer.Ordinal)
            .ToList();
    }

    /// <summary>The id an acknowledgement must quote; minted per presented transition.</summary>
    public string PresentationId { get; }

    /// <summary>The phase that was just entered and is waiting to be presented.</summary>
    public GamePhase Phase { get; }

    public PhasePresentationKind Kind { get; }

    public int TurnNumber { get; }

    /// <summary>The connected participants whose clients have to finish presenting before the engine resumes.</summary>
    public IReadOnlyList<string> RequiredAckPlayerIds => requiredAckPlayerIds;

    public IReadOnlyList<string> AcknowledgedPlayerIds => acknowledgedPlayerIds;

    /// <summary>True once nobody is still expected: the drain may take the next step.</summary>
    public bool IsSatisfied => requiredAckPlayerIds.All(IsAcknowledgedBy);

    public bool IsRequiredFrom(string playerId) =>
        requiredAckPlayerIds.Contains(playerId, StringComparer.Ordinal);

    public bool IsAcknowledgedBy(string playerId) =>
        acknowledgedPlayerIds.Contains(playerId, StringComparer.Ordinal);

    /// <summary>
    /// Records one participant's acknowledgement. Callers check <see cref="IsRequiredFrom"/> first: an
    /// acknowledgement from anybody else (or a repeat) is not an error the player should ever see.
    /// </summary>
    public void Acknowledge(string playerId)
    {
        if (!IsRequiredFrom(playerId) || IsAcknowledgedBy(playerId))
        {
            return;
        }

        acknowledgedPlayerIds.Add(playerId);
    }

    /// <summary>
    /// Drops a participant who is no longer connected: a closed tab can never send the acknowledgement, so
    /// keeping it in the requirement would stall the table until the ack timeout. Returns whether the
    /// requirement actually changed, which is what lets the caller resume a presentation that just became
    /// satisfied.
    /// </summary>
    public bool ReleaseRequirement(string playerId)
    {
        if (!IsRequiredFrom(playerId))
        {
            return false;
        }

        requiredAckPlayerIds.Remove(playerId);
        acknowledgedPlayerIds.Remove(playerId);
        return true;
    }
}
