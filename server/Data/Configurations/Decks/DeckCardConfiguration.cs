using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using ProjectHiddenVillage.Server.Data.Entities;

namespace ProjectHiddenVillage.Server.Data.Configurations;

public sealed class DeckCardConfiguration : IEntityTypeConfiguration<DeckCard>
{
    public void Configure(EntityTypeBuilder<DeckCard> entity)
    {
        entity.ToTable("deck_cards");
        entity.HasKey(record => record.Id);

        entity.Property(record => record.CardCatalogEntryId)
            .IsRequired();

        entity.Property(record => record.Quantity)
            .IsRequired();

        entity.HasOne(record => record.Deck)
            .WithMany(record => record.Cards)
            .HasForeignKey(record => record.DeckId)
            .OnDelete(DeleteBehavior.Cascade);

        entity.HasOne(record => record.CardCatalogEntry)
            .WithMany()
            .HasForeignKey(record => record.CardCatalogEntryId)
            .OnDelete(DeleteBehavior.Restrict);

        entity.HasIndex(record => record.DeckId);
        entity.HasIndex(record => record.CardCatalogEntryId);
        entity.HasIndex(record => new { record.DeckId, record.CardCatalogEntryId })
            .IsUnique();

        entity.ToTable(table => table.HasCheckConstraint(
            "CK_deck_cards_quantity_positive",
            "\"Quantity\" > 0"));
    }
}
