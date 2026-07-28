using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using ProjectHiddenVillage.Server.Data.Entities;

namespace ProjectHiddenVillage.Server.Data.Configurations;

public sealed class SavedDeckConfiguration : IEntityTypeConfiguration<SavedDeck>
{
    public void Configure(EntityTypeBuilder<SavedDeck> entity)
    {
        entity.ToTable("saved_decks");
        entity.HasKey(record => record.Id);

        entity.Property(record => record.Name)
            .IsRequired()
            .HasMaxLength(128);

        entity.HasOne(record => record.User)
            .WithMany(record => record.SavedDecks)
            .HasForeignKey(record => record.UserId)
            .OnDelete(DeleteBehavior.Cascade);

        entity.HasIndex(record => new { record.UserId, record.Name });
    }
}