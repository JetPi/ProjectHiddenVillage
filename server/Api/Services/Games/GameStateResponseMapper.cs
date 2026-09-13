using ErrorOr;
using ProjectHiddenVillage.Server.Engine;
using ProjectHiddenVillage.Server.Engine.Interfaces;

namespace ProjectHiddenVillage.Server.Api.Services.Games;

public static partial class GameStateResponseMapper
{
    public static GameStateResponse ToGameStateResponse(GameInstance game, string requestingPlayerId)
    {
        ArgumentNullException.ThrowIfNull(game);

        return ToGameStateResponse(game.State, requestingPlayerId, game.GetPendingPrompt());
    }

    public static GameStateResponse ToGameStateResponse(GameState state, string requestingPlayerId)
    {
        return ToGameStateResponse(state, requestingPlayerId, pendingPrompt: null);
    }

    private static GameStateResponse ToGameStateResponse(
        GameState state,
        string requestingPlayerId,
        GamePrompt? pendingPrompt)
    {
        var phaseData = PhaseStateService.GetPhaseData(state.Phase);

        return new GameStateResponse(
            GameId: state.GameId,
            TurnNumber: state.TurnNumber,
            ActivePlayerId: state.ActivePlayerId,
            PriorityPlayerId: state.PriorityPlayerId,
            Phase: state.Phase.ToString(),
            AttackSequenceStage: ResolveAttackSequenceStage(state),
            IsAttackSequencePending: state.HasPendingAttack,
            PendingAttackVisualState: ResolvePendingAttackVisualState(state),
            PendingPrompt: ToPendingPromptResponse(pendingPrompt, requestingPlayerId),
            AvailableActions: BuildAvailableActions(state, phaseData, requestingPlayerId, pendingPrompt),
            ActiveTemporaryEffects: CardRuntimeEffectStateService
                .BuildTemporaryEffectProjections(state)
                .Select(effect => new ActiveTemporaryEffectResponse(
                    EffectId: effect.EffectId,
                    SourceCardInstanceId: effect.SourceCardInstanceId,
                    TargetCardInstanceId: effect.TargetCardInstanceId,
                    ModifierKind: effect.ModifierKind,
                    DurationMode: effect.DurationMode,
                    Attribute: effect.Attribute,
                    Operation: effect.Operation,
                    Value: effect.Value,
                    Keyword: effect.Keyword,
                    FaceStateTargetCategory: effect.FaceStateTargetCategory,
                    TargetPlayerId: effect.TargetPlayerId,
                    AppliedTurnNumber: effect.AppliedTurnNumber))
                .ToList(),
            Players: state.Players
                .ConvertAll(player => ToPlayerZonesResponse(player, requestingPlayerId, state, pendingPrompt)));
    }

    private static string? ResolveAttackSequenceStage(GameState state)
    {
        if (!state.HasPendingAttack)
        {
            return null;
        }

        return state.Phase switch
        {
            GamePhase.ActionStep => "SupportCutIn",
            GamePhase.AttackResolution => "DamageStep",
            _ => null,
        };
    }

    private static PendingAttackVisualStateResponse? ResolvePendingAttackVisualState(GameState state)
    {
        if (!state.HasPendingAttack)
        {
            return null;
        }

        if (string.IsNullOrWhiteSpace(state.PendingAttackAttackerInstanceId)
            || string.IsNullOrWhiteSpace(state.PendingAttackDefenderPlayerId)
            || state.PendingAttackDefenderZone is null)
        {
            return null;
        }

        return new PendingAttackVisualStateResponse(
            AttackerCardInstanceId: state.PendingAttackAttackerInstanceId,
            DefenderPlayerId: state.PendingAttackDefenderPlayerId,
            DefenderCardInstanceId: state.PendingAttackDefenderInstanceId,
            DefenderZone: state.PendingAttackDefenderZone.Value.ToString());
    }

    private static PendingPromptResponse? ToPendingPromptResponse(GamePrompt? pendingPrompt, string requestingPlayerId)
    {
        if (pendingPrompt is null)
        {
            return null;
        }

        var isAwaitingRequestingPlayer = IsSamePlayerId(
            pendingPrompt.RequestedPlayerId,
            requestingPlayerId);

        var options = isAwaitingRequestingPlayer
            ? pendingPrompt.Options
            : [];

        return new PendingPromptResponse(
            PromptId: pendingPrompt.PromptId,
            Type: pendingPrompt.Type.ToString(),
            IsAwaitingRequestingPlayer: isAwaitingRequestingPlayer,
            Options: options);
    }

}
