namespace ProjectHiddenVillage.Server.Api.Services.Games;

/// <summary>
/// Works out which effects a support activation actually runs, and in what order.
///
/// Card data is authored by an external ingestion flow, so array order alone is not a safe execution
/// order:
/// <list type="bullet">
/// <item>an effect that another effect branches to (via <c>OnSuccessEffectId</c>/<c>OnFailureEffectId</c>)
/// is a chain step, not a root, even when the ingestion left <c>IsSubordinate</c> false - N-009 lists
/// "reduce your life by 2" before the negate that branches to it;</item>
/// <item>a card can have several unlinked roots (N-016 lists the chakra lock before the negate), so the
/// plan is a list of root groups rather than one chain.</item>
/// </list>
///
/// The plan is therefore: every root (declared order after the documented negate-first rule) followed by
/// the effects reachable from it. The entry root determines the activation's chakra cost, which matches
/// every support card's printed <c>supportCost</c>.
///
/// <see cref="PlanActivationGroups"/> keeps those root groups separate because the sequential executor
/// walks a single chain per call: the activation replay executes one call per group, so a card whose
/// second root is not linked to the first (N-016's chakra lock) still runs its whole plan.
/// </summary>
public static class SupportActivationPlanner
{
    /// <summary>
    /// Ordered effects an activation of this card runs: every root group flattened, in plan order.
    /// </summary>
    public static IReadOnlyList<EffectSpec> PlanActivationNodes(Card cardDefinition)
    {
        return PlanActivationGroups(cardDefinition).SelectMany(group => group).ToList();
    }

    /// <summary>
    /// The activation's root groups: each unlinked root followed by the effects reachable from it.
    ///
    /// A card can declare several unlinked roots (N-016 declares the chakra lock *and* the negate), and every
    /// root has to run. The sequential executor walks a single chain per call, so the activation replay
    /// executes one call per group instead of running the whole plan in one go.
    /// </summary>
    public static IReadOnlyList<IReadOnlyList<EffectSpec>> PlanActivationGroups(Card cardDefinition)
    {
        ArgumentNullException.ThrowIfNull(cardDefinition);

        var effects = cardDefinition.Effects;
        if (effects.Count == 0)
        {
            return [];
        }

        var effectById = BuildEffectById(effects);
        var branchTargetIds = BuildBranchTargetIds(effects);
        var roots = effects
            .Where(effect => IsRoot(effect, branchTargetIds))
            .ToList();

        if (roots.Count == 0)
        {
            // Degenerate data (every effect is a branch target, or every effect is flagged
            // subordinate): fall back to declared order so the card is not silently inert.
            roots = [effects[0]];
        }

        roots = OrderRoots(roots);

        var groups = new List<IReadOnlyList<EffectSpec>>(roots.Count + 1);
        var emittedIds = new HashSet<string>(StringComparer.Ordinal);

        foreach (var root in roots)
        {
            var group = new List<EffectSpec>(effects.Count);
            EmitGroup(root, effectById, group, emittedIds, new HashSet<string>(StringComparer.Ordinal));
            groups.Add(group);
        }

        // Anything unreachable from a root (malformed branch ids) is emitted as its own group in declared
        // order so a card can never lose an effect entirely.
        var leftovers = new List<EffectSpec>();
        foreach (var effect in effects)
        {
            var nodeId = NormalizeEffectId(effect.Id);
            if (nodeId is null || emittedIds.Contains(nodeId))
            {
                continue;
            }

            leftovers.Add(effect);
            emittedIds.Add(nodeId);
        }

        if (leftovers.Count > 0)
        {
            groups.Add(leftovers);
        }

        return groups;
    }

    /// <summary>The effect a support activation starts from, or null when the card has no effects.</summary>
    public static EffectSpec? ResolveEntry(Card cardDefinition)
    {
        var nodes = PlanActivationNodes(cardDefinition);
        return nodes.Count == 0 ? null : nodes[0];
    }

    /// <summary>
    /// Chakra paid to activate. Support cards declare the cost on the effect the player activates
    /// (their chain steps carry no cost of their own), while the printed <c>supportCost</c> matches it.
    /// </summary>
    public static int ResolveActivationCost(EffectSpec? entryEffect)
    {
        return entryEffect?.ChakraCost is > 0 ? entryEffect.ChakraCost.Value : 0;
    }

    private static IReadOnlyDictionary<string, EffectSpec> BuildEffectById(IReadOnlyList<EffectSpec> effects)
    {
        var effectById = new Dictionary<string, EffectSpec>(StringComparer.Ordinal);

        foreach (var effect in effects)
        {
            var nodeId = NormalizeEffectId(effect.Id);
            if (nodeId is not null)
            {
                effectById.TryAdd(nodeId, effect);
            }
        }

        return effectById;
    }

    private static HashSet<string> BuildBranchTargetIds(IReadOnlyList<EffectSpec> effects)
    {
        var branchTargetIds = new HashSet<string>(StringComparer.Ordinal);

        foreach (var effect in effects)
        {
            var onSuccess = NormalizeEffectId(effect.OnSuccessEffectId);
            if (onSuccess is not null)
            {
                branchTargetIds.Add(onSuccess);
            }

            var onFailure = NormalizeEffectId(effect.OnFailureEffectId);
            if (onFailure is not null)
            {
                branchTargetIds.Add(onFailure);
            }
        }

        return branchTargetIds;
    }

    private static bool IsRoot(EffectSpec effect, HashSet<string> branchTargetIds)
    {
        if (effect.IsSubordinate)
        {
            return false;
        }

        var nodeId = NormalizeEffectId(effect.Id);
        return nodeId is null || !branchTargetIds.Contains(nodeId);
    }

    private static List<EffectSpec> OrderRoots(List<EffectSpec> roots)
    {
        if (roots.Count <= 1)
        {
            return roots;
        }

        // "[Support Activated] Negate that card. Then, ..." (N-016) declares the negate after the
        // follow-up effect with no branch linking them. The negate is the response the player is
        // actually activating, so it resolves before the rest of the card's effects.
        var negateIndex = roots.FindIndex(root =>
            root.RuntimeEffectType == RuntimeEffects.NegateEffect
            && root.Timing == EffectTiming.SupportActivated);

        if (negateIndex <= 0)
        {
            return roots;
        }

        var ordered = new List<EffectSpec>(roots.Count) { roots[negateIndex] };
        ordered.AddRange(roots.Where((_, index) => index != negateIndex));
        return ordered;
    }

    private static void EmitGroup(
        EffectSpec root,
        IReadOnlyDictionary<string, EffectSpec> effectById,
        List<EffectSpec> planned,
        HashSet<string> emittedIds,
        HashSet<string> visitedInGroup)
    {
        planned.Add(root);
        var rootId = NormalizeEffectId(root.Id);
        if (rootId is not null)
        {
            emittedIds.Add(rootId);
            visitedInGroup.Add(rootId);
        }

        foreach (var branchId in new[]
        {
            NormalizeEffectId(root.OnSuccessEffectId),
            NormalizeEffectId(root.OnFailureEffectId),
        })
        {
            if (branchId is null
                || visitedInGroup.Contains(branchId)
                || !effectById.TryGetValue(branchId, out var branch))
            {
                continue;
            }

            EmitGroup(branch, effectById, planned, emittedIds, visitedInGroup);
        }
    }

    private static string? NormalizeEffectId(string? effectId)
    {
        return string.IsNullOrWhiteSpace(effectId) ? null : effectId.Trim();
    }
}
