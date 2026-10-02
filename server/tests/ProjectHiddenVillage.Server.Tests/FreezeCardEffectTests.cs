using Microsoft.VisualStudio.TestTools.UnitTesting;
using ProjectHiddenVillage.Server.Api.Interfaces.Game;
using ProjectHiddenVillage.Server.Api.Services.Games;

namespace ProjectHiddenVillage.Server.Tests;

// N-013's freeze ("choose 1 Leader or Character: it cannot attack during your opponent's next turn") is the
// one effect that can target a leader with a keyword, so it pins both halves of that contract: the leader is a
// legal target at all, and the keyword lands on the *stored* LeaderCardInstanceState (the zone accessor's
// projection is a copy - writing to it would silently do nothing).
[TestClass]
public sealed class FreezeCardEffectTests
{
    private const string FrozenLeaderKeywordMessage =
        "Cannot declare battle action because the card is under an effect that restricts it.";

    [TestMethod]
    public void Execute_FreezesALeaderTarget_AndTheLeadersBattleActionIsRefused()
    {
        var effectSpec = CreateFreezeSpec();
        var context = CreateContext(effectSpec);

        var result = CreateEffect(effectSpec).Execute(
            context,
            [new GameEffectTargetReference("p2", PlayerZone.Leader, "leader-2")]);

        Assert.IsFalse(result.IsError, result.FirstError.Description);

        var applied = context.Game.State.AppliedCardEffects.Single(effectState =>
            string.Equals(effectState.TargetCardInstanceId, "leader-2", StringComparison.Ordinal));
        Assert.AreEqual(AppliedCardModifierKind.Keyword, applied.ModifierKind);
        Assert.AreEqual(FreezeCardEffect.CannotAttackKeyword, applied.Keyword);

        // The published chip for the frozen leader reports the restriction, i.e. the keyword really is on the
        // instance the mapper resolves.
        var response = GameStateResponseMapper.ToGameStateResponse(context.Game.State, "p2");
        var leader = response.Players.Single(player => player.PlayerId == "p2").Leader;
        var battleAction = leader.AvailableActions.Single(action =>
            action.ActionId.StartsWith("battle-action:", StringComparison.Ordinal));

        Assert.IsFalse(battleAction.IsEnabled);
        Assert.AreEqual(FrozenLeaderKeywordMessage, battleAction.DisabledReason);
    }

    [TestMethod]
    public void Execute_FreezesABattlefieldCharacterTarget()
    {
        var effectSpec = CreateFreezeSpec();
        var context = CreateContext(effectSpec, battlefieldCard: new CardInstance
        {
            InstanceId = "char-1",
            CardDefinitionId = "char-def",
            OwnerPlayerId = "p2",
            ControllerPlayerId = "p2",
        });

        var result = CreateEffect(effectSpec).Execute(
            context,
            [new GameEffectTargetReference("p2", PlayerZone.CharacterField, "char-1")]);

        Assert.IsFalse(result.IsError, result.FirstError.Description);
        Assert.IsTrue(context.Game.State.AppliedCardEffects.Any(effectState =>
            string.Equals(effectState.TargetCardInstanceId, "char-1", StringComparison.Ordinal)
            && string.Equals(effectState.Keyword, FreezeCardEffect.CannotAttackKeyword, StringComparison.Ordinal)));
    }

    [TestMethod]
    public void Execute_RejectsAnUnknownLeaderTarget()
    {
        var effectSpec = CreateFreezeSpec();
        var context = CreateContext(effectSpec);

        var result = CreateEffect(effectSpec).Execute(
            context,
            [new GameEffectTargetReference("p2", PlayerZone.Leader, "not-the-leader")]);

        Assert.IsTrue(result.IsError);
        Assert.AreEqual("Game.Effect.FreezeCard.TargetCardNotFound", result.FirstError.Code);
    }

    private static GameCardEffectContext CreateContext(EffectSpec effectSpec, CardInstance? battlefieldCard = null)
    {
        var state = new GameState
        {
            GameId = "game-1",
            Phase = GamePhase.MainPhase,
            // p2 is the active player so the frozen leader's own battle-action chip is evaluated (the acting
            // player of the effect is p1, which is independent of whose turn it is).
            ActivePlayerId = "p2",
            PriorityPlayerId = "p2",
            TurnNumber = 3,
            Players =
            [
                new PlayerState
                {
                    PlayerId = "p1",
                    TurnCount = 3,
                    ResourcePool = 5,
                    LeaderCardInstance = CreateLeader("leader-1", "p1"),
                },
                new PlayerState
                {
                    PlayerId = "p2",
                    TurnCount = 3,
                    ResourcePool = 5,
                    LeaderCardInstance = CreateLeader("leader-2", "p2"),
                    Battlefield = battlefieldCard is null ? [] : [battlefieldCard],
                }
            ],
            CardDefinitions =
            {
                ["source-def"] = new CharacterCard
                {
                    Id = "source-def",
                    DisplayName = "Source",
                    Name = ["Source"],
                    Type = CardType.Character,
                    Color = CardColor.Red,
                    Traits = [],
                    Description = string.Empty,
                    Effects = [effectSpec],
                },
                ["char-def"] = new CharacterCard
                {
                    Id = "char-def",
                    DisplayName = "Character",
                    Name = ["Character"],
                    Type = CardType.Character,
                    Color = CardColor.Red,
                    Traits = [],
                    Description = string.Empty,
                },
                ["leader-def"] = new LeaderCard
                {
                    Id = "leader-def",
                    DisplayName = "Leader",
                    Name = ["Leader"],
                    Type = CardType.Leader,
                    Color = CardColor.Blue,
                    Traits = ["Leader"],
                    Life = 5,
                },
            },
        };

        var sourceCardInstance = new CardInstance
        {
            InstanceId = "source-1",
            CardDefinitionId = "source-def",
            OwnerPlayerId = "p1",
            ControllerPlayerId = "p1",
        };

        return new GameCardEffectContext(
            game: new GameInstance(state),
            actingPlayer: new Player { Id = "p1" },
            sourceCardDefinition: state.CardDefinitions["source-def"],
            sourceCardInstance: sourceCardInstance,
            arguments: new Dictionary<string, string>(StringComparer.Ordinal),
            selectedTargets: []);
    }

    private static LeaderCardInstanceState CreateLeader(string instanceId, string playerId)
    {
        return new LeaderCardInstanceState
        {
            InstanceId = instanceId,
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
            RecoveryEffect = string.Empty,
        };
    }

    private static EffectSpec CreateFreezeSpec()
    {
        return new EffectSpec
        {
            Id = "freeze-target",
            RuntimeEffectType = RuntimeEffects.FreezeCard,
            DurationMode = EffectDurationMode.DuringOpponentNextTurn,
        };
    }

    private static FreezeCardEffect CreateEffect(EffectSpec effectSpec)
    {
        return new FreezeCardEffect(
            effectSpecResolver: new StubEffectSpecResolver(effectSpec),
            canExecuteEvaluator: new StubCanExecuteEvaluator(),
            targetResolver: new EffectTargetResolver());
    }

    private sealed class StubEffectSpecResolver(EffectSpec effectSpec) : IGameRuntimeEffectSpecResolver
    {
        private readonly EffectSpec effectSpec = effectSpec;

        public EffectSpec? Resolve(GameCardEffectContext context, RuntimeEffects runtimeEffect)
        {
            return runtimeEffect == RuntimeEffects.FreezeCard ? effectSpec : null;
        }
    }

    private sealed class StubCanExecuteEvaluator : IGameEffectCanExecuteEvaluator
    {
        public CanExecuteResult Evaluate(GameCardEffectContext context, EffectSpec effectSpec, bool includeValidTargets)
        {
            return new CanExecuteResult { CanExecute = true };
        }
    }
}
