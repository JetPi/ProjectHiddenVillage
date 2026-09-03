namespace ProjectHiddenVillage.Server.Api.Services.Games;

internal static class TributeTargetCompositionValidator
{
    /// <summary>
    /// Validates the player's actual selection for a tribute summon. The summon candidate is the
    /// source card that requires the tributes, so it is not expected to appear among the selected
    /// targets. Only tribute material rules are validated, and each material rule must be satisfied
    /// by a DISTINCT selected card.
    /// </summary>
    public static bool TryValidateSelectedTargets(
        GameCardEffectContext context,
        EffectSpec effectSpec,
        IReadOnlyList<GameEffectTargetReference> selectedTargets,
        out string failure)
    {
        failure = string.Empty;

        var composition = effectSpec.TargetRules.TributeComposition;
        if (composition is null || selectedTargets.Count == 0)
        {
            return true;
        }

        var gameState = context.Game.State;
        var actingPlayerState = gameState.Players.First(player =>
            GameStatePlayerResolver.IsSamePlayerId(player.PlayerId, context.ActingPlayer.Id));

        var materialRules = GetMaterialRules(effectSpec);
        if (materialRules.Count == 0)
        {
            failure = "Effect does not declare any tribute material target rule.";
            return false;
        }

        return TributeMaterialAssignmentSolver.TrySatisfy(
            gameState,
            actingPlayerState,
            context.SourceCardInstance,
            materialRules,
            composition,
            pool: selectedTargets,
            requireUseEntirePool: true,
            out failure);
    }

    /// <summary>
    /// Determines whether the currently available tribute material targets can satisfy the tribute
    /// composition. Used when deciding whether a summon requirement can be performed at all (before
    /// the player makes a selection), so the whole candidate pool may be larger than the amount the
    /// summon actually consumes.
    /// </summary>
    public static bool TryValidateMaterialAvailability(
        GameCardEffectContext context,
        EffectSpec effectSpec,
        IReadOnlyList<GameEffectTargetReference> availableMaterialTargets,
        out string failure)
    {
        failure = string.Empty;

        var composition = effectSpec.TargetRules.TributeComposition;
        if (composition is null)
        {
            return true;
        }

        var gameState = context.Game.State;
        var actingPlayerState = gameState.Players.First(player =>
            GameStatePlayerResolver.IsSamePlayerId(player.PlayerId, context.ActingPlayer.Id));

        var materialRules = GetMaterialRules(effectSpec);
        if (materialRules.Count == 0)
        {
            failure = "Effect does not declare any tribute material target rule.";
            return false;
        }

        return TributeMaterialAssignmentSolver.TrySatisfy(
            gameState,
            actingPlayerState,
            context.SourceCardInstance,
            materialRules,
            composition,
            pool: availableMaterialTargets,
            requireUseEntirePool: false,
            out failure);
    }

    /// <summary>
    /// Rules with no tribute role are treated as tribute material rules for backward compatibility
    /// with effects authored before tribute roles were introduced.
    /// </summary>
    private static List<EffectTargetRule> GetMaterialRules(EffectSpec effectSpec)
    {
        return effectSpec.TargetRules.Rules
            .Where(rule => rule.TributeRole != TributeTargetRole.SummonCandidate)
            .ToList();
    }
}
