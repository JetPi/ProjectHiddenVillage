using ProjectHiddenVillage.Server.Api.Interfaces.Game;

namespace ProjectHiddenVillage.Server.Api.Services.Games;

public sealed class GameEffectCanExecuteEvaluator : IGameEffectCanExecuteEvaluator
{
    private readonly IGameEffectContextConditionEvaluator conditionEvaluator;
    private readonly IGameEffectTargetResolver targetResolver;
    private readonly IGameValidTargetResultFactory validTargetResultFactory;
    private readonly IGameEffectConditionDiagnostics conditionDiagnostics;

    public GameEffectCanExecuteEvaluator(
        IGameEffectContextConditionEvaluator conditionEvaluator,
        IGameEffectTargetResolver targetResolver,
        IGameValidTargetResultFactory validTargetResultFactory,
        IGameEffectConditionDiagnostics conditionDiagnostics)
    {
        this.conditionEvaluator = conditionEvaluator;
        this.targetResolver = targetResolver;
        this.validTargetResultFactory = validTargetResultFactory;
        this.conditionDiagnostics = conditionDiagnostics;
    }

    public CanExecuteResult Evaluate(GameCardEffectContext context, EffectSpec effectSpec, bool includeValidTargets)
    {
        var result = new CanExecuteResult();

        var requestingPlayer = context.ActingPlayer;
        var gameState = context.Game.State;
        var requestingPlayerState = gameState.Players.Find(player => player.PlayerId == requestingPlayer.Id)!;
        var opposingPlayerState = gameState.Players.Find(player => player.PlayerId != requestingPlayer.Id)!;
        var conditionResultCache = new Dictionary<(PlayerState PlayerState, EffectContextCondition Condition), CanExecuteResult>();

        var cardConditions = effectSpec.ContextRules;

        for (var index = 0; index < cardConditions.Count; index++)
        {
            var conditionRuleSet = cardConditions[index];

            if (conditionRuleSet.Player is not null)
            {
                var playerConditionResult = GetOrEvaluateConditionResult(conditionRuleSet.Player, requestingPlayerState, gameState, conditionResultCache);
                if (!playerConditionResult.CanExecute)
                {
                    result.FailedConditions.AddRange(playerConditionResult.FailedConditions);
                }
            }

            if (conditionRuleSet.Opponent is not null)
            {
                var opponentConditionResult = GetOrEvaluateConditionResult(conditionRuleSet.Opponent, opposingPlayerState, gameState, conditionResultCache);
                if (!opponentConditionResult.CanExecute)
                {
                    result.FailedConditions.AddRange(opponentConditionResult.FailedConditions);
                }
            }
        }

        result.CanExecute = result.FailedConditions.Count == 0;
        if (!result.CanExecute)
        {
            return result;
        }

        if (includeValidTargets)
        {
            var validTargets = targetResolver.ResolveTargets(context, effectSpec);
            result.ValidTargets.AddRange(validTargets.Select(target => validTargetResultFactory.Create(target, gameState)));
        }

        return result;
    }

    private CanExecuteResult GetOrEvaluateConditionResult(
        EffectContextCondition condition,
        PlayerState playerState,
        GameState gameState,
        Dictionary<(PlayerState PlayerState, EffectContextCondition Condition), CanExecuteResult> conditionResultCache)
    {
        var key = (playerState, condition);
        if (conditionResultCache.TryGetValue(key, out var cachedResult))
        {
            return cachedResult;
        }

        var evaluatedResult = CheckConditionsAgainstInstance(condition, playerState, gameState);
        conditionResultCache[key] = evaluatedResult;
        return evaluatedResult;
    }

    private CanExecuteResult CheckConditionsAgainstInstance(EffectContextCondition condition, PlayerState playerState, GameState gameState)
    {
        if (condition.InZone is null || condition.InZoneRequirements is null || condition.InZoneRequirements.Requirements.Count == 0)
        {
            return new CanExecuteResult { CanExecute = true };
        }

        var conditionResult = new CanExecuteResult();
        var isSatisfied = conditionEvaluator.IsConditionSatisfied(condition, playerState, gameState);

        if (isSatisfied)
        {
            conditionResult.CanExecute = true;
            return conditionResult;
        }

        conditionResult.FailedConditions.Add(conditionDiagnostics.BuildFailureMessage(condition));
        return conditionResult;
    }
}
