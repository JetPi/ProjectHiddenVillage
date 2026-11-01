using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using ProjectHiddenVillage.Server.Data.Entities;

namespace ProjectHiddenVillage.Server.Data.Configurations;

public sealed class DeckRulesetConfiguration : IEntityTypeConfiguration<DeckRuleset>
{
    internal static readonly Guid StandardRulesetId = Guid.Parse("20000000-0000-0000-0000-000000000001");
    internal static readonly Guid PreReleaseRulesetId = Guid.Parse("20000000-0000-0000-0000-000000000002");
    internal static readonly Guid UnrestrictedRulesetId = Guid.Parse("20000000-0000-0000-0000-000000000003");

    private static readonly DateTimeOffset SeedTimestamp = new(2026, 1, 1, 0, 0, 0, TimeSpan.Zero);

    public void Configure(EntityTypeBuilder<DeckRuleset> entity)
    {
        entity.ToTable("deck_rulesets");
        entity.HasKey(record => record.Id);

        entity.Property(record => record.Key)
            .IsRequired()
            .HasMaxLength(64);

        entity.Property(record => record.Name)
            .IsRequired()
            .HasMaxLength(64);

        entity.HasIndex(record => record.Key)
            .IsUnique();

        entity.HasIndex(record => new { record.IsActive, record.SortOrder });

        // The matchmaker reads this pair on every enqueue, and an inactive format is filtered out of every list, so
        // the two flags the "what may be queued for" question turns on are indexed together.
        entity.HasIndex(record => new { record.IsActive, record.AvailableInQuickMatch });

        entity.HasMany(record => record.CardRestrictions)
            .WithOne(record => record.DeckRuleset)
            .HasForeignKey(record => record.DeckRulesetId)
            .OnDelete(DeleteBehavior.Cascade);

        entity.ToTable(table => table.HasCheckConstraint(
            "CK_deck_rulesets_counts_positive",
            "\"LeaderCount\" > 0 AND \"NonLeaderCardCount\" > 0 AND \"MaxCopiesPerNonLeaderCard\" > 0"));

        // A clock with a zero or negative budget would arm an already-expired deadline and forfeit the table on
        // the first stop, so the ranges are enforced by the database as well as by the service.
        entity.ToTable(table => table.HasCheckConstraint(
            "CK_deck_rulesets_clock_positive",
            "\"MainPhaseSeconds\" > 0 AND \"OtherPhaseSeconds\" > 0 AND \"PlayerPoolSeconds\" > 0 AND \"TimeoutsBeforeForfeit\" > 0"));

        entity.HasData(
            new DeckRuleset
            {
                Id = StandardRulesetId,
                Key = "standard",
                Name = "Standard",
                IsActive = true,
                CardPoolMode = CardPoolMode.Open,
                LeaderCount = 1,
                NonLeaderCardCount = 50,
                MaxCopiesPerNonLeaderCard = 4,
                RequireLeaderColorMatch = true,
                ClockEnabled = true,
                MainPhaseSeconds = 60,
                OtherPhaseSeconds = 30,
                PlayerPoolSeconds = 1800,
                TimeoutsBeforeForfeit = 3,
                SortOrder = 0,
                CreatedAtUtc = SeedTimestamp,
                UpdatedAtUtc = SeedTimestamp,
            },
            new DeckRuleset
            {
                Id = PreReleaseRulesetId,
                Key = "pre-release",
                Name = "Pre-Release",
                IsActive = true,
                // Closed pool: only the revealed sets are playable, so a SAMPLE placeholder stays out of the
                // format even when new placeholders are added to the catalogue. The allow rules live in
                // DeckRulesetCardRestrictionConfiguration.
                CardPoolMode = CardPoolMode.AllowList,
                LeaderCount = 1,
                NonLeaderCardCount = 30,
                MaxCopiesPerNonLeaderCard = 3,
                RequireLeaderColorMatch = true,
                ClockEnabled = true,
                MainPhaseSeconds = 60,
                OtherPhaseSeconds = 30,
                PlayerPoolSeconds = 1800,
                TimeoutsBeforeForfeit = 3,
                SortOrder = 1,
                CreatedAtUtc = SeedTimestamp,
                UpdatedAtUtc = SeedTimestamp,
            },
            // The everything-goes format: same structural limits as Standard, an open pool with no rules, and
            // Chakra and Summon cards allowed. Host-only, because placeholder cards would otherwise reach the
            // matchmaker.
            new DeckRuleset
            {
                Id = UnrestrictedRulesetId,
                Key = "unrestricted",
                Name = "Unrestricted",
                IsActive = true,
                CardPoolMode = CardPoolMode.Open,
                AvailableInQuickMatch = false,
                LeaderCount = 1,
                NonLeaderCardCount = 50,
                MaxCopiesPerNonLeaderCard = 4,
                RequireLeaderColorMatch = true,
                ClockEnabled = true,
                MainPhaseSeconds = 60,
                OtherPhaseSeconds = 30,
                PlayerPoolSeconds = 1800,
                TimeoutsBeforeForfeit = 3,
                SortOrder = 2,
                CreatedAtUtc = SeedTimestamp,
                UpdatedAtUtc = SeedTimestamp,
            });
    }
}
