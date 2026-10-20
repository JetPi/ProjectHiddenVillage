using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using ProjectHiddenVillage.Server.Data.Entities;

namespace ProjectHiddenVillage.Server.Data.Configurations;

public sealed class DeckConfiguration : IEntityTypeConfiguration<Deck>
{
    public void Configure(EntityTypeBuilder<Deck> entity)
    {
        entity.ToTable("decks");
        entity.HasKey(record => record.Id);

        entity.Property(record => record.Type)
            .HasConversion<string>()
            .HasMaxLength(16);

        // Same cap as `saved_decks.name`. Not unique: an admin may deliberately keep two decks sharing a name.
        entity.Property(record => record.Name)
            .IsRequired()
            .HasMaxLength(128);

        entity.HasOne(record => record.User)
            .WithMany(record => record.Decks)
            .HasForeignKey(record => record.UserId)
            .OnDelete(DeleteBehavior.SetNull);

        entity.HasIndex(record => record.UserId);

        // The public-deck rail lists one type by name; the login picker filters the same way.
        entity.HasIndex(record => new { record.Type, record.Name });
    }
}
