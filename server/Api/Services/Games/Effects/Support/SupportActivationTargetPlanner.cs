using ProjectHiddenVillage.Server.Api.Interfaces.Game;

namespace ProjectHiddenVillage.Server.Api.Services.Games;

/// <summary>Selection a support activation asks the player for, as published to the client.</summary>
public sealed record SupportActivationTargetPlan(
    bool IsEnabled,
    string? DisabledReason,
    IReadOnlyList<GameEffectTargetReference> ValidTargets,
    int? ExactTargetCount,
    int? MinimumTargetCount,
    int? MaximumTargetCount,
    bool AutoSelectAllValidTargets);

/// <summary>
/// Decides what a support activation asks the player to select. The requirement has to be resolved over
/// the whole activation chain (not just the first effect, which is what made N-002/N-010/N-021 ask the
/// player to pick their own card), and stack-target effects (Support Activated negates) publish the
/// resolution-stack entries they can target instead of board cards.
/// </summary>
public static class SupportActivationTargetPlanner
{
    public const string MultipleSelectionsDisabledReason =
        "This support requires more than one target selection, which is not supported yet.";

    public static SupportActivationTargetPlan Build(
        GameInstance game,
        Card sourceDefinition,
        CardInstance sourceInstance,
        IGameCardEffectRegistry effectRegistry,
        string actingPlayerId)
    {
        ArgumentNullException.ThrowIfNull(game);
        ArgumentNullException.ThrowIfNull(sourceDefinition);
        ArgumentNullException.ThrowIfNull(sourceInstance);
        ArgumentNullException.ThrowIfNull(effectRegistry);

        var normalizedDefinition = SupportActivationNormalizer.NormalizeForActivation(
            game.State,
            sourceDefinition,
            sourceInstance);

        var contributingNodes = normalizedDefinition.Effects
            .Where(node => node.ExecutionTargetSource == EffectExecutionTargetSource.SelectedTargets)
            .Select(node => new
            {
                Node = node,
                Candidates = ResolveCandidates(game, normalizedDefinition, sourceInstance, node, effectRegistry, actingPlayerId),
            })
            .ToList();

        if (contributingNodes.Count == 0)
        {
            return new SupportActivationTargetPlan(
                IsEnabled: true,
                DisabledReason: null,
                ValidTargets: [],
                ExactTargetCount: null,
                MinimumTargetCount: null,
                MaximumTargetCount: null,
                AutoSelectAllValidTargets: false);
        }

        if (contributingNodes.Count > 1)
        {
            // Sequential multi-selection is a follow-up: the executor broadcasts one selection to every
            // Selected Targets node, so a chain requiring two different picks cannot be expressed yet.
            return new SupportActivationTargetPlan(
                IsEnabled: false,
                DisabledReason: MultipleSelectionsDisabledReason,
                ValidTargets: [],
                ExactTargetCount: null,
                MinimumTargetCount: null,
                MaximumTargetCount: null,
                AutoSelectAllValidTargets: false);
        }

        var node = contributingNodes[0].Node;
        var candidates = contributingNodes[0].Candidates;

        if (candidates.Count == 0)
        {
            return new SupportActivationTargetPlan(
                IsEnabled: false,
                DisabledReason: "No valid targets available.",
                ValidTargets: [],
                ExactTargetCount: node.TargetRules.ExactTargetCount,
                MinimumTargetCount: node.TargetRules.MinimumTargetCount,
                MaximumTargetCount: node.TargetRules.MaximumTargetCount,
                AutoSelectAllValidTargets: node.TargetRules.AutoSelectAllValidTargets);
        }

        return new SupportActivationTargetPlan(
            IsEnabled: true,
            DisabledReason: null,
            ValidTargets: candidates,
            ExactTargetCount: node.TargetRules.ExactTargetCount,
            MinimumTargetCount: node.TargetRules.MinimumTargetCount,
            MaximumTargetCount: node.TargetRules.MaximumTargetCount,
            AutoSelectAllValidTargets: node.TargetRules.AutoSelectAllValidTargets);
    }

    private static IReadOnlyList<GameEffectTargetReference> ResolveCandidates(
        GameInstance game,
        Card normalizedDefinition,
        CardInstance sourceInstance,
        EffectSpec node,
        IGameCardEffectRegistry effectRegistry,
        string actingPlayerId)
    {
        var context = new GameCardEffectContext(
            game: game,
            actingPlayer: new Player { Id = actingPlayerId },
            sourceCardDefinition: normalizedDefinition,
            sourceCardInstance: sourceInstance,
            arguments: new Dictionary<string, string>(StringComparer.Ordinal),
            selectedTargets: []);

        // Effects that target the resolution stack (Support Activated negates) publish their own
        // candidates; those replace the rule-based pool because "negate that card" means the activated
        // support, not every card in the opponent's support area.
        if (RuntimeEffectKeys.TryResolve(node.RuntimeEffectType, out var effectKey)
            && effectRegistry.TryResolve(effectKey, out var effect)
            && effect is not null)
        {
            var effectTargets = effect.GetValidTargets(context);
            if (effectTargets.Any(target => target.IsEffectResolutionStackTarget))
            {
                return effectTargets;
            }
        }

        return new EffectTargetResolver().ResolveTargets(context, node);
    }
}
