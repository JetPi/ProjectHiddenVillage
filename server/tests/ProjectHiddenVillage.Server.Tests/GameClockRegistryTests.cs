using Microsoft.VisualStudio.TestTools.UnitTesting;
using ProjectHiddenVillage.Server.Api.Interfaces.Game;
using ProjectHiddenVillage.Server.Api.Services.Games;
using ProjectHiddenVillage.Server.Engine;

namespace ProjectHiddenVillage.Server.Tests;

/// <summary>
/// The action clock as the engine runs it: who it waits on, what a timeout is allowed to do on a player's behalf,
/// and when a table is declared forfeit. Every deadline here is driven by <see cref="TestClockProvider"/>, so the
/// tests cover minutes of clock behaviour without waiting for them.
/// </summary>
[TestClass]
public sealed class GameClockRegistryTests
{
    private static readonly DateTimeOffset Start = new(2026, 1, 1, 12, 0, 0, TimeSpan.Zero);

    [TestMethod]
    public void Clock_FollowsTheStartingPlayerPrompt()
    {
        var clock = new TestClockProvider(Start);
        var game = CreateGame(CreateRegistry(clock));

        var prompt = game.GetPendingPrompt();
        Assert.IsNotNull(prompt, "The opening prompt is what the clock has to wait on.");
        Assert.IsNotNull(game.Clock);
        Assert.AreEqual(prompt.RequestedPlayerId, game.Clock.OwningPlayerId);
        Assert.AreEqual(GameClockStopKind.OtherStep, game.Clock.StopKind);
        Assert.AreEqual(Start.AddSeconds(30), game.Clock.DeadlineUtc);
    }

    [TestMethod]
    public void Clock_StopsWhileAPhasePresentationIsOutstanding()
    {
        var clock = new TestClockProvider(Start);
        var presence = new GamePresenceTracker();
        var registry = CreateRegistry(clock, presence);
        var game = CreateGame(registry);
        ConnectBothPlayers(presence, game);

        ResolveStartingPrompt(registry, game);

        Assert.IsNotNull(game.PendingPhasePresentation, "The opening deal has to be presented first.");
        Assert.IsNull(
            game.Clock!.OwningPlayerId,
            "Waiting for a client to finish animating is not a player owing an answer.");
        Assert.IsNull(game.Clock.DeadlineUtc);
    }

    [TestMethod]
    public void Clock_ArmsTheMainPhaseBudget_OnceTheDrainReachesTheMainPhase()
    {
        var clock = new TestClockProvider(Start);
        var registry = CreateRegistry(clock);
        var game = CreateGame(registry);

        ResolveOpeningToMainPhase(registry, game);

        Assert.AreEqual(GamePhase.MainPhase, game.State.Phase);
        Assert.AreEqual(game.State.ActivePlayerId, game.Clock!.OwningPlayerId);
        Assert.AreEqual(GameClockStopKind.MainPhase, game.Clock.StopKind);
        Assert.AreEqual(clock.GetUtcNow().AddSeconds(60), game.Clock.DeadlineUtc);
    }

    [TestMethod]
    public void MainPhaseTimeout_EndsTheTurn_WithoutPlayingAnything()
    {
        var clock = new TestClockProvider(Start);
        var registry = CreateRegistry(clock);
        var game = CreateGame(registry);
        ResolveOpeningToMainPhase(registry, game);

        var activePlayerId = game.State.ActivePlayerId;
        var activePlayer = FindPlayer(game, activePlayerId);
        var handBefore = activePlayer.Hand.Count;
        var battlefieldBefore = activePlayer.Battlefield.Count;
        var resourcePoolBefore = activePlayer.ResourcePool;
        var deckBefore = activePlayer.Deck.Count;

        clock.Advance(TimeSpan.FromSeconds(60));

        Assert.IsTrue(
            game.ActionLog.Any(entry => entry.ActionType == "clock_timed_out"),
            "A timeout has to be visible in the log.");
        Assert.AreEqual(
            GamePhase.MainPhase,
            game.State.Phase,
            "The turn should have passed, leaving the opponent in their own main phase.");
        Assert.AreNotEqual(activePlayerId, game.State.ActivePlayerId, "A timed-out main phase ends the turn.");
        Assert.AreEqual(handBefore, activePlayer.Hand.Count, "A timeout never plays a card.");
        Assert.AreEqual(battlefieldBefore, activePlayer.Battlefield.Count, "A timeout never summons a card.");
        Assert.AreEqual(resourcePoolBefore, activePlayer.ResourcePool, "A timeout never spends a resource.");
        Assert.AreEqual(deckBefore, activePlayer.Deck.Count, "A timeout never draws.");
        Assert.AreEqual(game.State.ActivePlayerId, game.Clock!.OwningPlayerId);
    }

    [TestMethod]
    public void ActionStepTimeout_DeclaresThePass_ForThePriorityPlayer()
    {
        var clock = new TestClockProvider(Start);
        var registry = CreateRegistry(clock);
        var game = CreateGame(registry);
        ResolveOpeningToMainPhase(registry, game);

        var activePlayerId = game.State.ActivePlayerId;
        var defenderId = game.State.Players
            .Single(player => !string.Equals(player.PlayerId, activePlayerId, StringComparison.Ordinal))
            .PlayerId;

        // An open cut-in window. Declaring an action hands priority to the other player, so the clock follows the
        // priority holder - whoever the engine is actually waiting on.
        game.State.Phase = GamePhase.ActionStep;
        game.State.PriorityPlayerId = defenderId;
        registry.DeclareActionInActionStep(game.Id, defenderId);

        var priorityPlayerId = game.State.PriorityPlayerId;
        Assert.AreEqual(priorityPlayerId, game.Clock!.OwningPlayerId);
        Assert.AreEqual(GameClockStopKind.OtherStep, game.Clock.StopKind);
        Assert.AreEqual(clock.GetUtcNow().AddSeconds(30), game.Clock.DeadlineUtc);

        var battlefieldBefore = game.State.Players.Sum(player => player.Battlefield.Count);

        clock.Advance(TimeSpan.FromSeconds(30));

        Assert.AreEqual(1, game.Clock.ConsecutiveTimeouts(priorityPlayerId));
        Assert.AreEqual(
            defenderId,
            game.State.PriorityPlayerId,
            "The timeout passes for the player who owed the answer, handing priority back.");
        Assert.AreEqual(GamePhase.ActionStep, game.State.Phase);
        Assert.AreEqual(
            battlefieldBefore,
            game.State.Players.Sum(player => player.Battlefield.Count),
            "Passing is the only thing a timeout may do in a cut-in window.");
        Assert.AreEqual(activePlayerId, game.State.ActivePlayerId);
    }

    [TestMethod]
    public void Timeouts_ForfeitTheGame_AfterTheConfiguredStrikes()
    {
        var clock = new TestClockProvider(Start);
        var registry = CreateRegistry(clock);
        var game = CreateGame(registry);
        ResolveOpeningToMainPhase(registry, game);

        for (var attempt = 0; attempt < 10 && game.State.Outcome is null; attempt++)
        {
            clock.Advance(TimeSpan.FromSeconds(60));
        }

        Assert.IsNotNull(game.State.Outcome, "Three timeouts in a row have to end the game.");
        Assert.AreEqual(GameEndReason.ForfeitByTimeout, game.State.Outcome.Reason);
        Assert.IsNotNull(game.State.Outcome.WinnerPlayerId);

        var loserId = game.State.Outcome.LoserPlayerIds.Single();
        Assert.AreEqual(3, game.Clock!.ConsecutiveTimeouts(loserId));
        Assert.AreEqual(
            3,
            game.ActionLog.Count(entry => entry.ActionType == "clock_timed_out"
                && string.Equals(entry.PlayerId, loserId, StringComparison.Ordinal)));
        Assert.AreNotEqual(loserId, game.State.Outcome.WinnerPlayerId);
        Assert.IsNull(game.Clock.OwningPlayerId, "A finished game has no clock left to run.");
    }

    [TestMethod]
    public void Timeouts_EndTheGame_WhenAPlayersPoolIsSpent()
    {
        var clock = new TestClockProvider(Start);
        var registry = CreateRegistry(
            clock,
            clockOptions: new GameClockOptions
            {
                MainPhaseSeconds = 60,
                OtherPhaseSeconds = 30,
                PlayerPoolSeconds = 60,
                TimeoutsBeforeForfeit = 3,
            });
        var game = CreateGame(registry);
        ResolveOpeningToMainPhase(registry, game);

        var activePlayerId = game.State.ActivePlayerId;

        clock.Advance(TimeSpan.FromSeconds(60));

        Assert.IsNotNull(game.State.Outcome, "A spent pool ends the game immediately.");
        Assert.AreEqual(GameEndReason.ClockExpired, game.State.Outcome.Reason);
        Assert.AreEqual(activePlayerId, game.State.Outcome.LoserPlayerIds.Single());
        Assert.AreEqual(TimeSpan.Zero, game.Clock!.RemainingPool(activePlayerId));
    }

    [TestMethod]
    public void ATimeRelaxedHostedGameArmsNoClockEvenUnderATimedRuleset()
    {
        var clock = new TestClockProvider(Start);
        var registry = CreateRegistry(clock);
        var game = CreateGame(registry);
        // The format keeps its own (timed) policy; the host's modifier is what switches the clock off for this table.
        game.Ruleset = new GameRulesetBinding(
            Guid.Parse("20000000-0000-0000-0000-000000000001"),
            "standard",
            "Standard",
            GameClockPolicy.Standard);
        game.Modifiers = [GameModifierKeys.TimeRelaxed];

        ResolveOpeningToMainPhase(registry, game);

        Assert.AreEqual(GamePhase.MainPhase, game.State.Phase);
        Assert.IsFalse(game.Clock!.IsEnabled);
        Assert.IsNull(game.Clock.DeadlineUtc);

        var phaseBefore = game.State.Phase;
        var activeBefore = game.State.ActivePlayerId;

        // Half an hour of silence cannot move an untimed table.
        clock.Advance(TimeSpan.FromMinutes(30));

        Assert.AreEqual(phaseBefore, game.State.Phase);
        Assert.AreEqual(activeBefore, game.State.ActivePlayerId);
        Assert.IsNull(game.State.Outcome);
        Assert.IsFalse(
            game.ActionLog.Any(entry => entry.ActionType == "clock_timed_out"),
            "An untimed game never times anything out.");
    }

    [TestMethod]
    public void APlayerActingRefreshesTheirStop()
    {
        var clock = new TestClockProvider(Start);
        var registry = CreateRegistry(clock);
        var game = CreateGame(registry);
        ResolveOpeningToMainPhase(registry, game);

        var activePlayerId = game.State.ActivePlayerId;
        var deadlineBefore = game.Clock!.DeadlineUtc;

        // Wait most of the budget, then declare the end step - a real input from the player being timed.
        clock.Advance(TimeSpan.FromSeconds(40));
        registry.DeclareEndStep(game.Id);

        // The end step and the new turn's draw/ready are system steps: the clock stops on them and only starts
        // again when the next player owns a main phase. The player who acted is charged for the time they used,
        // not for the transition.
        Assert.AreEqual(0, game.Clock.ConsecutiveTimeouts(activePlayerId));
        Assert.AreEqual(
            TimeSpan.FromSeconds(1760),
            game.Clock.RemainingPool(activePlayerId),
            $"pools after the end step: p1={game.Clock.RemainingPool("p1")} p2={game.Clock.RemainingPool("p2")} owner={game.Clock.OwningPlayerId} active={activePlayerId}");
        Assert.AreNotEqual(activePlayerId, game.Clock.OwningPlayerId);
        Assert.AreNotEqual(deadlineBefore, game.Clock.DeadlineUtc);
        Assert.AreEqual(GameClockStopKind.MainPhase, game.Clock.StopKind);
    }

    private static InMemoryGameInstanceRegistry CreateRegistry(
        TestClockProvider clock,
        IGamePresenceTracker? presence = null,
        GameClockOptions? clockOptions = null)
    {
        return new InMemoryGameInstanceRegistry(
            new GameInstanceFactory(),
            new GamePhaseService(new GamePhaseStateService()),
            phaseAutomation: new GamePhaseAutomationOptions { Enabled = true, PresentationAckTimeoutMs = 0 },
            presenceTracker: presence,
            stateBroadcaster: null,
            clockOptions: clockOptions ?? new GameClockOptions(),
            timeProvider: clock);
    }

    /// <summary>
    /// Twelve cards each: the opening deal takes five and every turn draws one, so the strikes a test needs to
    /// accumulate never run a deck out and end the game for the wrong reason.
    /// </summary>
    private static GameInstance CreateGame(InMemoryGameInstanceRegistry registry)
    {
        return registry.Create(
            players:
            [
                new Player { Id = "p1", Deck = BuildDeck() },
                new Player { Id = "p2", Deck = BuildDeck() }
            ],
            cardDefinitions: BuildDefinitions("card-1"),
            random: new FixedIndexRandom(0));
    }

    private static List<string> BuildDeck()
    {
        return Enumerable.Repeat("card-1", 12).ToList();
    }

    private static PlayerState FindPlayer(GameInstance game, string playerId)
    {
        return game.State.Players.Single(player =>
            string.Equals(player.PlayerId, playerId, StringComparison.Ordinal));
    }

    private static void ConnectBothPlayers(GamePresenceTracker presence, GameInstance game)
    {
        presence.RegisterConnection(game.Id, "p1", "connection-1");
        presence.RegisterConnection(game.Id, "p2", "connection-2");
    }

    private static void ResolveStartingPrompt(InMemoryGameInstanceRegistry registry, GameInstance game)
    {
        var startingPrompt = game.GetPendingPrompt()
            ?? throw new InvalidOperationException("The game has no starting-player prompt.");
        registry.ResolvePrompt(game.Id, startingPrompt.RequestedPlayerId, "goFirst");
    }

    /// <summary>Walks the opening chain until a player owns the main phase.</summary>
    private static void ResolveOpeningToMainPhase(InMemoryGameInstanceRegistry registry, GameInstance game)
    {
        ResolveStartingPrompt(registry, game);

        for (var guard = 0; guard < 10; guard++)
        {
            if (game.GetPendingPrompt() is { } prompt)
            {
                registry.ResolvePrompt(game.Id, prompt.RequestedPlayerId, "noMulligan");
                continue;
            }

            if (game.State.Phase == GamePhase.MainPhase)
            {
                return;
            }

            throw new InvalidOperationException(
                $"The opening chain stopped on {game.State.Phase} without a prompt.");
        }

        throw new InvalidOperationException("The opening chain never reached the main phase.");
    }

    private static Dictionary<string, Card> BuildDefinitions(params string[] ids)
    {
        return ids.ToDictionary(
            keySelector: id => id,
            elementSelector: id => new Card
            {
                Id = id,
                DisplayName = id,
                Name = [id],
                Type = CardType.Character,
                Traits = [],
                Color = CardColor.Red,
                Description = string.Empty,
                Damage = 2,
                Power = 2,
                Conditions = [],
                Effects = []
            },
            comparer: StringComparer.Ordinal);
    }

    private sealed class FixedIndexRandom(int fixedIndex) : Random
    {
        public override int Next(int maxValue)
        {
            if (maxValue <= 0)
            {
                throw new ArgumentOutOfRangeException(nameof(maxValue), "maxValue must be positive.");
            }

            return fixedIndex % maxValue;
        }
    }
}
