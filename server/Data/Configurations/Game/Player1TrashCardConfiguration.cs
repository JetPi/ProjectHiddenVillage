using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using ProjectHiddenVillage.Server.Data.Entities;

namespace ProjectHiddenVillage.Server.Data.Configurations;

public sealed class Player1TrashCardConfiguration : IEntityTypeConfiguration<Player1TrashCard>
{
    public void Configure(EntityTypeBuilder<Player1TrashCard> entity)
    {
        entity.ToTable("player1_trash_cards");
        entity.HasKey(record => record.Id);

        entity.Property(record => record.CardId)
            .IsRequired()
            .HasMaxLength(128);

        entity.Property(record => record.Position)
            .IsRequired();

        entity.HasOne(record => record.GameInstance)
            .WithMany(record => record.Player1TrashCards)
            .HasForeignKey(record => record.GameInstanceId)
            .OnDelete(DeleteBehavior.Cascade);

        entity.HasIndex(record => record.GameInstanceId);
        entity.HasIndex(record => new { record.GameInstanceId, record.Position })
            .IsUnique();
    }
}
