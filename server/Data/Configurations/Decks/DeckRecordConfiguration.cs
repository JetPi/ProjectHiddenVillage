using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using ProjectHiddenVillage.Server.Data.Entities;

namespace ProjectHiddenVillage.Server.Data.Configurations;

public sealed class DeckRecordConfiguration : IEntityTypeConfiguration<DeckRecord>
{
    public void Configure(EntityTypeBuilder<DeckRecord> entity)
    {
        entity.ToTable("deck_records");

        // The pair is the identity: one row per player per deck. The recorder upserts against exactly this key,
        // which is also what makes a concurrent increment safe (see DeckRecordRecorder).
        entity.HasKey(record => new { record.DeckId, record.UserId });

        entity.HasOne(record => record.Deck)
            .WithMany()
            .HasForeignKey(record => record.DeckId)
            .OnDelete(DeleteBehavior.Cascade);

        // A guest's rows die with the guest: the retention sweeper deletes the user and the record follows.
        entity.HasOne(record => record.User)
            .WithMany()
            .HasForeignKey(record => record.UserId)
            .OnDelete(DeleteBehavior.Cascade);

        entity.HasIndex(record => record.UserId);

        entity.ToTable(table => table.HasCheckConstraint(
            "CK_deck_records_counters_non_negative",
            "\"Wins\" >= 0 AND \"Losses\" >= 0 AND \"Draws\" >= 0"));
    }
}
