using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using ProjectHiddenVillage.Server.Data.Entities;

namespace ProjectHiddenVillage.Server.Data.Configurations;

public sealed class GameLogArchiveEntryConfiguration : IEntityTypeConfiguration<GameLogArchiveEntry>
{
    public void Configure(EntityTypeBuilder<GameLogArchiveEntry> entity)
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
    }
}