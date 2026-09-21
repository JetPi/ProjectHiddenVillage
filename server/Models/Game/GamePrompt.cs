namespace ProjectHiddenVillage.Server;

public enum GamePromptType
{
    ChooseStartingPlayer,
    Mulligan,
    Effect
}

public sealed class GamePrompt
{
    public string PromptId { get; set; } = Guid.NewGuid().ToString("N");

    public GamePromptType Type { get; set; }

    // The player who is expected to answer this prompt.
    public string RequestedPlayerId { get; set; } = string.Empty;

    // Valid selection values for this prompt.
    public List<string> Options { get; set; } = [];

    /// <summary>
    /// Copy bucket for an <see cref="GamePromptType.Effect"/> selection prompt. The server publishes the
    /// stable value only; the client owns the wording.
    /// </summary>
    public EffectSelectionPromptKind SelectionPromptKind { get; set; } = EffectSelectionPromptKind.Generic;

    /// <summary>Zone the candidates live in, so the client knows which card collection to render.</summary>
    public PlayerZone? CandidateZone { get; set; }

    /// <summary>Owner of the candidate cards (the player being asked).</summary>
    public string? CandidatePlayerId { get; set; }

    public int MinimumSelection { get; set; } = 1;

    public int MaximumSelection { get; set; } = 1;

    /// <summary>
    /// Set when an effect suspended mid-resolution to ask this question; the engine resumes it once the
    /// prompt is answered. Null for phase prompts (mulligan, starting player).
    /// </summary>
    public PendingEffectContinuation? EffectContinuation { get; set; }
}