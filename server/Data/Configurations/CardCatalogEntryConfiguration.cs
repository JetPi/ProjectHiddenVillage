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

        entity.Property(record => record.OriginalId)
            .IsRequired()
            .HasMaxLength(64);

        entity.Property(record => record.Attribute)
            .HasMaxLength(128);

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

        entity.Property(record => record.CreatedAtUtc)
            .IsRequired();

        entity.Property(record => record.UpdatedAtUtc)
            .IsRequired();

        entity.HasIndex(record => record.CardId)
            .IsUnique();
    }
}