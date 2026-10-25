using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using ProjectHiddenVillage.Server.Data.Entities;

namespace ProjectHiddenVillage.Server.Data.Configurations;

public sealed class DeckRulesetCardRestrictionConfiguration : IEntityTypeConfiguration<DeckRulesetCardRestriction>
{
    public void Configure(EntityTypeBuilder<DeckRulesetCardRestriction> entity)
    {
        entity.ToTable("deck_ruleset_card_restrictions");
        entity.HasKey(record => record.Id);

        entity.Property(record => record.MaxCopies)
            .IsRequired();

        entity.HasOne(record => record.CardCatalogEntry)
            .WithMany()
            .HasForeignKey(record => record.CardCatalogEntryId)
            .OnDelete(DeleteBehavior.Restrict);

        entity.HasIndex(record => new { record.DeckRulesetId, record.CardCatalogEntryId })
            .IsUnique();

        entity.ToTable(table => table.HasCheckConstraint(
            "CK_deck_ruleset_card_restrictions_max_copies_non_negative",
            "\"MaxCopies\" >= 0"));
    }
}
