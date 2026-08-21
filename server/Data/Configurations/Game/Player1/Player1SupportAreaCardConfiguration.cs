using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using ProjectHiddenVillage.Server.Data.Entities;

namespace ProjectHiddenVillage.Server.Data.Configurations;

public sealed class Player1SupportAreaCardConfiguration : IEntityTypeConfiguration<Player1SupportAreaCard>
{
    public void Configure(EntityTypeBuilder<Player1SupportAreaCard> entity)
    {
        entity.ToTable("player1_support_area_cards");
        entity.HasKey(record => record.Id);

        entity.Property(record => record.CardId)
            .IsRequired()
            .HasMaxLength(128);

        entity.Property(record => record.Position)
            .IsRequired();

        entity.HasOne(record => record.GameInstance)
            .WithMany(record => record.Player1SupportAreaCards)
            .HasForeignKey(record => record.GameInstanceId)
            .OnDelete(DeleteBehavior.Cascade);

        entity.HasIndex(record => record.GameInstanceId);
        entity.HasIndex(record => new { record.GameInstanceId, record.Position })
            .IsUnique();

        entity.ToTable(table => table.HasCheckConstraint(
            "CK_player1_support_area_cards_position_range",
            "\"Position\" >= 1 AND \"Position\" <= 5"));
    }
}