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

        entity.HasOne(record => record.User)
            .WithMany(record => record.Decks)
            .HasForeignKey(record => record.UserId)
            .OnDelete(DeleteBehavior.SetNull);

        entity.HasIndex(record => record.UserId);
    }
}
