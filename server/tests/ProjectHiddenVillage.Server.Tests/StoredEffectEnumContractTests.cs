using Microsoft.VisualStudio.TestTools.UnitTesting;

namespace ProjectHiddenVillage.Server.Tests;

/// <summary>
/// <c>card_catalog_entries.EffectsJson</c> stores enums as ordinals and the development seeder deliberately never
/// rewrites a row that already exists, so these numbers outlive any later enum edit. Commit <c>3386813</c> removed
/// <c>OriginalId</c> from <see cref="ZoneCardProperty"/> while the members were implicitly numbered; every later
/// member shifted down by one and every stored predicate silently started reading a different property
/// (Name -> Trait, Power -> Damage, Type -> Color, Is Rested -> CannotBeNormalSummoned). That is why
/// N-007's conditional Rush and N-011's Choji/Shikamaru condition stopped working on an existing database while a
/// freshly seeded one was fine.
/// <para>
/// These tests pin the numbers the stored rows rely on, so a future cleanup cannot renumber them silently.
/// </para>
/// </summary>
[TestClass]
public sealed class StoredEffectEnumContractTests
{
    [TestMethod]
    public void ZoneCardProperty_KeepsTheOrdinalsStoredPredicatesWereWrittenWith()
    {
        var pinned = new (ZoneCardProperty Property, int Ordinal)[]
        {
            (ZoneCardProperty.Self, 0),
            (ZoneCardProperty.Id, 1),
            (ZoneCardProperty.DisplayName, 2),
            (ZoneCardProperty.Name, 3),
            (ZoneCardProperty.Trait, 4),
            (ZoneCardProperty.Type, 5),
            (ZoneCardProperty.Color, 6),
            (ZoneCardProperty.Power, 7),
            (ZoneCardProperty.Damage, 8),
            (ZoneCardProperty.Health, 9),
            (ZoneCardProperty.CurrentHealth, 10),
            (ZoneCardProperty.OwnerPlayerId, 11),
            (ZoneCardProperty.ControllerPlayerId, 12),
            (ZoneCardProperty.IsRested, 13),
            (ZoneCardProperty.CannotBeNormalSummoned, 14),
        };

        foreach (var (property, ordinal) in pinned)
        {
            Assert.AreEqual(ordinal, (int)property, $"{property} must keep the stored ordinal {ordinal}.");
        }

        Assert.AreEqual(
            pinned.Length,
            Enum.GetValues<ZoneCardProperty>().Length,
            "ZoneCardProperty gained or lost a member. Stored predicates use these ordinals: give the new member an "
                + "unused number instead of renumbering an existing one, then extend this test.");
    }

    [TestMethod]
    public void RuntimeEffects_KeepsTheOrdinalsStoredNodesWereWrittenWith()
    {
        // The 6/7 gap is the residue of retired members. Reusing it would turn an existing stored node into a
        // different effect, so the numbers are pinned rather than just "whatever Enum assigns next".
        Assert.AreEqual(0, (int)RuntimeEffects.DestroyCard);
        Assert.AreEqual(1, (int)RuntimeEffects.NegateEffect);
        Assert.AreEqual(2, (int)RuntimeEffects.GainEffect);
        Assert.AreEqual(3, (int)RuntimeEffects.ChangeValues);
        Assert.AreEqual(4, (int)RuntimeEffects.AlterResources);
        Assert.AreEqual(5, (int)RuntimeEffects.Tribute);
        Assert.AreEqual(8, (int)RuntimeEffects.SearchCard);
        Assert.AreEqual(9, (int)RuntimeEffects.FreezeCard);
        Assert.AreEqual(10, (int)RuntimeEffects.RevealCard);
        Assert.AreEqual(11, (int)RuntimeEffects.SummonCard);
        Assert.AreEqual(12, (int)RuntimeEffects.InterruptAttack);
        Assert.AreEqual(13, (int)RuntimeEffects.MoveCard);
        Assert.AreEqual(14, (int)RuntimeEffects.LockChakraRecovery);

        var occupied = Enum.GetValues<RuntimeEffects>().Select(value => (int)value).ToList();
        CollectionAssert.DoesNotContain(occupied, 6, "Stored ordinals 6 and 7 are retired and must stay unused.");
        CollectionAssert.DoesNotContain(occupied, 7, "Stored ordinals 6 and 7 are retired and must stay unused.");
    }
}
