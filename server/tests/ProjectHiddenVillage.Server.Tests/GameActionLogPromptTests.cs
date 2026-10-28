using Microsoft.VisualStudio.TestTools.UnitTesting;
using ProjectHiddenVillage.Server.Api.Services.Games;

namespace ProjectHiddenVillage.Server.Tests;

/// <summary>
/// A resolved prompt is not automatically an answer somebody gave: a reveal presentation is a prompt only because the
/// engine needs to pause the table while a card is shown, and a timed-out stop is answered by the engine on the
/// player's behalf. These tests pin the difference in the log, plus the turn context every entry carries.
/// </summary>
[TestClass]
public sealed class GameActionLogPromptTests
{
    [TestMethod]
    public void ResolvePrompt_ForARevealPresentation_LogsTheRevealInsteadOfAPromptAnswer()
    {
        var game = CreateGame();
        game.State.Players[0].Hand.Add(new CardInstance
        {
            InstanceId = "reveal-1",
            CardDefinitionId = "card-1",
            OwnerPlayerId = "p1",
            ControllerPlayerId = "p1",
        });

        var prompt = CreateRevealPrompt();
        game.EnqueuePrompt(prompt);

        game.ResolvePrompt("p1", ReactiveEffectExecutionConstants.RevealPresentedOption);

        var revealEntry = game.ActionLog.Single(entry =>
            entry.ActionType == GameActionLogActionTypes.RevealPresented);

        // The card is named from the engine's own definitions, and no option is recorded: nobody chose anything.
        Assert.AreEqual("Revealed Card", revealEntry.Metadata["displayName"]);
        Assert.AreEqual("reveal-1", revealEntry.Metadata["cardInstanceId"]);
        Assert.AreEqual(nameof(EffectSelectionPromptKind.RevealPresentation), revealEntry.Metadata["selectionPromptKind"]);
        Assert.IsFalse(revealEntry.Metadata.ContainsKey("selectedOption"));
        Assert.IsFalse(game.ActionLog.Any(entry => entry.ActionType == GameActionLogActionTypes.PromptResolved));
    }

    [TestMethod]
    public void ResolvePrompt_ForARealAnswer_RecordsThePromptKindAndTheOption()
    {
        var game = CreateGame();
        game.EnqueuePrompt(CreateMulliganPrompt());

        game.ResolvePrompt("p2", "noMulligan");

        var entry = game.ActionLog.Single(entry =>
            entry.ActionType == GameActionLogActionTypes.PromptResolved);

        Assert.AreEqual(nameof(GamePromptType.Mulligan), entry.Metadata["promptType"]);
        Assert.AreEqual("noMulligan", entry.Metadata["selectedOption"]);
        Assert.AreEqual(bool.FalseString, entry.Metadata["resolvedByTimeout"]);
    }

    [TestMethod]
    public void ResolvePrompt_OnThePlayersBehalf_IsMarkedAsATimeoutAnswer()
    {
        var game = CreateGame();
        game.EnqueuePrompt(CreateMulliganPrompt());

        game.ResolvePrompt("p2", "noMulligan", resolvedByTimeout: true);

        var entry = game.ActionLog.Single(entry =>
            entry.ActionType == GameActionLogActionTypes.PromptResolved);

        Assert.AreEqual(bool.TrueString, entry.Metadata["resolvedByTimeout"]);
    }

    [TestMethod]
    public void ResolvePrompt_ForASelectionInAPublicZone_NamesTheChosenCard()
    {
        var game = CreateGame();
        game.State.Players[0].Battlefield.Add(new CardInstance
        {
            InstanceId = "field-1",
            CardDefinitionId = "card-1",
            OwnerPlayerId = "p1",
            ControllerPlayerId = "p1",
        });

        game.EnqueuePrompt(CreateSelectionPrompt(PlayerZone.CharacterField, "field-1"));
        game.ResolvePrompt("p1", "field-1");

        var entry = game.ActionLog.Single(logEntry =>
            logEntry.ActionType == GameActionLogActionTypes.PromptResolved);

        Assert.AreEqual("field-1", entry.Metadata["cardInstanceId"]);
        Assert.AreEqual("Revealed Card", entry.Metadata["displayName"]);
    }

    [TestMethod]
    public void ResolvePrompt_ForASelectionFromAHand_KeepsTheCardNameOutOfTheSharedLog()
    {
        var game = CreateGame();
        game.State.Players[0].Hand.Add(new CardInstance
        {
            InstanceId = "hand-1",
            CardDefinitionId = "card-1",
            OwnerPlayerId = "p1",
            ControllerPlayerId = "p1",
        });

        game.EnqueuePrompt(CreateSelectionPrompt(PlayerZone.Hand, "hand-1"));
        game.ResolvePrompt("p1", "hand-1");

        var entry = game.ActionLog.Single(logEntry =>
            logEntry.ActionType == GameActionLogActionTypes.PromptResolved);

        // The opponent may see that a selection happened, but a card chosen from hand is still hidden information.
        Assert.AreEqual("hand-1", entry.Metadata["cardInstanceId"]);
        Assert.IsFalse(entry.Metadata.ContainsKey("displayName"));
    }

    [TestMethod]
    public void AddActionLogEntry_StampsTheTurnOwnerAndThatOwnersTurnOrdinal()
    {
        var game = CreateGame();
        game.State.TurnNumber = 7;
        game.State.ActivePlayerId = "p2";
        game.State.Players[1].TurnCount = 4;

        // The global turn number counts every player's turn in sequence, so the ordinal is what lets the log group
        // "all of the opponent's turn 4" - and it must be stamped even when the caller says nothing about the turn.
        var entry = game.AddActionLogEntry(
            actionType: GameActionLogActionTypes.PhaseStarted,
            message: "Phase MainPhase started.",
            playerId: "p1",
            category: GameActionLogCategory.Phase);

        Assert.AreEqual("7", entry.Metadata["turnNumber"]);
        Assert.AreEqual("p2", entry.Metadata["activePlayerId"]);
        Assert.AreEqual("4", entry.Metadata["turnOwnerTurnCount"]);
        Assert.AreEqual(nameof(GamePhase.MainPhase), entry.Metadata["phase"]);
    }

    private static GamePrompt CreateRevealPrompt()
    {
        var continuation = new PendingEffectContinuation
        {
            ResumeNodeId = string.Empty,
            ActingPlayerId = "p1",
            SourceCardDefinitionId = "card-1",
            RevealPresentation = new PendingRevealPresentation
            {
                PresentedTargets = [new GameEffectTargetReference("p1", PlayerZone.Hand, "reveal-1")],
            },
        };

        var prompt = new GamePrompt
        {
            Type = GamePromptType.Effect,
            RequestedPlayerId = "p1",
            Options = [ReactiveEffectExecutionConstants.RevealPresentedOption],
            SelectionPromptKind = EffectSelectionPromptKind.RevealPresentation,
            CandidateZone = PlayerZone.Hand,
            CandidatePlayerId = "p1",
            MinimumSelection = 1,
            MaximumSelection = 1,
            EffectContinuation = continuation,
        };

        continuation.PromptId = prompt.PromptId;
        return prompt;
    }

    private static GamePrompt CreateSelectionPrompt(PlayerZone zone, string option)
    {
        var continuation = new PendingEffectContinuation
        {
            ResumeNodeId = string.Empty,
            ActingPlayerId = "p1",
            SourceCardDefinitionId = "card-1",
        };

        var prompt = new GamePrompt
        {
            Type = GamePromptType.Effect,
            RequestedPlayerId = "p1",
            Options = [option],
            SelectionPromptKind = EffectSelectionPromptKind.Generic,
            CandidateZone = zone,
            CandidatePlayerId = "p1",
            MinimumSelection = 1,
            MaximumSelection = 1,
            EffectContinuation = continuation,
        };

        continuation.PromptId = prompt.PromptId;
        return prompt;
    }

    private static GamePrompt CreateMulliganPrompt()
    {
        return new GamePrompt
        {
            Type = GamePromptType.Mulligan,
            RequestedPlayerId = "p2",
            Options = ["mulligan", "noMulligan"],
        };
    }

    private static GameInstance CreateGame()
    {
        return new GameInstance(new GameState
        {
            GameId = "game-action-log-prompts-1",
            Phase = GamePhase.MainPhase,
            ActivePlayerId = "p1",
            PriorityPlayerId = "p1",
            CardDefinitions = new Dictionary<string, Card>(StringComparer.Ordinal)
            {
                ["leader-def"] = new LeaderCard
                {
                    Id = "leader-def",
                    DisplayName = "Leader",
                    Name = ["Leader"],
                    Type = CardType.Leader,
                    Color = CardColor.Blue,
                    Traits = ["Leader"],
                    Life = 5,
                    RecoveryEffect = "Recover 1",
                },
                ["card-1"] = new CharacterCard
                {
                    Id = "card-1",
                    DisplayName = "Revealed Card",
                    Name = ["Revealed Card"],
                    Type = CardType.Character,
                    Color = CardColor.Blue,
                    Traits = ["Ninja"],
                    Power = 1,
                    Health = 1,
                },
            },
            Players =
            [
                new PlayerState { PlayerId = "p1", LeaderCardInstance = CreateLeader("p1") },
                new PlayerState { PlayerId = "p2", LeaderCardInstance = CreateLeader("p2") },
            ],
        });
    }

    private static LeaderCardInstanceState CreateLeader(string playerId)
    {
        return new LeaderCardInstanceState
        {
            InstanceId = $"leader-{playerId}",
            CardDefinitionId = "leader-def",
            OwnerPlayerId = playerId,
            ControllerPlayerId = playerId,
            Name = "Leader",
            Color = CardColor.Blue,
            Traits = ["Leader"],
            Damage = 0,
            Power = 0,
            TotalLife = 5,
            CurrentLife = 5,
            RecoveryEffect = "Recover 1",
        };
    }
}
