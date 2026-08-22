namespace ProjectHiddenVillage.Server.Data.Entities;

public sealed class User
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public string Email { get; set; } = string.Empty;

    public string Username { get; set; } = string.Empty;

    public bool IsCardCatalogAdmin { get; set; }

    public string PasswordHash { get; set; } = string.Empty;

    public List<Deck> Decks { get; set; } = [];

    public List<GameInstance> Player1GameInstances { get; set; } = [];

    public List<GameInstance> Player2GameInstances { get; set; } = [];

    public List<SavedDeck> SavedDecks { get; set; } = new List<SavedDeck>();
}