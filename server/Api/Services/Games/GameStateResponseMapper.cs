using ErrorOr;
using ProjectHiddenVillage.Server.Engine;
using ProjectHiddenVillage.Server.Engine.Interfaces;

namespace ProjectHiddenVillage.Server.Api.Services.Games;

public static partial class GameStateResponseMapper
{
    /// <summary>
    /// How many notices the response carries. They are transient (the client shows the newest unseen one), so a
    /// short tail is enough; the action log itself keeps the full history for auditing.
    /// </summary>
    private const int MaxEffectNotices = 20;

    public static GameStateResponse ToGameStateResponse(GameInstance game, string requestingPlayerId)
    {
        ArgumentNullException.ThrowIfNull(game);

        return ToGameStateResponse(
            game.State,
            requestingPlayerId,
            game.GetPendingPrompt(),
            BuildEffectNotices(game, requestingPlayerId));
    }

    public static GameStateResponse ToGameStateResponse(GameState state, string requestingPlayerId)
    {
        return ToGameStateResponse(state, requestingPlayerId, pendingPrompt: null, effectNotices: null);
    }

    private static GameStateResponse ToGameStateResponse(
        GameState state,
        string requestingPlayerId,
        GamePrompt? pendingPrompt,
        IReadOnlyList<EffectNoticeResponse>? effectNotices)
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
                .ConvertAll(player => ToPlayerZonesResponse(player, requestingPlayerId, state, pendingPrompt)),
            IsSupportResponseWindowOpen: state.Phase == GamePhase.MainPhase
                && SupportTimingRules.HasPendingSupportActivation(state),
            SupportChain: BuildSupportChain(state),
            EffectNotices: effectNotices);
    }

    /// <summary>
    /// Projects the tail of the game's action log into the notices the requesting player should see, oldest
    /// first. A notice belongs to the player whose effect produced it, so the opponent's client is never told
    /// about a candidate pool it could not see.
    /// </summary>
    private static IReadOnlyList<EffectNoticeResponse> BuildEffectNotices(GameInstance game, string requestingPlayerId)
    {
        var notices = new List<EffectNoticeResponse>();
        var log = game.ActionLog;

        for (var index = log.Count - 1; index >= 0 && notices.Count < MaxEffectNotices; index--)
        {
            var entry = log[index];

            if (!EffectNoticeActionTypes.IsNotice(entry.ActionType))
            {
                continue;
            }

            if (!string.IsNullOrWhiteSpace(entry.PlayerId) && !IsSamePlayerId(entry.PlayerId, requestingPlayerId))
            {
                continue;
            }

            notices.Add(ToEffectNoticeResponse(entry));
        }

        notices.Reverse();
        return notices;
    }

    private static EffectNoticeResponse ToEffectNoticeResponse(GameActionLogEntry entry)
    {
        return new EffectNoticeResponse(
            NoticeId: entry.EntryId,
            ActionType: entry.ActionType,
            Message: entry.Message,
            PlayerId: string.IsNullOrWhiteSpace(entry.PlayerId) ? null : entry.PlayerId,
            SourceCardInstanceId: ReadMetadataValue(entry, "sourceCardInstanceId"),
            SourceCardDisplayName: ReadMetadataValue(entry, "sourceCardDisplayName"),
            SelectionPromptKind: ReadMetadataValue(entry, "selectionPromptKind"));
    }

    private static string? ReadMetadataValue(GameActionLogEntry entry, string key)
    {
        return entry.Metadata.TryGetValue(key, out var value) && !string.IsNullOrWhiteSpace(value)
            ? value
            : null;
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
            Options: options,
            SelectionPromptKind: isAwaitingRequestingPlayer && pendingPrompt.Type == GamePromptType.Effect
                ? pendingPrompt.SelectionPromptKind.ToString()
                : null,
            CandidateZone: isAwaitingRequestingPlayer && pendingPrompt.Type == GamePromptType.Effect
                ? pendingPrompt.CandidateZone?.ToString()
                : null,
            MinimumSelection: pendingPrompt.Type == GamePromptType.Effect ? pendingPrompt.MinimumSelection : null,
            MaximumSelection: pendingPrompt.Type == GamePromptType.Effect ? pendingPrompt.MaximumSelection : null,
            CandidatePlayerId: isAwaitingRequestingPlayer && pendingPrompt.Type == GamePromptType.Effect
                ? pendingPrompt.CandidatePlayerId
                : null);
    }

}
