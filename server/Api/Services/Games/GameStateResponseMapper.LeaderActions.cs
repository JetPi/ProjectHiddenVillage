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
            IsExhausted = false,
            IsRested = false,
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

        var candidateEffects = new List<(EffectSpec Effect, int Index, string EffectKey, string BaseLabel)>();
        foreach (var entry in leaderDefinition.Effects.Select((effect, index) => new { Effect = effect, Index = index }))
        {
            if (!IsLeaderEffectTimingAvailable(entry.Effect.Timing, state, player.PlayerId))
            {
                continue;
            }

            var effectKey = ResolveEffectKey(entry.Effect, entry.Index);
            var baseLabel = BuildEffectOptionLabel(entry.Effect);
            candidateEffects.Add((entry.Effect, entry.Index, effectKey, baseLabel));
        }

        if (candidateEffects.Count == 0)
        {
            return [];
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

            var actionId = $"{LeaderEffectActionPrefix}{leader.InstanceId}:{candidate.EffectKey}";
            var (isEnabled, disabledReason) = candidate.Effect.GlobalRestrictions == EffectRestrictions.OncePerTurn
                && state.IsEffectUsedThisTurn(player.PlayerId, leader.InstanceId, candidate.EffectKey)
                    ? (false, EffectRestrictionMessages.OncePerTurn)
                    : EvaluateEffectAvailability(
                        state,
                        player,
                        leaderDefinition,
                        sourceCardInstance: null,
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

    private static bool IsLeaderEffectTimingAvailable(EffectTiming timing, GameState state, string actingPlayerId)
    {
        var isActivePlayer = IsSamePlayerId(state.ActivePlayerId, actingPlayerId);
        var isPriorityPlayer = IsSamePlayerId(state.PriorityPlayerId, actingPlayerId);

        return timing switch
        {
            EffectTiming.ActivateMain or EffectTiming.DuringYourMain =>
                state.Phase == GamePhase.MainPhase && isActivePlayer,
            EffectTiming.WhenAttacking =>
                state.IsAttackDeclarationWindow() && isActivePlayer,
            EffectTiming.YourTurn => isActivePlayer,
            EffectTiming.Quick or EffectTiming.SupportActivated =>
                state.Phase == GamePhase.ActionStep && isPriorityPlayer,
            EffectTiming.DuringOpponentAttack =>
                state.HasPendingAttack && state.Phase == GamePhase.ActionStep && !isActivePlayer,
            _ => false,
        };
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
