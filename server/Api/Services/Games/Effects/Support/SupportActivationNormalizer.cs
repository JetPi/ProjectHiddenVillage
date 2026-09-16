using ProjectHiddenVillage.Server.Engine;

namespace ProjectHiddenVillage.Server.Api.Services.Games;

/// <summary>
/// Prepares a support activation for execution and for target planning.
///
/// A support activation runs the card's planned nodes against the source card instance, so two data
/// shapes must be normalised before either the client is asked for targets or the engine executes:
/// <list type="bullet">
/// <item><b>"Summon this card"</b> (N-002/N-008/N-010/N-021) is authored as a summon candidate rule
/// pointing at the zone the card is activated from. The summoned card is the source itself, so the node
/// must not ask the player to pick it (N-010's node even uses <c>Selected Targets</c>, which would
/// consume whichever target the player chose for another node).</item>
/// <item><b>Own-leader modifications</b> (N-009's "reduce your life by 2", N-010's life gain) apply to
/// the leader by target range; the effect resolves them itself, so a selection is never required and
/// the node's target rules must not demand one.</item>
/// </list>
/// </summary>
public static class SupportActivationNormalizer
{
    /// <summary>
    /// Game-local copy of <paramref name="sourceDefinition"/> containing exactly the activation's
    /// planned nodes, with the source-supplied nodes normalised.
    /// </summary>
    public static Card NormalizeForActivation(GameState state, Card sourceDefinition, CardInstance? sourceInstance)
    {
        ArgumentNullException.ThrowIfNull(state);
        ArgumentNullException.ThrowIfNull(sourceDefinition);

        return NormalizeForActivation(
            state,
            sourceDefinition,
            sourceInstance,
            SupportActivationPlanner.PlanActivationNodes(sourceDefinition));
    }

    /// <summary>
    /// Normalises one planned root group (see <see cref="SupportActivationPlanner.PlanActivationGroups"/>),
    /// so the caller can execute the plan group by group.
    /// </summary>
    public static Card NormalizeForActivation(
        GameState state,
        Card sourceDefinition,
        CardInstance? sourceInstance,
        IReadOnlyList<EffectSpec> plannedNodes)
    {
        ArgumentNullException.ThrowIfNull(state);
        ArgumentNullException.ThrowIfNull(sourceDefinition);
        ArgumentNullException.ThrowIfNull(plannedNodes);

        var normalizedEffects = plannedNodes
            .Select(effect => NormalizeEffect(state, sourceDefinition, sourceInstance, effect))
            .ToList();

        return CardDefinitionCloner.CloneWithEffects(sourceDefinition, normalizedEffects);
    }

    /// <summary>Normalises a single node without cloning the surrounding definition.</summary>
    public static EffectSpec NormalizeEffect(
        GameState state,
        Card sourceDefinition,
        CardInstance? sourceInstance,
        EffectSpec effect)
    {
        ArgumentNullException.ThrowIfNull(state);
        ArgumentNullException.ThrowIfNull(sourceDefinition);
        ArgumentNullException.ThrowIfNull(effect);

        if (IsSourceSuppliedSummon(state, sourceDefinition, sourceInstance, effect))
        {
            return WithSelectionFreeTargets(effect, EffectExecutionTargetSource.SourceCard);
        }

        if (IsOwnLeaderOnlyModification(effect))
        {
            return WithSelectionFreeTargets(effect, EffectExecutionTargetSource.None);
        }

        if (IsOwnStateEffect(effect))
        {
            return WithSelectionFreeTargets(effect, EffectExecutionTargetSource.None);
        }

        return effect;
    }

    private static EffectSpec WithSelectionFreeTargets(EffectSpec effect, EffectExecutionTargetSource targetSource)
    {
        var normalized = effect.Clone();
        normalized.ExecutionTargetSource = targetSource;
        normalized.TargetRules = new EffectTargetRuleSet
        {
            Operator = effect.TargetRules.Operator,
            AutoSelectAllValidTargets = false,
        };

        return normalized;
    }

    private static bool IsSourceSuppliedSummon(
        GameState state,
        Card sourceDefinition,
        CardInstance? sourceInstance,
        EffectSpec effect)
    {
        if (sourceInstance is null || effect.RuntimeEffectType != RuntimeEffects.SummonCard)
        {
            return false;
        }

        var rules = effect.TargetRules.Rules;
        if (rules.Count == 0)
        {
            return false;
        }

        return rules.All(rule =>
            IsSelfScopedSummonRule(rule)
            // Any additional predicates must hold for the source card itself: a rule describing some
            // other card in the same zone must keep its player selection.
            && ZoneCardRestrictionMatcher.Matches(
                state,
                sourceDefinition,
                rule.Restriction,
                cardInstance: sourceInstance,
                sourceCardInstance: sourceInstance));
    }

    private static bool IsSelfScopedSummonRule(EffectTargetRule rule)
    {
        if (rule.TributeRole != TributeTargetRole.SummonCandidate
            || rule.Scope != EffectTargetRange.Self
            || rule.InZone is not (PlayerZone.Hand or PlayerZone.SupportZone))
        {
            return false;
        }

        var predicates = rule.Restriction.Predicates;
        if (predicates is not { Count: > 0 })
        {
            return true;
        }

        return predicates.Any(predicate => predicate.Property == ZoneCardProperty.Self);
    }

    private static bool IsOwnLeaderOnlyModification(EffectSpec effect)
    {
        return effect.AttributeModifications.Count > 0
            && effect.AttributeModifications.All(modification =>
                modification.TargetType == AttributeModificationTargetType.Leader)
            && effect.KeywordModifications.All(modification =>
                modification.TargetType != KeywordModificationTargetType.SelectedTargets)
            && effect.MoveCardActions.Count == 0
            && effect.SummonCardFlips.Count == 0
            && effect.FaceStateLocks.Count == 0;
    }

    /// <summary>
    /// A node that only changes the acting player's own state - their chakra face state (N-016) or their
    /// chakra recovery - resolves its audience by <see cref="EffectSpec.TargetRange"/>, so a selection is
    /// never required.
    ///
    /// Ingested data can still mark such a node as <c>Selected Targets</c> while declaring no target rules
    /// at all (N-016's chakra lock was authored exactly that way), which leaves the activation planner
    /// asking for a pick that cannot exist: "No valid targets available." Normalising the node to a
    /// selection-free one is what keeps those cards playable instead of unplayable.
    /// </summary>
    private static bool IsOwnStateEffect(EffectSpec effect)
    {
        // A node that could ask for a card selection is left alone, even when its rules are incomplete:
        // silently neutering an authored selection would hide the authoring bug instead of surfacing it.
        if (effect.TargetRules.Rules.Count > 0
            || effect.TargetRules.ExactTargetCount.HasValue
            || effect.TargetRules.MinimumTargetCount.HasValue
            || effect.TargetRules.MaximumTargetCount.HasValue)
        {
            return false;
        }

        if (effect.MoveCardActions.Count > 0
            || effect.KeywordModifications.Any(modification =>
                modification.TargetType == KeywordModificationTargetType.SelectedTargets)
            || effect.AttributeModifications.Any(modification =>
                modification.TargetType == AttributeModificationTargetType.SelectedTargets))
        {
            return false;
        }

        // The chakra recovery lock is player-scoped by design: its audience is the effect's TargetRange,
        // so it needs no selection whichever player it points at.
        if (effect.RuntimeEffectType == RuntimeEffects.LockChakraRecovery)
        {
            return true;
        }

        var hasOwnStatePayload = effect.FaceStateLocks.Count > 0
            || effect.ChakraAdjustments.Count > 0
            || effect.SummonCardFlips.Count > 0
            || effect.AttributeModifications.Count > 0;

        return hasOwnStatePayload
            && effect.TargetRange == EffectTargetRange.Self
            && effect.FaceStateLocks.All(faceStateLock => faceStateLock.TargetRange == EffectTargetRange.Self)
            && effect.ChakraAdjustments.All(adjustment => adjustment.TargetRange == EffectTargetRange.Self)
            && effect.SummonCardFlips.All(flip => flip.TargetRange == EffectTargetRange.Self);
    }
}
