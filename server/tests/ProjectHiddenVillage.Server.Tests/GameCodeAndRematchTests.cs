using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using ProjectHiddenVillage.Server.Api.Services.Games;
using ProjectHiddenVillage.Server.Api.Services.Rematch;
using ProjectHiddenVillage.Server.Engine;

namespace ProjectHiddenVillage.Server.Tests;

/// <summary>
/// The life cycle of a game code: unique among the tables that are in use, freed when a table is retired, and never
/// handed out while it is still held by a live table, a rematch reservation or the quarantine that follows a
/// retirement.
/// </summary>
[TestClass]
public sealed class GameCodeLifecycleTests
{
    [TestMethod]
    public void PreferredCode_IsClaimedOnce_AndRefusedWhileItIsHeld()
    {
        var allocator = new GameCodeAllocator();

        var first = allocator.Allocate("ABCDE");
        var second = allocator.Allocate("ABCDE");

        Assert.AreEqual(GameCodeAllocationStatus.Allocated, first.Status);
        Assert.AreEqual("ABCDE", first.Code);
        Assert.AreEqual(GameCodeAllocationStatus.InUse, second.Status);
        Assert.IsTrue(allocator.IsClaimed("ABCDE"));
    }

    [TestMethod]
    public void PreferredCode_MustBeFiveAlphanumericCharacters()
    {
        var allocator = new GameCodeAllocator();

        Assert.AreEqual(GameCodeAllocationStatus.InvalidFormat, allocator.Allocate("abc").Status);
        Assert.AreEqual(GameCodeAllocationStatus.InvalidFormat, allocator.Allocate("ABCDEF").Status);
        Assert.AreEqual(GameCodeAllocationStatus.InvalidFormat, allocator.Allocate("AB-DE").Status);
    }

    [TestMethod]
    public void GeneratedCodes_AreUpperCaseAndWellFormed()
    {
        var allocator = new GameCodeAllocator();

        for (var index = 0; index < 64; index++)
        {
            var allocation = allocator.Allocate();

            Assert.AreEqual(GameCodeAllocationStatus.Allocated, allocation.Status);
            Assert.IsTrue(allocator.IsWellFormed(allocation.Code));
            Assert.AreEqual(allocation.Code.ToUpperInvariant(), allocation.Code);
        }
    }

    [TestMethod]
    public void AReleasedCode_IsHeldBackByTheQuarantine_UntilItFallsOutOfIt()
    {
        var allocator = new GameCodeAllocator(quarantineCapacity: 1);

        Assert.AreEqual(GameCodeAllocationStatus.Allocated, allocator.Allocate("ABCDE").Status);
        allocator.Release("ABCDE");

        CollectionAssert.Contains(allocator.QuarantinedCodes.ToArray(), "ABCDE");
        Assert.AreEqual(GameCodeAllocationStatus.InUse, allocator.Allocate("ABCDE").Status);

        // One more retirement pushes the first code out of the small quarantine, so it becomes allocatable again.
        Assert.AreEqual(GameCodeAllocationStatus.Allocated, allocator.Allocate("FGHIJ").Status);
        allocator.Release("FGHIJ");

        Assert.AreEqual(GameCodeAllocationStatus.Allocated, allocator.Allocate("ABCDE").Status);
    }

    [TestMethod]
    public void AReservation_CanHandItsCodeOverToTheTableItBecomes()
    {
        var allocator = new GameCodeAllocator();

        var reserved = allocator.Allocate();
        Assert.AreEqual(GameCodeAllocationStatus.Allocated, reserved.Status);
        Assert.IsTrue(allocator.TryAdopt(reserved.Code));
        Assert.IsFalse(allocator.TryAdopt("ZZZZZ"));
    }

    [TestMethod]
    public void TheRegistry_CreatesUnderAPreferredCode_AndRefusesASecondTableOnTheSameCode()
    {
        var allocator = new GameCodeAllocator();
        var registry = CreateRegistry(allocator);

        var game = registry.Create(
            [new Player { Id = "p1", Deck = ["card-1"] }],
            BuildDefinitions(),
            preferredGameCode: "ABCDE");

        Assert.AreEqual("ABCDE", game.Id);
        Assert.ThrowsException<InvalidOperationException>(() => registry.Create(
            [new Player { Id = "p2", Deck = ["card-1"] }],
            BuildDefinitions(),
            preferredGameCode: "ABCDE"));
    }

    [TestMethod]
    public void RetiringATable_FreesItsCode_ForTheNextTable()
    {
        var allocator = new GameCodeAllocator(quarantineCapacity: 0);
        var registry = CreateRegistry(allocator);

        var first = registry.Create(
            [new Player { Id = "p1", Deck = ["card-1"] }],
            BuildDefinitions(),
            preferredGameCode: "ABCDE");

        Assert.IsTrue(registry.TryRetire(first.Id));
        Assert.IsFalse(registry.TryGet("ABCDE", out _));
        Assert.IsFalse(registry.TryRetire("ABCDE"));

        var second = registry.Create(
            [new Player { Id = "p2", Deck = ["card-1"] }],
            BuildDefinitions(),
            preferredGameCode: "ABCDE");

        Assert.AreEqual("ABCDE", second.Id);
    }

    [TestMethod]
    public void CreateWithReservedCode_RefusesACodeNoReservationHolds()
    {
        var allocator = new GameCodeAllocator();
        var registry = CreateRegistry(allocator);

        Assert.ThrowsException<ArgumentException>(() => registry.CreateWithReservedCode(
            [new Player { Id = "p1", Deck = ["card-1"] }],
            BuildDefinitions(),
            "ABCDE"));
    }

    internal static InMemoryGameInstanceRegistry CreateRegistry(IGameCodeAllocator allocator)
    {
        return new InMemoryGameInstanceRegistry(
            new GameInstanceFactory(),
            new global::ProjectHiddenVillage.Server.Engine.GamePhaseService(
                new global::ProjectHiddenVillage.Server.Engine.GamePhaseStateService()),
            codeAllocator: allocator);
    }

    internal static Dictionary<string, Card> BuildDefinitions()
    {
        return new Dictionary<string, Card>(StringComparer.Ordinal)
        {
            ["card-1"] = new Card
            {
                Id = "card-1",
                DisplayName = "card-1",
                Name = ["card-1"],
                Type = CardType.Character,
                Traits = [],
                Color = CardColor.Red,
                Description = string.Empty,
                Damage = 2,
                Power = 2,
                Conditions = [],
                Effects = [],
            },
        };
    }

    internal sealed class FixedIndexRandom(int fixedIndex) : Random
    {
        public override int Next(int maxValue)
        {
            return maxValue <= 0 ? 0 : fixedIndex % maxValue;
        }
    }

    internal sealed class MutableTimeProvider(DateTimeOffset utcNow) : TimeProvider
    {
        public DateTimeOffset UtcNow { get; set; } = utcNow;

        public override DateTimeOffset GetUtcNow() => UtcNow;

        public void Advance(TimeSpan by) => UtcNow = UtcNow.Add(by);
    }
}

/// <summary>
/// Retirement is what makes a game code reusable, so the sweep has to be exact: it never touches a table somebody is
/// watching, and it does not retire a running game unless a deployment explicitly asks for it.
/// </summary>
[TestClass]
public sealed class GameTableReaperTests
{
    [TestMethod]
    public void AFinishedTable_NobodyIsWatching_IsRetired_AfterTheGrace()
    {
        var allocator = new GameCodeAllocator(quarantineCapacity: 0);
        var registry = GameCodeLifecycleTests.CreateRegistry(allocator);
        var time = new GameCodeLifecycleTests.MutableTimeProvider(DateTimeOffset.UnixEpoch);
        var presence = new GamePresenceTracker();
        var options = new GameRetirementOptions { FinishedGraceSeconds = 60 };
        var reaper = new GameTableReaper(registry, presence, options, time, NullLogger<GameTableReaper>.Instance);

        var game = CreateFinishedGame(registry);

        // The first sweep only starts the clock: nothing is retired on observation.
        Assert.AreEqual(0, reaper.Sweep().Count);
        Assert.IsTrue(registry.TryGet(game.Id, out _));

        time.Advance(TimeSpan.FromSeconds(59));
        Assert.AreEqual(0, reaper.Sweep().Count);
        Assert.IsTrue(registry.TryGet(game.Id, out _));

        time.Advance(TimeSpan.FromSeconds(2));
        CollectionAssert.Contains(reaper.Sweep().ToArray(), game.Id);

        Assert.IsFalse(registry.TryGet(game.Id, out _));
        Assert.IsFalse(allocator.IsClaimed(game.Id));
    }

    [TestMethod]
    public void AFinishedTable_SomebodyIsStillReading_IsNeverRetired()
    {
        var allocator = new GameCodeAllocator(quarantineCapacity: 0);
        var registry = GameCodeLifecycleTests.CreateRegistry(allocator);
        var time = new GameCodeLifecycleTests.MutableTimeProvider(DateTimeOffset.UnixEpoch);
        var presence = new GamePresenceTracker();
        var options = new GameRetirementOptions { FinishedGraceSeconds = 0 };
        var reaper = new GameTableReaper(registry, presence, options, time, NullLogger<GameTableReaper>.Instance);

        var game = CreateFinishedGame(registry);
        presence.RegisterConnection(game.Id, "p1", "connection-1");

        Assert.AreEqual(0, reaper.Sweep().Count);
        time.Advance(TimeSpan.FromMinutes(5));
        Assert.AreEqual(0, reaper.Sweep().Count);
        Assert.IsTrue(registry.TryGet(game.Id, out _));
        Assert.IsTrue(allocator.IsClaimed(game.Id));
    }

    [TestMethod]
    public void ARunningGame_IsKept_EvenWithNobodyConnected()
    {
        var allocator = new GameCodeAllocator(quarantineCapacity: 0);
        var registry = GameCodeLifecycleTests.CreateRegistry(allocator);
        var time = new GameCodeLifecycleTests.MutableTimeProvider(DateTimeOffset.UnixEpoch);
        var presence = new GamePresenceTracker();
        var reaper = new GameTableReaper(registry, presence, new GameRetirementOptions(), time, NullLogger<GameTableReaper>.Instance);

        var game = registry.Create(
            [
                new Player { Id = "p1", Deck = ["card-1"] },
                new Player { Id = "p2", Deck = ["card-1"] },
            ],
            GameCodeLifecycleTests.BuildDefinitions(),
            random: new GameCodeLifecycleTests.FixedIndexRandom(0));

        time.Advance(TimeSpan.FromHours(6));
        Assert.AreEqual(0, reaper.Sweep().Count);
        Assert.IsTrue(registry.TryGet(game.Id, out _));
    }

    [TestMethod]
    public void AHostedTable_NobodyEverJoined_IsRetired_AfterTheAbandonedGrace()
    {
        var allocator = new GameCodeAllocator(quarantineCapacity: 0);
        var registry = GameCodeLifecycleTests.CreateRegistry(allocator);
        var time = new GameCodeLifecycleTests.MutableTimeProvider(DateTimeOffset.UnixEpoch);
        var presence = new GamePresenceTracker();
        var options = new GameRetirementOptions { AbandonedGraceSeconds = 30 };
        var reaper = new GameTableReaper(registry, presence, options, time, NullLogger<GameTableReaper>.Instance);

        var hosted = registry.Create(
            [new Player { Id = "p1", Deck = ["card-1"] }],
            GameCodeLifecycleTests.BuildDefinitions(),
            random: new GameCodeLifecycleTests.FixedIndexRandom(0));

        Assert.AreEqual(0, reaper.Sweep().Count);
        time.Advance(TimeSpan.FromSeconds(31));

        CollectionAssert.Contains(reaper.Sweep().ToArray(), hosted.Id);
        Assert.IsFalse(registry.TryGet(hosted.Id, out _));
    }

    internal static GameInstance CreateFinishedGame(InMemoryGameInstanceRegistry registry)
    {
        var game = registry.Create(
            [
                new Player { Id = "p1", Deck = ["card-1"] },
                new Player { Id = "p2", Deck = ["card-1"] },
            ],
            GameCodeLifecycleTests.BuildDefinitions(),
            random: new GameCodeLifecycleTests.FixedIndexRandom(0));

        game.State.Outcome = new GameOutcome
        {
            WinnerPlayerId = "p1",
            LoserPlayerIds = ["p2"],
            Reason = GameEndReason.Resigned,
            TurnNumber = 4,
        };

        return game;
    }
}

/// <summary>
/// The rematch handshake: two consents on a finished board reserve a table, and everything that must not change
/// between matches - the ruleset binding, its clock policy and the host's modifiers - travels with the reservation.
/// </summary>
[TestClass]
public sealed class RematchHandlingTests
{
    [TestMethod]
    public void MutualConsent_ReservesATable_CarryingTheRulesetAndModifiers()
    {
        var harness = CreateHarness();
        var game = GameTableReaperTests.CreateFinishedGame(harness.Registry);
        var binding = CreateBinding();
        game.Ruleset = binding;
        game.Modifiers = [GameModifierKeys.TimeRelaxed];

        var requested = harness.Service.RequestRematch(game.Id, "p1");

        Assert.IsFalse(requested.IsError);
        Assert.IsNotNull(game.PendingRematch);
        Assert.IsFalse(game.PendingRematch!.IsReserved);

        var accepted = harness.Service.AcceptRematch(game.Id, "p2");

        Assert.IsFalse(accepted.IsError);
        var reservedCode = game.PendingRematch!.ReservedCode;

        Assert.IsNotNull(reservedCode);
        Assert.AreEqual(binding.Name, game.PendingRematch.ReservedRulesetName);
        Assert.IsTrue(harness.Allocator.IsClaimed(reservedCode!));

        var reservation = harness.Service.GetActiveReservation(reservedCode!);

        Assert.IsFalse(reservation.IsError);
        Assert.AreEqual(binding, reservation.Value.Ruleset);
        CollectionAssert.AreEqual(new[] { GameModifierKeys.TimeRelaxed }, reservation.Value.Modifiers.ToArray());
        CollectionAssert.AreEqual(new[] { "p1", "p2" }, reservation.Value.PlayerIds.ToArray());
    }

    [TestMethod]
    public void ARunningGame_CannotOfferARematch()
    {
        var harness = CreateHarness();
        var game = harness.Registry.Create(
            [
                new Player { Id = "p1", Deck = ["card-1"] },
                new Player { Id = "p2", Deck = ["card-1"] },
            ],
            GameCodeLifecycleTests.BuildDefinitions(),
            random: new GameCodeLifecycleTests.FixedIndexRandom(0));

        var result = harness.Service.RequestRematch(game.Id, "p1");

        Assert.IsTrue(result.IsError);
        Assert.AreEqual("Game.Rematch.NotFinished", result.FirstError.Code);
    }

    [TestMethod]
    public void APlayerOutsideTheTable_CannotOfferARematch()
    {
        var harness = CreateHarness();
        var game = GameTableReaperTests.CreateFinishedGame(harness.Registry);

        var result = harness.Service.RequestRematch(game.Id, "intruder");

        Assert.IsTrue(result.IsError);
        Assert.AreEqual("Game.Rematch.Forbidden", result.FirstError.Code);
    }

    [TestMethod]
    public void TheRequester_CannotAnswerTheirOwnOffer()
    {
        var harness = CreateHarness();
        var game = GameTableReaperTests.CreateFinishedGame(harness.Registry);

        harness.Service.RequestRematch(game.Id, "p1");
        var result = harness.Service.AcceptRematch(game.Id, "p1");

        Assert.IsTrue(result.IsError);
        Assert.AreEqual("Game.Rematch.NotAnswerable", result.FirstError.Code);
        Assert.IsNull(game.PendingRematch!.ReservedCode);
    }

    [TestMethod]
    public void ADecline_SettlesTheOffer_ForBothPlayers()
    {
        var harness = CreateHarness();
        var game = GameTableReaperTests.CreateFinishedGame(harness.Registry);

        harness.Service.RequestRematch(game.Id, "p1");
        var declined = harness.Service.DeclineRematch(game.Id, "p2");

        Assert.IsFalse(declined.IsError);
        Assert.IsTrue(game.PendingRematch!.IsDeclined);
        Assert.IsFalse(game.PendingRematch.IsReserved);
        Assert.IsNull(game.PendingRematch.ReservedCode);
    }

    [TestMethod]
    public void AnOffer_NobodyAnswered_IsNotAnswerableOnceItLapses()
    {
        var harness = CreateHarness(consentLifetimeSeconds: 10);
        var game = GameTableReaperTests.CreateFinishedGame(harness.Registry);

        harness.Service.RequestRematch(game.Id, "p1");
        harness.Time.Advance(TimeSpan.FromSeconds(11));

        var result = harness.Service.AcceptRematch(game.Id, "p2");

        Assert.IsTrue(result.IsError);
        Assert.AreEqual("Game.Rematch.NoRequest", result.FirstError.Code);
    }

    [TestMethod]
    public void AnExpiredReservation_IsReportedAsExpired_AndGivesItsCodeBack()
    {
        var harness = CreateHarness(reservationLifetimeSeconds: 30);
        var game = GameTableReaperTests.CreateFinishedGame(harness.Registry);

        harness.Service.RequestRematch(game.Id, "p1");
        harness.Service.AcceptRematch(game.Id, "p2");
        var reservedCode = game.PendingRematch!.ReservedCode!;

        harness.Time.Advance(TimeSpan.FromSeconds(31));

        var lookup = harness.Service.GetActiveReservation(reservedCode);

        Assert.IsTrue(lookup.IsError);
        Assert.AreEqual("Game.Rematch.Expired", lookup.FirstError.Code);
        Assert.IsFalse(harness.Allocator.IsClaimed(reservedCode));
    }

    [TestMethod]
    public void CompletingAReservation_LeavesTheCodeWithTheTableItOpened()
    {
        var harness = CreateHarness();
        var game = GameTableReaperTests.CreateFinishedGame(harness.Registry);

        harness.Service.RequestRematch(game.Id, "p1");
        harness.Service.AcceptRematch(game.Id, "p2");
        var reservedCode = game.PendingRematch!.ReservedCode!;

        harness.Service.CompleteReservation(reservedCode);

        Assert.IsTrue(harness.Service.GetActiveReservation(reservedCode).IsError);
        // The code is still held: the live table owns it from now on, not the reservation.
        Assert.IsTrue(harness.Allocator.IsClaimed(reservedCode));
    }

    [TestMethod]
    public void AReleaseIsDeferred_AndOnlyTheSweepAppliesIt()
    {
        var harness = CreateHarness();
        var reservedCode = ReserveTable(harness);

        Assert.IsFalse(harness.Service.ReleaseReservation(reservedCode, "p1").IsError);

        // Inside the grace nothing happens: this is the window a refresh lives in.
        harness.Time.Advance(TimeSpan.FromSeconds(5));
        Assert.AreEqual(0, harness.Reservations.Prune().Count);
        Assert.IsTrue(harness.Service.GetActiveReservation(reservedCode).Value is not null);

        harness.Time.Advance(TimeSpan.FromSeconds(ReleaseGraceSeconds + 1));

        var drops = harness.Reservations.Prune();

        Assert.AreEqual(1, drops.Count);
        Assert.AreEqual(RematchReservationDropReason.Released, drops[0].Reason);
        Assert.AreEqual("p1", drops[0].ReleasedByPlayerId);
        Assert.IsFalse(drops[0].TableRetired);
        Assert.IsFalse(harness.Allocator.IsClaimed(reservedCode));
        Assert.IsTrue(harness.Service.GetActiveReservation(reservedCode).IsError);
    }

    [TestMethod]
    public void AClaimInsideTheGrace_CancelsTheRelease()
    {
        var harness = CreateHarness();
        var reservedCode = ReserveTable(harness);

        harness.Service.ReleaseReservation(reservedCode, "p1");
        harness.Time.Advance(TimeSpan.FromSeconds(5));

        var claim = harness.Service.GetActiveReservation(reservedCode, "p2", cancelsPendingRelease: true);
        Assert.IsFalse(claim.IsError);

        harness.Time.Advance(TimeSpan.FromSeconds(ReleaseGraceSeconds + 1));

        Assert.AreEqual(0, harness.Reservations.Prune().Count);
        Assert.IsTrue(harness.Allocator.IsClaimed(reservedCode));
    }

    [TestMethod]
    public void TheReleasingPlayerComingBack_CancelsTheRelease()
    {
        var harness = CreateHarness();
        var reservedCode = ReserveTable(harness);

        harness.Service.ReleaseReservation(reservedCode, "p1");
        harness.Time.Advance(TimeSpan.FromSeconds(5));

        // A reload: the same player probes the reservation again, with no claim involved.
        Assert.IsFalse(harness.Service.GetActiveReservation(reservedCode, "p1").IsError);

        harness.Time.Advance(TimeSpan.FromSeconds(ReleaseGraceSeconds + 1));

        Assert.AreEqual(0, harness.Reservations.Prune().Count);
    }

    [TestMethod]
    public void TheOpponentLooking_DoesNotCancelTheRelease()
    {
        var harness = CreateHarness();
        var reservedCode = ReserveTable(harness);

        harness.Service.ReleaseReservation(reservedCode, "p1");
        harness.Time.Advance(TimeSpan.FromSeconds(5));

        // Watching a banner is not a commitment, so the opponent's own probe changes nothing.
        Assert.IsFalse(harness.Service.GetActiveReservation(reservedCode, "p2").IsError);

        harness.Time.Advance(TimeSpan.FromSeconds(ReleaseGraceSeconds + 1));

        var drops = harness.Reservations.Prune();

        Assert.AreEqual(1, drops.Count);
        Assert.AreEqual(RematchReservationDropReason.Released, drops[0].Reason);
    }

    [TestMethod]
    public void AReleaseWhileATableWaitsForItsOpponent_RetiresThatTable()
    {
        var harness = CreateHarness();
        var reservedCode = ReserveTable(harness);

        // The first claim opened the table: one seat is taken and the opponent walked away instead of joining.
        harness.Registry.CreateWithReservedCode(
            [new Player { Id = "p1", Deck = ["card-1"] }],
            GameCodeLifecycleTests.BuildDefinitions(),
            reservedCode,
            random: new GameCodeLifecycleTests.FixedIndexRandom(0));

        harness.Service.ReleaseReservation(reservedCode, "p2");
        harness.Time.Advance(TimeSpan.FromSeconds(ReleaseGraceSeconds + 1));

        var drops = harness.Reservations.Prune();

        Assert.AreEqual(1, drops.Count);
        Assert.IsTrue(drops[0].TableRetired, "The abandoned table must go with the agreement.");
        Assert.IsFalse(harness.Registry.TryGet(reservedCode, out _));
        Assert.IsFalse(harness.Allocator.IsClaimed(reservedCode));
    }

    [TestMethod]
    public void APlayerOutsideThePair_CannotReleaseTheReservation()
    {
        var harness = CreateHarness();
        var reservedCode = ReserveTable(harness);

        var result = harness.Service.ReleaseReservation(reservedCode, "intruder");

        Assert.IsTrue(result.IsError);
        Assert.AreEqual("Game.Rematch.Forbidden", result.FirstError.Code);
        Assert.AreEqual(0, harness.Reservations.Prune().Count);
    }

    [TestMethod]
    public void ReleasingTwice_IsNotAnError()
    {
        var harness = CreateHarness();
        var reservedCode = ReserveTable(harness);

        Assert.IsFalse(harness.Service.ReleaseReservation(reservedCode, "p1").IsError);
        Assert.IsFalse(harness.Service.ReleaseReservation(reservedCode, "p1").IsError);
    }

    [TestMethod]
    public void MovingOn_DropsOnlyThatPlayersReservations_ExceptTheCodeBeingClaimed()
    {
        var harness = CreateHarness();
        var first = ReserveTable(harness);
        var second = ReserveTable(harness);

        var dropped = harness.Service.ReleaseReservationsForPlayer("p1", exceptGameCode: second);

        CollectionAssert.AreEqual(new[] { first }, dropped.ToArray());
        Assert.IsFalse(harness.Allocator.IsClaimed(first));
        Assert.IsTrue(harness.Allocator.IsClaimed(second), "The code being claimed must survive the move-on rule.");
    }

    /// <summary>Reserves a table the same way the handshake does, and returns its code.</summary>
    private static string ReserveTable(RematchHarness harness)
    {
        var game = GameTableReaperTests.CreateFinishedGame(harness.Registry);
        harness.Service.RequestRematch(game.Id, "p1");
        harness.Service.AcceptRematch(game.Id, "p2");

        return game.PendingRematch!.ReservedCode!;
    }

    private const int ReleaseGraceSeconds = 20;

    private static GameRulesetBinding CreateBinding()
    {
        return new GameRulesetBinding(
            Id: Guid.NewGuid(),
            Key: "standard",
            Name: "Standard",
            Clock: new GameClockOptions().DefaultPolicy);
    }

    private static RematchHarness CreateHarness(
        int consentLifetimeSeconds = 120,
        int reservationLifetimeSeconds = 900)
    {
        var allocator = new GameCodeAllocator(quarantineCapacity: 0);
        var registry = GameCodeLifecycleTests.CreateRegistry(allocator);
        var time = new GameCodeLifecycleTests.MutableTimeProvider(DateTimeOffset.UnixEpoch);
        var reservations = new RematchReservationStore(allocator, registry, time);

        var service = new RematchHandlingService(
            registry,
            reservations,
            allocator,
            new RematchOptions
            {
                ConsentLifetimeSeconds = consentLifetimeSeconds,
                ReservationLifetimeSeconds = reservationLifetimeSeconds,
                ReleaseGraceSeconds = ReleaseGraceSeconds,
            },
            time);

        return new RematchHarness(registry, allocator, reservations, service, time);
    }

    private sealed record RematchHarness(
        InMemoryGameInstanceRegistry Registry,
        IGameCodeAllocator Allocator,
        RematchReservationStore Reservations,
        RematchHandlingService Service,
        GameCodeLifecycleTests.MutableTimeProvider Time);
}
