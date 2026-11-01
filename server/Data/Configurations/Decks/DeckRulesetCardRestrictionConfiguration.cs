using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using ProjectHiddenVillage.Server.Data.Entities;

namespace ProjectHiddenVillage.Server.Data.Configurations;

public sealed class DeckRulesetCardRestrictionConfiguration : IEntityTypeConfiguration<DeckRulesetCardRestriction>
{
    /// <summary>Mirrors the <c>Code</c> column. A card code is the longest value a rule ever holds.</summary>
    internal const int MaxCodeLength = 32;

    // The Pre-Release allow list. Fixed ids so a fresh database and a migrated database agree; the format is
    // seeded closed, so without them every deck would fail it. A set rule carries no copy cap, so each one stores
    // DeckRulesetCardRule.UnlimitedCopies - the same value the service would write for an allow-list format.
    private static readonly Guid PreReleaseSetNCardRuleId = Guid.Parse("30000000-0000-0000-0000-000000000001");
    private static readonly Guid PreReleaseSetCCardRuleId = Guid.Parse("30000000-0000-0000-0000-000000000002");
    private static readonly Guid PreReleaseSetCpCardRuleId = Guid.Parse("30000000-0000-0000-0000-000000000003");
    private static readonly Guid PreReleaseSetSCardRuleId = Guid.Parse("30000000-0000-0000-0000-000000000004");

    public void Configure(EntityTypeBuilder<DeckRulesetCardRestriction> entity)
    {
        entity.ToTable("deck_ruleset_card_restrictions");
        entity.HasKey(record => record.Id);

        entity.Property(record => record.Code)
            .IsRequired()
            .HasMaxLength(MaxCodeLength);

        entity.Property(record => record.MaxCopies)
            .IsRequired();

        // A rule names a code, not a catalogue row, so the matcher pair is the natural key. Two rules for the
        // same (set, card) code would leave precedence undefined.
        entity.HasIndex(record => new { record.DeckRulesetId, record.MatchType, record.Code })
            .IsUnique();

        entity.ToTable(table => table.HasCheckConstraint(
            "CK_deck_ruleset_card_restrictions_max_copies_non_negative",
            "\"MaxCopies\" >= 0"));

        entity.HasData(
            new DeckRulesetCardRestriction
            {
                Id = PreReleaseSetNCardRuleId,
                DeckRulesetId = DeckRulesetConfiguration.PreReleaseRulesetId,
                MatchType = CardRestrictionMatchType.Set,
                Code = "N",
                MaxCopies = DeckRulesetCardRule.UnlimitedCopies,
            },
            new DeckRulesetCardRestriction
            {
                Id = PreReleaseSetCCardRuleId,
                DeckRulesetId = DeckRulesetConfiguration.PreReleaseRulesetId,
                MatchType = CardRestrictionMatchType.Set,
                Code = "C",
                MaxCopies = DeckRulesetCardRule.UnlimitedCopies,
            },
            new DeckRulesetCardRestriction
            {
                Id = PreReleaseSetCpCardRuleId,
                DeckRulesetId = DeckRulesetConfiguration.PreReleaseRulesetId,
                MatchType = CardRestrictionMatchType.Set,
                Code = "CP",
                MaxCopies = DeckRulesetCardRule.UnlimitedCopies,
            },
            new DeckRulesetCardRestriction
            {
                Id = PreReleaseSetSCardRuleId,
                DeckRulesetId = DeckRulesetConfiguration.PreReleaseRulesetId,
                MatchType = CardRestrictionMatchType.Set,
                Code = "S",
                MaxCopies = DeckRulesetCardRule.UnlimitedCopies,
            });
    }
}
