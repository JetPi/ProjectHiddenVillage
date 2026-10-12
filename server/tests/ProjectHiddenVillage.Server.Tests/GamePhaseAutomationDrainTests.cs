using ProjectHiddenVillage.Server.Api.Interfaces.Game;
using ProjectHiddenVillage.Server.Api.Services.Games;
using ProjectHiddenVillage.Server.Engine;
using Microsoft.VisualStudio.TestTools.UnitTesting;

namespace ProjectHiddenVillage.Server.Tests;

/// <summary>
/// The engine owning the non-interactive phases: it walks them itself, stops on the transitions a client has to
/// present, and resumes when every connected participant has acknowledged. See
/// <c>plans/server-owned-phase-transitions.md</c>.
/// </summary>
[TestClass]
public sealed class GamePhaseAutomationDrainTests
{
    [TestMethod]
    public void Drain_StopsOnTheOpeningDealAndWaitsForEveryAcknowledgement()
    {
        var presence = new GamePresenceTracker();
        var broadcaster = new RecordingGameStateBroadcaster();
        var registry = CreateRegistry(presence, broadcaster);
        var game = CreateGame(registry);
        ConnectBothPlayers(presence, game);

        ResolveStartingPrompt(registry, game);

        var presentation = game.PendingPhasePresentation;
        Assert.IsNotNull(presentation, "The opening deal has to be presented before the next phase.");
        Assert.AreEqual(GamePhase.DrawInitialHand, game.State.Phase);
        Assert.AreEqual(PhasePresentationKind.InitialDeal, presentation.Kind);
        CollectionAssert.AreEquivalent(new[] { "p1", "p2" }, presentation.RequiredAckPlayerIds.ToArray());

        // One client finishing is not enough: the other board is still animating.
        registry.AcknowledgePhasePresentation(game.Id, "p1", presentation.PresentationId);
        Assert.IsNotNull(game.PendingPhasePresentation);
        Assert.AreEqual(GamePhase.DrawInitialHand, game.State.Phase);

        // The last acknowledgement lets the engine walk on - into the mulligan, which is a decision, so the
        // drain stops on its prompt instead of a presentation.
        registry.AcknowledgePhasePresentation(game.Id, "p2", presentation.PresentationId);
        Assert.IsNull(game.PendingPhasePresentation);
        Assert.AreEqual(GamePhase.Mulligan, game.State.Phase);
        Assert.IsNotNull(game.GetPendingPrompt());
    }

    [TestMethod]
    public void Drain_WalksToTheMainPhaseOnceEveryPresentationIsAcknowledged()
    {
        var presence = new GamePresenceTracker();
        var registry = CreateRegistry(presence, new RecordingGameStateBroadcaster());
        var game = CreateGame(registry);
        ConnectBothPlayers(presence, game);

        ResolveStartingPrompt(registry, game);
        AcknowledgeAll(registry, game);

        ResolveMulliganPrompt(registry, game);

        // Mulligan -> StartOfMainPhase -> DrawPhase: the draw is worth showing, so the engine stops again.
        Assert.AreEqual(PhasePresentationKind.Draw, game.PendingPhasePresentation!.Kind);
        Assert.AreEqual(GamePhase.DrawPhase, game.State.Phase);
        AcknowledgeAll(registry, game);

        // DrawPhase -> RefreshPhase: the cards standing up are worth showing too.
        Assert.AreEqual(PhasePresentationKind.Ready, game.PendingPhasePresentation!.Kind);
        Assert.AreEqual(GamePhase.RefreshPhase, game.State.Phase);
        AcknowledgeAll(registry, game);

        // RefreshPhase -> MainPhase is a phase a player owns: the walk is over and nothing is presented.
        Assert.IsNull(game.PendingPhasePresentation);
        Assert.AreEqual(GamePhase.MainPhase, game.State.Phase);
        Assert.AreEqual(1, game.State.TurnNumber);
    }

    [TestMethod]
    public void Drain_PresentsTheTurnEndBeforeTheTurnChangesHands()
    {
        var presence = new GamePresenceTracker();
        var registry = CreateRegistry(presence, new RecordingGameStateBroadcaster());
        var game = CreateGame(registry);
        ConnectBothPlayers(presence, game);

        ResolveStartingPrompt(registry, game);
        AdvanceToMainPhase(registry, game);

        var activePlayerBeforeTurnEnd = game.State.ActivePlayerId;
        registry.DeclareEndStep(game.Id);

        // The turn boundary is shown before it happens: the swap is part of the presentation.
        Assert.AreEqual(PhasePresentationKind.TurnEnd, game.PendingPhasePresentation!.Kind);
        Assert.AreEqual(GamePhase.EndStep, game.State.Phase);
        Assert.AreEqual(1, game.State.TurnNumber);
        Assert.AreEqual(activePlayerBeforeTurnEnd, game.State.ActivePlayerId);

        AcknowledgeAll(registry, game);

        // EndStep -> CompleteEndStep -> StartOfMainPhase -> DrawPhase: exactly one turn swap, and the new turn's
        // draw waits for its own acknowledgement.
        Assert.AreEqual(2, game.State.TurnNumber);
        Assert.AreNotEqual(activePlayerBeforeTurnEnd, game.State.ActivePlayerId);
        Assert.AreEqual(GamePhase.DrawPhase, game.State.Phase);
        Assert.AreEqual(PhasePresentationKind.Draw, game.PendingPhasePresentation!.Kind);
        Assert.AreEqual(2, game.PendingPhasePresentation.TurnNumber);
    }

    [TestMethod]
    public void PresentationWatchdog_ResumesOnItsOwnAndNotifiesTheClients()
    {
        var presence = new GamePresenceTracker();
        var broadcaster = new RecordingGameStateBroadcaster();
        var registry = CreateRegistry(presence, broadcaster, presentationAckTimeoutMs: 40);
        var game = CreateGame(registry);
        ConnectBothPlayers(presence, game);

        ResolveStartingPrompt(registry, game);
        Assert.IsNotNull(game.PendingPhasePresentation);

        // Nobody acknowledges: the watchdog has to free the table instead of waiting for a client that is gone.
        var resumed = SpinWait.SpinUntil(
            () => game.PendingPhasePresentation is null,
            TimeSpan.FromSeconds(5));

        Assert.IsTrue(resumed, "The presentation watchdog never resumed the drain.");
        Assert.IsTrue(
            game.ActionLog.Any(entry => entry.ActionType == "phase_presentation_timed_out"),
            "A timed-out presentation has to be visible in the log.");
        Assert.IsTrue(
            broadcaster.NotifiedGameIds.Contains(game.Id),
            "A timeout resumes outside any hub call, so the clients have to be told to pull the state.");
    }

    [TestMethod]
    public void ReleasePhasePresentationRequirement_ResumesOnceNobodyIsLeftToAcknowledge()
    {
        var presence = new GamePresenceTracker();
        var broadcaster = new RecordingGameStateBroadcaster();
        var registry = CreateRegistry(presence, broadcaster);
        var game = CreateGame(registry);
        ConnectBothPlayers(presence, game);

        ResolveStartingPrompt(registry, game);
        Assert.IsNotNull(game.PendingPhasePresentation);

        registry.ReleasePhasePresentationRequirement(game.Id, "p1");

        Assert.IsNotNull(
            game.PendingPhasePresentation,
            "One participant leaving while the other still owes an acknowledgement is not a resume.");
        Assert.AreEqual(
            GamePhase.DrawInitialHand,
            game.State.Phase,
            "The engine is still parked on the phase it is presenting to the remaining client.");

        registry.ReleasePhasePresentationRequirement(game.Id, "p2");

        Assert.IsNull(game.PendingPhasePresentation);
        Assert.AreEqual(GamePhase.Mulligan, game.State.Phase);
        Assert.IsTrue(broadcaster.NotifiedGameIds.Contains(game.Id));
    }

    [TestMethod]
    public void Drain_KeepsWalkingWhenNobodyIsConnected()
    {
        var presence = new GamePresenceTracker();
        var registry = CreateRegistry(presence, new RecordingGameStateBroadcaster());
        var game = CreateGame(registry);

        ResolveStartingPrompt(registry, game);

        // Nobody is watching, so there is nothing to present to: the engine walks to the first decision.
        Assert.IsNull(game.PendingPhasePresentation);
        Assert.AreEqual(GamePhase.Mulligan, game.State.Phase);
    }

    [TestMethod]
    public void WithTheAutomationOff_TheEngineLeavesThePhasesToTheClient()
    {
        var registry = new InMemoryGameInstanceRegistry(
            new GameInstanceFactory(),
            new GamePhaseService(new GamePhaseStateService()),
            phaseAutomation: new GamePhaseAutomationOptions { Enabled = false });
        var game = CreateGame(registry);

        ResolveStartingPrompt(registry, game);

        // The pre-presentation behaviour: nothing is advanced and nothing is presented.
        Assert.IsNull(game.PendingPhasePresentation);
        Assert.AreEqual(GamePhase.DrawInitialHand, game.State.Phase);
    }

    private static InMemoryGameInstanceRegistry CreateRegistry(
        GamePresenceTracker presence,
        RecordingGameStateBroadcaster broadcaster,
        int presentationAckTimeoutMs = 0)
    {
        return new InMemoryGameInstanceRegistry(
            new GameInstanceFactory(),
            new GamePhaseService(new GamePhaseStateService()),
            phaseAutomation: new GamePhaseAutomationOptions
            {
                Enabled = true,
                PresentationAckTimeoutMs = presentationAckTimeoutMs,
            },
            presenceTracker: presence,
            stateBroadcaster: broadcaster);
    }

    private static GameInstance CreateGame(InMemoryGameInstanceRegistry registry)
    {
        // Twelve cards each: the opening deal takes five and every turn draws one, so a two-turn game never
        // decks out and ends early (which would legitimately skip the presentations that follow).
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

    private static void ResolveMulliganPrompt(InMemoryGameInstanceRegistry registry, GameInstance game)
    {
        var mulliganPrompt = game.GetPendingPrompt()
            ?? throw new InvalidOperationException("The game has no mulligan prompt.");
        registry.ResolvePrompt(game.Id, mulliganPrompt.RequestedPlayerId, "noMulligan");
    }

    private static void AcknowledgeAll(InMemoryGameInstanceRegistry registry, GameInstance game)
    {
        var presentation = game.PendingPhasePresentation
            ?? throw new InvalidOperationException("There is no presentation to acknowledge.");

        foreach (var playerId in presentation.RequiredAckPlayerIds.ToArray())
        {
            registry.AcknowledgePhasePresentation(game.Id, playerId, presentation.PresentationId);
        }
    }

    /// <summary>
    /// Walks the opening chain (the starting-player prompt has to be resolved already) by acknowledging
    /// presentations and resolving the mulligan, until a phase a player owns is reached.
    /// </summary>
    private static void AdvanceToMainPhase(InMemoryGameInstanceRegistry registry, GameInstance game)
    {
        for (var guard = 0; guard < 10; guard++)
        {
            if (game.PendingPhasePresentation is not null)
            {
                AcknowledgeAll(registry, game);
                continue;
            }

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
                $"The drain stopped on {game.State.Phase} without a prompt or a presentation.");
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

    private sealed class RecordingGameStateBroadcaster : IGameStateBroadcaster
    {
        private readonly List<string> notifiedGameIds = [];

        public string[] NotifiedGameIds
        {
            get
            {
                lock (notifiedGameIds)
                {
                    return [.. notifiedGameIds];
                }
            }
        }

        public Task NotifyGameStateInvalidatedAsync(string gameId)
        {
            lock (notifiedGameIds)
            {
                notifiedGameIds.Add(gameId);
            }

            return Task.CompletedTask;
        }
    }
}
