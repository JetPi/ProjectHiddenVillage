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

        if (!CanPayActivationCost(context.Arguments, requestingPlayerState, out var failureMessage))
        {
            result.CanExecute = false;
            result.FailedConditions.Add(failureMessage);
            return result;
        }

        var cardConditions = effectSpec.ContextRules;

        foreach (var conditionRuleSet in cardConditions)
        {
            EvaluatePlayerCondition(conditionRuleSet.Player, requestingPlayerState, gameState, conditionResultCache, ref result);
            EvaluatePlayerCondition(conditionRuleSet.Opponent, opposingPlayerState, gameState, conditionResultCache, ref result);
        }

        result.CanExecute = result.FailedConditions.Count == 0;
        if (!result.CanExecute)
        {
            return result;
        }

        var targetCountBounds = TryResolveTargetCountBounds(effectSpec.TargetRules);
        var shouldEnforceSelectedTargetCount = ShouldEnforceSelectedTargetCount(effectSpec.TargetRules, context.Arguments);

        if (shouldEnforceSelectedTargetCount)
        {
            IsSelectedTargetCountValid(context.SelectedTargets.Count, targetCountBounds, context, ref result);
        }

        if (!result.CanExecute)
        {
            return result;
        }

        if (!TributeTargetCompositionValidator.TryValidateSelectedTargets(context, effectSpec, context.SelectedTargets, out var tributeCompositionError))
        {
            result.CanExecute = false;
            result.FailedConditions.Add(tributeCompositionError);
            return result;
        }

        if (includeValidTargets)
        {
            var validTargets = targetResolver.ResolveTargets(context, effectSpec);

            if (!IsAvailableTargetCountValid(validTargets.Count, targetCountBounds, out var availableTargetCountError))
            {
                result.CanExecute = false;
                result.FailedConditions.Add(availableTargetCountError);
                return result;
            }

            result.ValidTargets.AddRange(validTargets.Select(target => validTargetResultFactory.Create(target, gameState)));
        }

        return result;
    }

    private static TargetCountBounds TryResolveTargetCountBounds(EffectTargetRuleSet targetRules)
    {
        var hasExact = targetRules.ExactTargetCount.HasValue;

        if (hasExact)
        {
            return new TargetCountBounds(targetRules.ExactTargetCount!.Value);
        }

        var minimum = targetRules.MinimumTargetCount ?? 1;
        var maximum = targetRules.MaximumTargetCount ?? minimum;

        return new TargetCountBounds(minimum, maximum);
    }

    private static bool ShouldEnforceSelectedTargetCount(EffectTargetRuleSet targetRules, IReadOnlyDictionary<string, string> arguments)
    {
        if (targetRules.AutoSelectAllValidTargets)
        {
            return false;
        }

        return arguments.TryGetValue(ReactiveEffectExecutionConstants.EnforceTargetCountArgument, out var rawValue)
            && bool.TryParse(rawValue, out var shouldEnforce)
            && shouldEnforce;
    }

    private static void IsSelectedTargetCountValid(int selectedTargetCount, TargetCountBounds bounds, GameCardEffectContext context, ref CanExecuteResult result)
    {
        if (selectedTargetCount < bounds.Minimum)
        {
            var selectedTargetCountError = $"Select at least {bounds.Minimum} target(s).";
            result.CanExecute = false;
            result.FailedConditions.Add(selectedTargetCountError);
        }

        if (selectedTargetCount > bounds.Maximum)
        {
            var selectedTargetCountError = $"Select no more than {bounds.Maximum} target(s).";
            result.CanExecute = false;
            result.FailedConditions.Add(selectedTargetCountError);
        }
    }

    private void EvaluatePlayerCondition(EffectContextCondition? condition, PlayerState playerState, GameState gameState, Dictionary<(PlayerState PlayerState, EffectContextCondition Condition), CanExecuteResult> cache, ref CanExecuteResult result)
    {
        if (condition is null) return;

        var playerConditionResult = GetOrEvaluateConditionResult(condition, playerState, gameState, cache);
        if (!playerConditionResult.CanExecute)
        {
            result.FailedConditions.AddRange(playerConditionResult.FailedConditions);
        }
    }

    private static bool IsAvailableTargetCountValid(int availableTargetCount, TargetCountBounds bounds, out string error)
    {
        error = string.Empty;

        if (availableTargetCount < bounds.Minimum)
        {
            error = $"Not enough valid targets. Requires at least {bounds.Minimum} target(s).";
            return false;
        }

        return true;
    }

    private static bool CanPayActivationCost(
        IReadOnlyDictionary<string, string> arguments,
        PlayerState requestingPlayerState,
        out string failureMessage)
    {
        failureMessage = string.Empty;

        if (!arguments.TryGetValue(ReactiveEffectExecutionConstants.SupportActivationChakraCostArgument, out var rawCost)
            || string.IsNullOrWhiteSpace(rawCost))
        {
            return true;
        }

        if (!int.TryParse(rawCost, out var chakraCost) || chakraCost <= 0)
        {
            return true;
        }

        if (requestingPlayerState.ResourcePool >= chakraCost)
        {
            return true;
        }

        failureMessage = $"Player '{requestingPlayerState.PlayerId}' does not have enough chakra to pay {chakraCost}.";
        return false;
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

    private sealed record TargetCountBounds(int Minimum, int Maximum)
    {
        public TargetCountBounds(int exact) : this(exact, exact) { }
    }
}
