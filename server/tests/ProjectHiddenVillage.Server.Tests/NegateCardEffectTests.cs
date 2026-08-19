using Microsoft.VisualStudio.TestTools.UnitTesting;
using ProjectHiddenVillage.Server.Api.Interfaces.Game;
using ProjectHiddenVillage.Server.Api.Services.Games;

namespace ProjectHiddenVillage.Server.Tests;

[TestClass]
public sealed class NegateCardEffectTests
{
    [TestMethod]
    public void Execute_WithStackTarget_MarksStackEntryAsNegated()
    {
        var stackEntry = new EffectResolutionStackEntry
        {
            EntryId = "stack-entry-1",
            SourcePlayerId = "p1",
            SourceZone = PlayerZone.CharacterField,
            SourceCardInstanceId = "card-instance-1",
            EffectTypeKey = "DestroyCard"
        };

        var context = CreateContext([stackEntry]);
        var effect = CreateEffect();

        var result = effect.Execute(
            context,
            [
                new GameEffectTargetReference(
                    PlayerId: "p1",
                    Zone: PlayerZone.CharacterField,
                    CardInstanceId: "card-instance-1",
                    IsEffectResolutionStackTarget: true,
                    EffectResolutionEntryId: "stack-entry-1")
            ]);

        Assert.IsFalse(result.IsError);
        Assert.IsTrue(stackEntry.IsNegated);
    }

    [TestMethod]
    public void Execute_StackTargetWithoutEntryId_ReturnsValidationError()
    {
        var context = CreateContext(
            [
                new EffectResolutionStackEntry
                {
                    EntryId = "stack-entry-1",
                    SourcePlayerId = "p1",
                    SourceZone = PlayerZone.CharacterField,
                    SourceCardInstanceId = "card-instance-1",
                    EffectTypeKey = "DestroyCard"
                }
            ]);

        var effect = CreateEffect();

        var result = effect.Execute(
            context,
            [
                new GameEffectTargetReference(
                    PlayerId: "p1",
                    Zone: PlayerZone.CharacterField,
                    CardInstanceId: "card-instance-1",
                    IsEffectResolutionStackTarget: true)
            ]);

        Assert.IsTrue(result.IsError);
        Assert.AreEqual("Game.Effect.NegateEffect.MissingStackEntryId", result.FirstError.Code);
    }

    private static NegateCardEffect CreateEffect()
    {
        return new NegateCardEffect(
            effectSpecResolver: new StubEffectSpecResolver(),
            canExecuteEvaluator: new StubCanExecuteEvaluator(),
            validTargetResultFactory: new StubValidTargetResultFactory());
    }

    private static GameCardEffectContext CreateContext(IReadOnlyList<EffectResolutionStackEntry> stackEntries)
    {
        var state = new GameState
        {
            GameId = "game-1",
            Players =
            [
                new PlayerState { PlayerId = "p1" }
            ],
            CardDefinitions =
            {
                ["card-def-1"] = new Card
                {
                    Id = "card-def-1",
                    DisplayName = "Test Card",
                    Name = ["Test Card"],
                    Type = CardType.Character,
                    Color = CardColor.Red,
                    Traits = [],
                    Description = string.Empty,
                    Effects = []
                }
            },
            EffectResolutionStack = stackEntries.ToList()
        };

        var game = new GameInstance(state);

        return new GameCardEffectContext(
            game: game,
            actingPlayer: new Player { Id = "p1" },
            sourceCardDefinition: new Card
            {
                Id = "source-card",
                DisplayName = "Negate Source",
                Name = ["Negate Source"],
                Type = CardType.Character,
                Color = CardColor.Green,
                Traits = [],
                Description = string.Empty,
                Effects = []
            },
            sourceCardInstance: null,
            arguments: new Dictionary<string, string>(),
            selectedTargets: []);
    }

    private sealed class StubEffectSpecResolver : IGameRuntimeEffectSpecResolver
    {
        public EffectSpec? Resolve(GameCardEffectContext context, RuntimeEffects runtimeEffect)
        {
            return new EffectSpec { RuntimeEffectType = runtimeEffect };
        }
    }

    private sealed class StubCanExecuteEvaluator : IGameEffectCanExecuteEvaluator
    {
        public CanExecuteResult Evaluate(GameCardEffectContext context, EffectSpec effectSpec, bool includeValidTargets)
        {
            return new CanExecuteResult { CanExecute = true };
        }
    }

    private sealed class StubValidTargetResultFactory : IGameValidTargetResultFactory
    {
        public ValidTargetResult Create(GameEffectTargetReference target, GameState gameState)
        {
            return new ValidTargetResult
            {
                CardInstanceId = target.CardInstanceId,
                CardZone = target.Zone,
                ExecuteMessage = "stub"
            };
        }
    }
}
