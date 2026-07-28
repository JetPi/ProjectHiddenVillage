using Microsoft.EntityFrameworkCore;
using ProjectHiddenVillage.Server.Data.Entities;

namespace ProjectHiddenVillage.Server.Data;

public sealed class ApplicationDbContext : DbContext
{
    public ApplicationDbContext(DbContextOptions<ApplicationDbContext> options)
        : base(options)
    {
    }

    public DbSet<GameLogArchiveEntry> GameLogArchives => Set<GameLogArchiveEntry>();
    public DbSet<User> Users => Set<User>();
    public DbSet<SavedDeck> SavedDecks => Set<SavedDeck>();
    public DbSet<SavedDeckCard> SavedDeckCards => Set<SavedDeckCard>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(ApplicationDbContext).Assembly);
        base.OnModelCreating(modelBuilder);
    }
}
