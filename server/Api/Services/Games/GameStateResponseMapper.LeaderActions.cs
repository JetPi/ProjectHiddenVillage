using ErrorOr;
using ProjectHiddenVillage.Server.Engine;
using ProjectHiddenVillage.Server.Engine.Interfaces;

namespace ProjectHiddenVillage.Server.Api.Services.Games;

public static partial class GameStateResponseMapper
{
    private static LeaderCardInstanceResponse ToLeaderCardInstanceResponse(
        LeaderCardInstanceState? leader,
        GameState state,
        PlayerState player,
        bool isRequestingPlayer,
        GamePrompt? pendingPrompt)
    {
        var resolvedPower = leader is null ? 0 : CardRuntimeEffectStateService.ResolveEffectiveLeaderPower(state, leader);
        var resolvedDamage = leader is null ? 0 : CardRuntimeEffectStateService.ResolveEffectiveLeaderDamage(state, leader);
        var resolvedCurrentLife = leader is null ? 0 : CardRuntimeEffectStateService.ResolveEffectiveLeaderCurrentLife(state, leader);
        var availableActions = BuildLeaderAvailableActions(leader, state, player, isRequestingPlayer, pendingPrompt);

        return new LeaderCardInstanceResponse(
            InstanceId: leader!.InstanceId,
            CardDefinitionId: leader!.CardDefinitionId,
            OwnerPlayerId: leader!.OwnerPlayerId,
            ControllerPlayerId: leader!.ControllerPlayerId,
            DisplayName: leader!.Name,
            Color: leader!.Color,
            Traits: leader!.Traits,
            Damage: resolvedDamage,
            Power: resolvedPower,
            TotalLife: leader!.TotalLife,
            CurrentLife: resolvedCurrentLife,
            RecoveryEffect: leader!.RecoveryEffect)
        {
            IsExhausted = leader.IsExhausted,
            IsRested = leader.IsRested,
            AvailableActions = availableActions
        };
    }

    private static IReadOnlyList<GameActionOptionResponse> BuildLeaderAvailableActions(
        LeaderCardInstanceState? leader,
        GameState state,
        PlayerState player,
        bool isRequestingPlayer,
        GamePrompt? pendingPrompt)
    {
        if (!isRequestingPlayer || pendingPrompt is not null || leader is null)
        {
            return [];
        }

        if (!state.CardDefinitions.TryGetValue(leader.CardDefinitionId, out var leaderDefinition))
        {
            return [];
        }

        var actions = BuildCardAbilityOptions(
            state,
            player,
            leaderDefinition,
            sourceCardInstance: null,
            sourceCardInstanceId: leader.InstanceId,
            actionPrefix: LeaderEffectActionPrefix);

        // Leaders declare battle exactly like battlefield cards do: the Battle action is always
        // published for the requesting player's leader (enabled or disabled with a reason).
        actions.AddRange(BuildBattleActionOptions(leader, state, isLeader: true));

        return actions;
    }

    /// <summary>
    /// The independently activatable abilities of one card, published as
    /// <c>{actionPrefix}{instanceId}:{effectKey}</c>. Leaders (<c>leader-effect:</c>) and battlefield
    /// characters (<c>character-ability:</c>) share this: the abilities are authored the same way and the same
    /// timing / once-per-turn / availability rules decide their chips.
    /// </summary>
    private static List<GameActionOptionResponse> BuildCardAbilityOptions(
        GameState state,
        PlayerState player,
        Card sourceCardDefinition,
        CardInstance? sourceCardInstance,
        string sourceCardInstanceId,
        string actionPrefix)
    {
        var candidateEffects = new List<(EffectSpec Effect, int Index, string EffectKey, string BaseLabel)>();
        foreach (var entry in sourceCardDefinition.Effects.Select((effect, index) => new { Effect = effect, Index = index }))
        {
            // A subordinate node is a step of another ability's chain ("draw 1 card, then place 1 card from
            // your hand on top of your deck"), not an independently activatable ability, so it never gets its
            // own action - the chain reaches it through its parent's success branch.
            if (entry.Effect.IsSubordinate)
            {
                continue;
            }

            // A passive (N-007's conditional Rush) is resolved by the engine whenever a mutation triggers it.
            // It has no activation window of its own, so publishing a chip for it would offer the player an
            // ability that is not theirs to activate.
            if (entry.Effect.PassiveMode != PassiveMode.None)
            {
                continue;
            }

            if (!CardAbilityTimingRules.IsAbilityTimingAvailable(entry.Effect.Timing, state, player.PlayerId))
            {
                continue;
            }

            var effectKey = ResolveEffectKey(entry.Effect, entry.Index);
            var baseLabel = BuildEffectOptionLabel(entry.Effect);
            candidateEffects.Add((entry.Effect, entry.Index, effectKey, baseLabel));
        }

        var labelCounts = new Dictionary<string, int>(StringComparer.Ordinal);
        foreach (var candidate in candidateEffects)
        {
            if (labelCounts.TryGetValue(candidate.BaseLabel, out var currentCount))
            {
                labelCounts[candidate.BaseLabel] = currentCount + 1;
                continue;
            }

            labelCounts[candidate.BaseLabel] = 1;
        }

        var labelOrdinals = new Dictionary<string, int>(StringComparer.Ordinal);
        var actions = new List<GameActionOptionResponse>(capacity: candidateEffects.Count);
        GameInstance? evaluationGame = null;
        foreach (var candidate in candidateEffects)
        {
            var label = candidate.BaseLabel;
            if (labelCounts[label] > 1)
            {
                labelOrdinals.TryGetValue(label, out var currentOrdinal);
                var nextOrdinal = currentOrdinal + 1;
                labelOrdinals[label] = nextOrdinal;
                label = $"{label} ({nextOrdinal})";
            }

            var actionId = $"{actionPrefix}{sourceCardInstanceId}:{candidate.EffectKey}";
            var (isEnabled, disabledReason) = candidate.Effect.GlobalRestrictions == EffectRestrictions.OncePerTurn
                && state.IsEffectUsedThisTurn(player.PlayerId, sourceCardInstanceId, candidate.EffectKey)
                    ? (false, EffectRestrictionMessages.OncePerTurn)
                    : EvaluateEffectAvailability(
                        state,
                        player,
                        sourceCardDefinition,
                        sourceCardInstance,
                        candidate.Effect,
                        ref evaluationGame);

            actions.Add(new GameActionOptionResponse(
                ActionId: actionId,
                Label: label,
                IsEnabled: isEnabled,
                DisabledReason: disabledReason));
        }

        return actions;
    }

    private static string ResolveEffectKey(EffectSpec effectSpec, int effectIndex)
    {
        if (!string.IsNullOrWhiteSpace(effectSpec.Id))
        {
            return effectSpec.Id.Trim();
        }

        return $"index-{effectIndex}";
    }
}
