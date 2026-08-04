using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using ProjectHiddenVillage.Server.Data.Entities;

namespace ProjectHiddenVillage.Server.Data.Configurations;

public sealed class Player2RuntimeDeckCardConfiguration : IEntityTypeConfiguration<Player2RuntimeDeckCard>
{
    public void Configure(EntityTypeBuilder<Player2RuntimeDeckCard> entity)
    {
        entity.ToTable("player2_runtime_deck_cards");
        entity.HasKey(record => record.Id);

        entity.Property(record => record.CardId)
            .IsRequired()
            .HasMaxLength(128);

        entity.Property(record => record.Position)
            .IsRequired();

        entity.HasOne(record => record.GameInstance)
            .WithMany(record => record.Player2RuntimeDeckCards)
            .HasForeignKey(record => record.GameInstanceId)
            .OnDelete(DeleteBehavior.Cascade);

        entity.HasIndex(record => record.GameInstanceId);
        entity.HasIndex(record => new { record.GameInstanceId, record.Position })
            .IsUnique();
    }
}
