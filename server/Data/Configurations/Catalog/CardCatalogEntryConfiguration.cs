using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using ProjectHiddenVillage.Server.Data.Entities;

namespace ProjectHiddenVillage.Server.Data.Configurations;

public sealed class CardCatalogEntryConfiguration : IEntityTypeConfiguration<CardCatalogEntry>
{
    public void Configure(EntityTypeBuilder<CardCatalogEntry> entity)
    {
        entity.ToTable("card_catalog_entries");
        entity.HasKey(record => record.Id);

        entity.Property(record => record.CardId)
            .IsRequired()
            .HasMaxLength(64);

        entity.Property(record => record.Image)
            .IsRequired()
            .HasMaxLength(1024);

        entity.Property(record => record.DisplayName)
            .IsRequired()
            .HasMaxLength(256);

        entity.Property(record => record.Description)
            .IsRequired();

        entity.Property(record => record.NameJson)
            .IsRequired()
            .HasColumnType("jsonb");

        entity.Property(record => record.TraitsJson)
            .IsRequired()
            .HasColumnType("jsonb");

        entity.Property(record => record.ConditionsJson)
            .IsRequired()
            .HasColumnType("jsonb");

        entity.Property(record => record.EffectsJson)
            .IsRequired()
            .HasColumnType("jsonb");

        entity.Property(record => record.SupportName)
            .HasMaxLength(256);

        entity.Property(record => record.SupportEffect);

        entity.Property(record => record.CannotBeNormalSummoned)
            .IsRequired()
            .HasDefaultValue(false);

        entity.Property(record => record.CreatedAtUtc)
            .IsRequired();

        entity.Property(record => record.UpdatedAtUtc)
            .IsRequired();

        entity.HasIndex(record => record.CardId)
            .IsUnique();

        // The listing filters and sorts on these, and each is a page-level operation rather than a row lookup.
        entity.HasIndex(record => record.DisplayName);
        entity.HasIndex(record => record.Type);
        entity.HasIndex(record => record.Color);
        entity.HasIndex(record => record.UpdatedAtUtc);

        // The index the art endpoint depends on is NOT modelled here on purpose: it is a covering expression index,
        // `upper("CardId") INCLUDE ("Image", "UpdatedAtUtc")`, which EF cannot express. It lives in the
        // AddCardCatalogIndexes migration only, so do not "clean up" the model snapshot to match it, and do not go
        // back to looking cards up without it - see `CardArtService.ResolveAsync`.
    }
}