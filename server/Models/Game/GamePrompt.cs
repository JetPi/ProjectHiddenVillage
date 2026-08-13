namespace ProjectHiddenVillage.Server;

public enum GamePromptType
{
    ChooseStartingPlayer,
    Mulligan
}

public sealed class GamePrompt
{
    public string PromptId { get; set; } = Guid.NewGuid().ToString("N");

    public GamePromptType Type { get; set; }

    // The player who is expected to answer this prompt.
    public string RequestedPlayerId { get; set; } = string.Empty;

    // Valid selection values for this prompt.
    public List<string> Options { get; set; } = [];
}