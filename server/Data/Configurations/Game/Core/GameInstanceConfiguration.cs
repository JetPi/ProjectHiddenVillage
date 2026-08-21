using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using ProjectHiddenVillage.Server.Data.Entities;
using GameInstanceEntity = ProjectHiddenVillage.Server.Data.Entities.GameInstance;

namespace ProjectHiddenVillage.Server.Data.Configurations;

public sealed class GameInstanceConfiguration : IEntityTypeConfiguration<GameInstanceEntity>
{
    public void Configure(EntityTypeBuilder<GameInstanceEntity> entity)
    {
        entity.ToTable("game_instances");
        entity.HasKey(record => record.Id);

        entity.Property(record => record.JoinCode)
            .IsRequired()
            .HasMaxLength(5);

        entity.HasOne(record => record.Player1User)
            .WithMany(record => record.Player1GameInstances)
            .HasForeignKey(record => record.Player1UserId)
            .OnDelete(DeleteBehavior.Restrict);

        entity.HasOne(record => record.Player2User)
            .WithMany(record => record.Player2GameInstances)
            .HasForeignKey(record => record.Player2UserId)
            .OnDelete(DeleteBehavior.Restrict);

        entity.HasOne(record => record.Player1Deck)
            .WithMany()
            .HasForeignKey(record => record.Player1DeckId)
            .OnDelete(DeleteBehavior.Restrict);

        entity.HasOne(record => record.Player2Deck)
            .WithMany()
            .HasForeignKey(record => record.Player2DeckId)
            .OnDelete(DeleteBehavior.Restrict);

        entity.HasMany(record => record.Player1RuntimeDeckCards)
            .WithOne(record => record.GameInstance)
            .HasForeignKey(record => record.GameInstanceId)
            .OnDelete(DeleteBehavior.Cascade);

        entity.HasMany(record => record.Player1CharacterFieldCards)
            .WithOne(record => record.GameInstance)
            .HasForeignKey(record => record.GameInstanceId)
            .OnDelete(DeleteBehavior.Cascade);

        entity.HasMany(record => record.Player1SupportAreaCards)
            .WithOne(record => record.GameInstance)
            .HasForeignKey(record => record.GameInstanceId)
            .OnDelete(DeleteBehavior.Cascade);

        entity.HasMany(record => record.Player2RuntimeDeckCards)
            .WithOne(record => record.GameInstance)
            .HasForeignKey(record => record.GameInstanceId)
            .OnDelete(DeleteBehavior.Cascade);

        entity.HasMany(record => record.Player2CharacterFieldCards)
            .WithOne(record => record.GameInstance)
            .HasForeignKey(record => record.GameInstanceId)
            .OnDelete(DeleteBehavior.Cascade);

        entity.HasMany(record => record.Player2SupportAreaCards)
            .WithOne(record => record.GameInstance)
            .HasForeignKey(record => record.GameInstanceId)
            .OnDelete(DeleteBehavior.Cascade);

        entity.HasMany(record => record.Player1TrashCards)
            .WithOne(record => record.GameInstance)
            .HasForeignKey(record => record.GameInstanceId)
            .OnDelete(DeleteBehavior.Cascade);

        entity.HasMany(record => record.Player2TrashCards)
            .WithOne(record => record.GameInstance)
            .HasForeignKey(record => record.GameInstanceId)
            .OnDelete(DeleteBehavior.Cascade);

        entity.HasIndex(record => record.Player1UserId);
        entity.HasIndex(record => record.Player2UserId);
        entity.HasIndex(record => record.Player1DeckId);
        entity.HasIndex(record => record.Player2DeckId);
        entity.HasIndex(record => record.JoinCode)
            .IsUnique();

        entity.Property(record => record.Player1CurrentChakras)
            .IsRequired()
            .HasDefaultValueSql("ARRAY[TRUE, TRUE, TRUE, TRUE, TRUE, TRUE]");

        entity.Property(record => record.Player2CurrentChakras)
            .IsRequired()
            .HasDefaultValueSql("ARRAY[TRUE, TRUE, TRUE, TRUE, TRUE, TRUE]");

        entity.Property(record => record.Player1SummonCard)
            .IsRequired()
            .HasDefaultValue(true);

        entity.Property(record => record.Player2SummonCard)
            .IsRequired()
            .HasDefaultValue(true);

        entity.ToTable(table => table.HasCheckConstraint(
            "CK_game_instances_player_users_different",
            "\"Player1UserId\" <> \"Player2UserId\""));

        entity.ToTable(table => table.HasCheckConstraint(
            "CK_game_instances_player_decks_different",
            "\"Player1DeckId\" <> \"Player2DeckId\""));

        entity.ToTable(table => table.HasCheckConstraint(
            "CK_game_instances_player1_current_chakras_length",
            "cardinality(\"Player1CurrentChakras\") = 6"));

        entity.ToTable(table => table.HasCheckConstraint(
            "CK_game_instances_player2_current_chakras_length",
            "cardinality(\"Player2CurrentChakras\") = 6"));

        entity.ToTable(table => table.HasCheckConstraint(
            "CK_game_instances_join_code_format",
            "\"JoinCode\" ~ '^[A-Za-z0-9]{5}$'"));
    }
}
