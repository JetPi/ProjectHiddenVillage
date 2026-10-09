using Microsoft.VisualStudio.TestTools.UnitTesting;
using ProjectHiddenVillage.Server.Api.Services.Games;

namespace ProjectHiddenVillage.Server.Tests;

/// <summary>
/// Once an outcome exists the engine publishes no interaction at all: no prompt to answer, no global or
/// per-card action, no open support reaction window and no support chain. The client's only affordance is the
/// result overlay's "return to main page", and `gameOutcome` is what tells it to show that overlay - so an
/// empty result object must never be published for a running game.
/// </summary>
[TestClass]
public sealed class GameStateResponseMapperGameOutcomeTests
{
    [TestMethod]
    public void ToGameStateResponse_KeepsTheGamePlayable_WhileThereIsNoOutcome()
    {
        var state = BuildRunningSetup();

        var response = GameStateResponseMapper.ToGameStateResponse(state, "p1");

        Assert.IsNull(response.GameOutcome);
        Assert.AreNotEqual(0, response.AvailableActions.Count);
        Assert.AreEqual(1, response.SupportChain!.Count);
        Assert.IsTrue(response.IsSupportResponseWindowOpen);
        var leader = response.Players.Single(player => player.PlayerId == "p1").Leader;
        Assert.AreNotEqual(0, leader.AvailableActions.Count);
    }

    [TestMethod]
    public void ToGameStateResponse_PublishesTheOutcome_AndSuppressesEveryAction()
    {
        var state = BuildRunningSetup();
        state.Outcome = new GameOutcome
        {
            WinnerPlayerId = "p2",
            LoserPlayerIds = ["p1"],
            Reason = GameEndReason.DeckOut,
            TurnNumber = 3,
        };

        var response = GameStateResponseMapper.ToGameStateResponse(state, "p1");

        Assert.IsNotNull(response.GameOutcome);
        Assert.AreEqual("p2", response.GameOutcome.WinnerPlayerId);
        CollectionAssert.AreEqual(new[] { "p1" }, response.GameOutcome.LoserPlayerIds.ToArray());
        Assert.AreEqual("DeckOut", response.GameOutcome.Reason);
        Assert.AreEqual(3, response.GameOutcome.TurnNumber);
        Assert.AreEqual(0, response.AvailableActions.Count);
        Assert.AreEqual(0, response.SupportChain!.Count);
        Assert.IsFalse(response.IsSupportResponseWindowOpen);
        Assert.IsFalse(response.IsAttackSequencePending);
    }

    [TestMethod]
    public void ToGameStateResponse_HidesEveryCardAction_OnceTheGameIsOver()
    {
        var state = BuildRunningSetup();
        state.Outcome = new GameOutcome
        {
            WinnerPlayerId = "p1",
            LoserPlayerIds = ["p2"],
            Reason = GameEndReason.LeaderLifeDepleted,
        };

        var response = GameStateResponseMapper.ToGameStateResponse(state, "p1");
        var player = response.Players.Single(entry => entry.PlayerId == "p1");

        Assert.AreEqual(0, player.Leader.AvailableActions.Count);
        Assert.AreEqual(0, player.Hand.Single().AvailableActions.Count);
        Assert.AreEqual(0, player.CharacterField.Single().AvailableActions.Count);
        Assert.AreEqual(0, player.SupportZone.Single().AvailableActions.Count);
    }

    [TestMethod]
    public void ToGameStateResponse_HidesAPendingPrompt_OnceTheGameIsOver()
    {
        var state = BuildRunningSetup();
        state.Outcome = new GameOutcome
        {
            WinnerPlayerId = "p1",
            LoserPlayerIds = ["p2"],
            Reason = GameEndReason.LeaderLifeDepleted,
        };
        var instance = new GameInstance(state);
        instance.EnqueuePrompt(new GamePrompt
        {
            PromptId = "prompt-1",
            Type = GamePromptType.Mulligan,
            RequestedPlayerId = "p1",
            Options = ["mulligan", "noMulligan"],
        });

        var response = GameStateResponseMapper.ToGameStateResponse(instance, "p1");

        Assert.IsNull(response.PendingPrompt);
    }

    private static GameState BuildRunningSetup()
    {
        var state = new GameState
        {
            GameId = "game-1",
            TurnNumber = 2,
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
                    Traits = ["Leader"],
                    Type = CardType.Leader,
                    Color = CardColor.Blue,
                    Life = 5,
                },
                ["character-def"] = new Card
                {
                    Id = "character-def",
                    DisplayName = "Character",
                    Name = ["Character"],
                    Type = CardType.Character,
                    Traits = [],
                    Color = CardColor.Blue,
                    Description = string.Empty,
                    Damage = 2,
                    Power = 2,
                    Conditions = [],
                    Effects = [],
                },
            },
        };

        state.Players =
        [
            BuildPlayer("p1"),
            BuildPlayer("p2"),
        ];

        var activePlayer = state.Players[0];
        activePlayer.Hand.Add(BuildCharacter("hand-1"));
        activePlayer.Battlefield.Add(BuildCharacter("field-1"));
        activePlayer.SupportZone.Add(BuildCharacter("support-1"));

        // A queued support activation: while the game runs it opens the reaction window and fills the chain.
        state.EffectResolutionStack.Add(new EffectResolutionStackEntry
        {
            EntryId = "entry-1",
            SourcePlayerId = "p1",
            SourceCardInstanceId = "support-1",
            EffectTypeKey = "change-values",
            ActivatedEffectId = "change-values",
        });

        return state;
    }

    private static PlayerState BuildPlayer(string playerId)
    {
        return new PlayerState
        {
            PlayerId = playerId,
            TurnCount = 2,
            ResourcePool = 5,
            LeaderCardInstance = new LeaderCardInstanceState
            {
                InstanceId = $"leader-{playerId}",
                CardDefinitionId = "leader-def",
                OwnerPlayerId = playerId,
                ControllerPlayerId = playerId,
                Name = "Leader",
                Color = CardColor.Blue,
                Traits = ["Leader"],
                Damage = 1,
                Power = 1,
                TotalLife = 5,
                CurrentLife = 5,
            },
        };
    }

    private static CardInstance BuildCharacter(string instanceId)
    {
        return new CardInstance
        {
            InstanceId = instanceId,
            CardDefinitionId = "character-def",
            OwnerPlayerId = "p1",
            ControllerPlayerId = "p1",
        };
    }
}
