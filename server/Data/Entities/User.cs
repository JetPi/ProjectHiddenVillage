namespace ProjectHiddenVillage.Server.Data.Entities;

public sealed class User
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public string Email { get; set; } = string.Empty;

    public string Username { get; set; } = string.Empty;

    public string PasswordHash { get; set; } = string.Empty;

    public List<SavedDeck> SavedDecks { get; set; } = new List<SavedDeck>();
}