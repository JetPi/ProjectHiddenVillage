using ProjectHiddenVillage.Server.Api.Interfaces.Game;

namespace ProjectHiddenVillage.Server.Api.Services.Games;

public sealed class GameEffectCanExecuteEvaluator(
    IGameEffectContextConditionEvaluator conditionEvaluator,
    IGameEffectTargetResolver targetResolver,
    IGameValidTargetResultFactory validTargetResultFactory,
    IGameEffectConditionDiagnostics conditionDiagnostics) : IGameEffectCanExecuteEvaluator
{
    private readonly IGameEffectContextConditionEvaluator conditionEvaluator = conditionEvaluator;
    private readonly IGameEffectTargetResolver targetResolver = targetResolver;
    private readonly IGameValidTargetResultFactory validTargetResultFactory = validTargetResultFactory;
    private readonly IGameEffectConditionDiagnostics conditionDiagnostics = conditionDiagnostics;

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

        var targetCountBounds = TryResolveTargetCountBounds(effectSpec);

        // Effects that supply their own target ("draw 1 card, then place 1 card from your hand on top of
        // your deck") stay usable with nothing to select - unless there is nothing to draw either.
        if (EffectTargetRequirementAnalyzer.HasSelfSuppliedTargets(effectSpec)
            && !EffectTargetRequirementAnalyzer.CanSelfSupplyTargets(context, effectSpec)
            && context.SelectedTargets.Count == 0
            && targetResolver.ResolveTargets(context, effectSpec).Count == 0)
        {
            result.CanExecute = false;
            result.FailedConditions.Add(EffectTargetRequirementAnalyzer.NoCardsToDrawFailureMessage);
            return result;
        }

        var shouldEnforceSelectedTargetCount = ShouldEnforceSelectedTargetCount(effectSpec.TargetRules, context.Arguments)
            && !(context.SelectedTargets.Count == 0
                && EffectTargetRequirementAnalyzer.CanSelfSupplyTargets(context, effectSpec));

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
                // Effects that draw the card they later consume ("draw 1 card, then place 1 card from your
                // hand on top of your deck") must stay executable when the hand holds nothing to select.
                if (validTargets.Count > 0
                    || !EffectTargetRequirementAnalyzer.CanSelfSupplyTargets(context, effectSpec))
                {
                    result.CanExecute = false;
                    result.FailedConditions.Add(availableTargetCountError);
                    return result;
                }
            }

            result.ValidTargets.AddRange(validTargets.Select(target => validTargetResultFactory.Create(target, gameState)));
        }

        return result;
    }

    private static TargetCountBounds TryResolveTargetCountBounds(EffectSpec effectSpec)
    {
        var targetRules = effectSpec.TargetRules;
        var hasExact = targetRules.ExactTargetCount.HasValue;

        if (hasExact)
        {
            return new TargetCountBounds(targetRules.ExactTargetCount!.Value);
        }

        if (targetRules.MinimumTargetCount.HasValue || targetRules.MaximumTargetCount.HasValue)
        {
            var explicitMinimum = targetRules.MinimumTargetCount ?? 0;
            var explicitMaximum = targetRules.MaximumTargetCount ?? int.MaxValue;
            return new TargetCountBounds(explicitMinimum, explicitMaximum);
        }

        // No declared counts: an effect that collects a player selection implicitly requires one
        // ("choose 1 character"). Nodes that supply their own targets - source-supplied summons,
        // own-leader modifications, `None`/`SourceCard` execution sources - must never demand a
        // selection, because there is nothing for the player to pick.
        return RequiresPlayerSelection(effectSpec)
            ? new TargetCountBounds(1)
            : new TargetCountBounds(0, int.MaxValue);
    }

    private static bool RequiresPlayerSelection(EffectSpec effectSpec)
    {
        if (effectSpec.TargetRules.Rules.Count > 0)
        {
            return true;
        }

        if (effectSpec.AttributeModifications.Any(modification =>
            modification.TargetType == AttributeModificationTargetType.SelectedTargets))
        {
            return true;
        }

        if (effectSpec.KeywordModifications.Any(modification =>
            modification.TargetType == KeywordModificationTargetType.SelectedTargets))
        {
            return true;
        }

        if (effectSpec.MoveCardActions.Any(action =>
            action.Operation == MoveCardOperationType.Move && action.SourceZone is not null))
        {
            return true;
        }

        return effectSpec.ExecutionTargetSource == EffectExecutionTargetSource.SelectedTargets;
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
