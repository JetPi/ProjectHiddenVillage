namespace ProjectHiddenVillage.Server;

public sealed class Player
{
    public string Id { get; set; } = string.Empty;

    public string Name { get; set; } = string.Empty;

    public string DisplayName { get; set; } = string.Empty;

    public List<string> Deck { get; set; } = new List<string>();

    /// <summary>
    /// The stored deck this player sat down with, when there is one. It is not part of the board state: it travels
    /// with the seat so the result of the game can be credited to that deck for that player (see the deck records).
    /// Test compositions that build a <see cref="Player"/> from card ids alone leave it null, and no record exists
    /// for them because there is no stored deck to credit.
    /// </summary>
    public Guid? DeckId { get; set; }
}