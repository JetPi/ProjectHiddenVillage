namespace ProjectHiddenVillage.Server.Data.Entities;

public enum DeckType
{
    Public,
    User,
}

public sealed class Deck
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public DeckType Type { get; set; }

    /// <summary>
    /// The name a deck is referred to by. Admin-authored decks carry a real name; decks minted by the legacy
    /// text import (a player's list pasted at game creation) store an empty name and fall back to their id.
    /// </summary>
    public string Name { get; set; } = string.Empty;

    public Guid? UserId { get; set; }

    public User? User { get; set; }

    public List<DeckCard> Cards { get; set; } = [];
}
