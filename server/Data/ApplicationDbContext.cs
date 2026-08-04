using Microsoft.EntityFrameworkCore;
using ProjectHiddenVillage.Server.Data.Entities;
using GameInstanceEntity = ProjectHiddenVillage.Server.Data.Entities.GameInstance;

namespace ProjectHiddenVillage.Server.Data;

public sealed class ApplicationDbContext : DbContext
{
    public ApplicationDbContext(DbContextOptions<ApplicationDbContext> options)
        : base(options)
    {
    }

    public DbSet<GameLogArchiveEntry> GameLogArchives => Set<GameLogArchiveEntry>();
    public DbSet<User> Users => Set<User>();
    public DbSet<Deck> Decks => Set<Deck>();
    public DbSet<DeckCard> DeckCards => Set<DeckCard>();
    public DbSet<Player1RuntimeDeckCard> Player1RuntimeDeckCards => Set<Player1RuntimeDeckCard>();
    public DbSet<Player2RuntimeDeckCard> Player2RuntimeDeckCards => Set<Player2RuntimeDeckCard>();
    public DbSet<Player1CharacterFieldCard> Player1CharacterFieldCards => Set<Player1CharacterFieldCard>();
    public DbSet<Player2CharacterFieldCard> Player2CharacterFieldCards => Set<Player2CharacterFieldCard>();
    public DbSet<Player1SupportAreaCard> Player1SupportAreaCards => Set<Player1SupportAreaCard>();
    public DbSet<Player2SupportAreaCard> Player2SupportAreaCards => Set<Player2SupportAreaCard>();
    public DbSet<Player1TrashCard> Player1TrashCards => Set<Player1TrashCard>();
    public DbSet<Player2TrashCard> Player2TrashCards => Set<Player2TrashCard>();
    public DbSet<GameInstanceEntity> GameInstances => Set<GameInstanceEntity>();
    public DbSet<SavedDeck> SavedDecks => Set<SavedDeck>();
    public DbSet<SavedDeckCard> SavedDeckCards => Set<SavedDeckCard>();
    public DbSet<CardCatalogEntry> CardCatalogEntries => Set<CardCatalogEntry>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(ApplicationDbContext).Assembly);
        base.OnModelCreating(modelBuilder);
    }
}
