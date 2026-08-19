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

    public CanExecuteResult CanExecute(GameCardEffectContext context)
    {
        _ = EvaluateCanExecute(context, includeValidTargets: true, out var result, out _);
        return result;
    }

    private bool EvaluateCanExecute(
        GameCardEffectContext context,
        bool includeValidTargets,
        out CanExecuteResult result,
        out IReadOnlyList<GameEffectTargetReference> validTargets)
    {
        result = new CanExecuteResult();
        validTargets = [];

        var cardDestroyEffect = ResolveDestroyEffect(context);
        if (cardDestroyEffect is null)
        {
            result.FailedConditions.Add("DestroyCard effect is not defined on the source card.");
            return false;
        }

        var requestingPlayer = context.ActingPlayer;
        var gameState = context.Game.State;
        var requestingPlayerState = context.Game.State.Players.Find(player => player.PlayerId == requestingPlayer.Id)!;
        var opposingPlayerState = context.Game.State.Players.Find(player => player.PlayerId != requestingPlayer.Id)!;
        var conditionResultCache = new Dictionary<(PlayerState PlayerState, EffectContextCondition Condition), CanExecuteResult>();

        var cardConditions = cardDestroyEffect.ContextRules;

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
            return false;
        }

        if (includeValidTargets)
        {
            validTargets = targetResolver.ResolveTargets(context, cardDestroyEffect);
            result.ValidTargets.AddRange(validTargets.Select(FormatTarget));
            return true;
        }

        validTargets = targetResolver.ResolveTargets(context, cardDestroyEffect);

        return true;
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

    private static EffectSpec? ResolveDestroyEffect(GameCardEffectContext context)
    {
        return context.SourceCardDefinition.Effects
            .FirstOrDefault(eff => eff.RuntimeEffectType == RuntimeEffects.DestroyCard);
    }

    public CanExecuteResult CheckConditionsAgainstInstance(EffectContextCondition condition, PlayerState playerState, GameState gameState)
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

        var zoneName = condition.InZone?.ToString() ?? "AnyZone";

        var requirementDetails = string.Join(
            ", ",
            condition.InZoneRequirements.Requirements.Select((requirement, idx) =>
                $"#{idx}: {FormatRequirement(requirement)}"));

        conditionResult.FailedConditions.Add(
            $"Zone {zoneName} requirement set is not satisfied (Operator={condition.InZoneRequirements.Operator}, Distinct={condition.InZoneRequirements.DistinctCardsAcrossRequirements}, Requirements=[{requirementDetails}]).");

        return conditionResult;
    }

    private static string FormatRequirement(ZoneAmountRequirement requirement)
    {
        var restrictionDescription = FormatRestriction(requirement.Restriction);
        return $"{requirement.Comparison} {requirement.Amount} cards where {restrictionDescription}";
    }

    private static string FormatRestriction(ZoneCardRestriction restriction)
    {
        var details = new List<string>();

        if (restriction.HasName is { Count: > 0 })
        {
            details.Add($"name in [{string.Join("|", restriction.HasName)}]");
        }

        if (restriction.HasTrait is { Count: > 0 })
        {
            details.Add($"trait in [{string.Join("|", restriction.HasTrait)}]");
        }

        if (restriction.HasType is { Count: > 0 })
        {
            details.Add($"type in [{string.Join("|", restriction.HasType)}]");
        }

        if (restriction.HasColor is { Count: > 0 })
        {
            details.Add($"color in [{string.Join("|", restriction.HasColor)}]");
        }

        if (details.Count == 0)
        {
            return "any card";
        }

        var joinKeyword = restriction.MatchMode == ZoneRestrictionMatchMode.All ? " and " : " or ";
        return string.Join(joinKeyword, details);
    }

    private static string FormatTarget(GameEffectTargetReference target)
    {
        if (string.IsNullOrWhiteSpace(target.SlotId))
        {
            return $"Player {target.PlayerId} -> {target.Zone} -> card {target.CardInstanceId}";
        }

        return $"Player {target.PlayerId} -> {target.Zone} -> card {target.CardInstanceId} (slot {target.SlotId})";
    }

    public IReadOnlyList<GameEffectTargetReference> GetValidTargets(GameCardEffectContext context)
    {
        var cardDestroyEffect = ResolveDestroyEffect(context);
        if (cardDestroyEffect is null)
        {
            return [];
        }

        if (!EvaluateCanExecute(context, includeValidTargets: false, out _, out var validTargets))
        {
            return [];
        }

        return validTargets;
    }

    public ErrorOr<Success> Execute(GameCardEffectContext context)
    {
        return Result.Success;
    }
}