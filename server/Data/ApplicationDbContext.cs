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

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<GameLogArchiveEntry>(entity =>
        {
            entity.ToTable("game_log_archives");
            entity.HasKey(record => record.Id);

            entity.Property(record => record.GameId)
                .IsRequired()
                .HasMaxLength(128);

            entity.Property(record => record.PayloadJson)
                .IsRequired()
                .HasColumnType("jsonb");

            entity.HasIndex(record => record.GameId);
            entity.HasIndex(record => record.CompletedAtUtc);
        });
    }
}
