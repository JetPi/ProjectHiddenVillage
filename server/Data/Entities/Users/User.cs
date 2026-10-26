namespace ProjectHiddenVillage.Server.Data.Entities;

public sealed class User
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public string Email { get; set; } = string.Empty;

    public string Username { get; set; } = string.Empty;

    public bool IsCardCatalogAdmin { get; set; }

    /// <summary>
    /// True for throwaway identities minted from a display name alone. Guests play every mode but own no
    /// durable data: their decks die with them and the retention sweeper removes them after a week of
    /// idleness, which is also why their win/loss record can never be kept.
    /// </summary>
    public bool IsGuest { get; set; }

    public DateTimeOffset CreatedAtUtc { get; set; } = DateTimeOffset.UtcNow;

    /// <summary>
    /// Last time the guest proved they were still around (session mint or entering a game/queue). The sweeper
    /// measures idleness from this, not from <see cref="CreatedAtUtc"/>, so a returning player keeps their row.
    /// </summary>
    public DateTimeOffset LastSeenAtUtc { get; set; } = DateTimeOffset.UtcNow;

    public string PasswordHash { get; set; } = string.Empty;

    public List<Deck> Decks { get; set; } = [];

    public List<GameInstance> Player1GameInstances { get; set; } = [];

    public List<GameInstance> Player2GameInstances { get; set; } = [];

    public List<SavedDeck> SavedDecks { get; set; } = new List<SavedDeck>();
}