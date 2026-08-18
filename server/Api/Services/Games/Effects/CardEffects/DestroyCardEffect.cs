using ErrorOr;
using ProjectHiddenVillage.Server.Api.Interfaces.Game;

namespace ProjectHiddenVillage.Server.Api.Services.Games;

public sealed class DestroyCardEffect : IGameCardEffect
{
    private readonly IGameEffectContextConditionEvaluator conditionEvaluator;
    private readonly IGameEffectTargetResolver targetResolver;

    public DestroyCardEffect(
        IGameEffectContextConditionEvaluator conditionEvaluator,
        IGameEffectTargetResolver targetResolver)
    {
        this.conditionEvaluator = conditionEvaluator;
        this.targetResolver = targetResolver;
    }

    public const string EffectKey = "DestroyCard";

    public string EffectTypeKey => EffectKey;

    public bool CanExecute(GameCardEffectContext context)
    {
        var cardDestroyEffect = ResolveDestroyEffect(context);
        if (cardDestroyEffect is null)
        {
            return false;
        }

        var requestingPlayer = context.ActingPlayer;
        var gameState = context.Game.State;
        var requestingPlayerState = context.Game.State.Players.Find(player => player.PlayerId == requestingPlayer.Id)!;
        var opposingPlayerState = context.Game.State.Players.Find(player => player.PlayerId != requestingPlayer.Id)!;

        var cardConditions = cardDestroyEffect.ContextRules.ToList();
        var playerConditions = cardConditions.Select(ruleSet => ruleSet.Player).Where(playerCondition => playerCondition is not null).ToList();
        var opponentConditions = cardConditions.Select(ruleSet => ruleSet.Opponent).Where(opponentCondition => opponentCondition is not null).ToList();

        if (playerConditions.Any() && !playerConditions.All(condition => CheckConditionsAgainstInstance(condition!, requestingPlayerState, gameState)))
        {
            return false;
        }

        if (opponentConditions.Any() && !opponentConditions.All(condition => CheckConditionsAgainstInstance(condition!, opposingPlayerState, gameState)))
        {
            return false;
        }

        return true;
    }

    private static EffectSpec? ResolveDestroyEffect(GameCardEffectContext context)
    {
        return context.SourceCardDefinition.Effects
            .FirstOrDefault(eff => eff.RuntimeEffectType == RuntimeEffects.DestroyCard);
    }

    public bool CheckConditionsAgainstInstance(EffectContextCondition condition, PlayerState playerState, GameState gameState)
    {
        return conditionEvaluator.IsConditionSatisfied(condition, playerState, gameState);
    }

    public IReadOnlyList<GameEffectTargetReference> GetValidTargets(GameCardEffectContext context)
    {
        var cardDestroyEffect = ResolveDestroyEffect(context);
        if (cardDestroyEffect is null)
        {
            return [];
        }

        if (!CanExecute(context))
        {
            return [];
        }

        return targetResolver.ResolveTargets(context, cardDestroyEffect);
    }

    public ErrorOr<Success> Execute(GameCardEffectContext context)
    {
        return Result.Success;
    }
}