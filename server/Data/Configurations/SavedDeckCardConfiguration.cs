using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using ProjectHiddenVillage.Server.Data.Entities;

namespace ProjectHiddenVillage.Server.Data.Configurations;

public sealed class SavedDeckCardConfiguration : IEntityTypeConfiguration<SavedDeckCard>
{
    public void Configure(EntityTypeBuilder<SavedDeckCard> entity)
    {
        entity.ToTable("saved_deck_cards");
        entity.HasKey(record => record.Id);

        entity.Property(record => record.CardId)
            .IsRequired()
            .HasMaxLength(128);

        entity.Property(record => record.Quantity)
            .IsRequired();

        entity.HasOne(record => record.SavedDeck)
            .WithMany(record => record.Cards)
            .HasForeignKey(record => record.SavedDeckId)
            .OnDelete(DeleteBehavior.Cascade);

        entity.HasIndex(record => record.SavedDeckId);
        entity.HasIndex(record => new { record.SavedDeckId, record.CardId })
            .IsUnique();
    }
}