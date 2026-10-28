using System.Text.RegularExpressions;
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
            BuildEffectNotices(game, requestingPlayerId),
            isPhaseAutomationEnabled: game.IsPhaseAutomationEnabled,
            pendingPresentation: ToPhasePresentationResponse(game.PendingPhasePresentation),
            ruleset: game.Ruleset,
            clock: ToGameClockResponse(game),
            modifiers: game.Modifiers.Count == 0 ? null : game.Modifiers,
            actionLog: BuildActionLog(game, requestingPlayerId));
    }

    public static GameStateResponse ToGameStateResponse(GameState state, string requestingPlayerId)
    {
        return ToGameStateResponse(
            state,
            requestingPlayerId,
            pendingPrompt: null,
            effectNotices: null,
            isPhaseAutomationEnabled: false,
            pendingPresentation: null,
            ruleset: null,
            clock: null,
            modifiers: null,
            actionLog: null);
    }

    private static PhasePresentationResponse? ToPhasePresentationResponse(PendingPhasePresentation? presentation)
    {
        return presentation is null
            ? null
            : new PhasePresentationResponse(
                PresentationId: presentation.PresentationId,
                Phase: presentation.Phase.ToString(),
                Kind: presentation.Kind.ToString(),
                TurnNumber: presentation.TurnNumber,
                RequiredAckPlayerIds: [.. presentation.RequiredAckPlayerIds],
                AcknowledgedPlayerIds: [.. presentation.AcknowledgedPlayerIds]);
    }

    private static GameStateResponse ToGameStateResponse(
        GameState state,
        string requestingPlayerId,
        GamePrompt? pendingPrompt,
        IReadOnlyList<EffectNoticeResponse>? effectNotices,
        bool isPhaseAutomationEnabled,
        PhasePresentationResponse? pendingPresentation,
        GameRulesetBinding? ruleset,
        GameClockResponse? clock,
        IReadOnlyList<string>? modifiers,
        IReadOnlyList<ActionLogEntryResponse>? actionLog)
    {
        var phaseData = PhaseStateService.GetPhaseData(state.Phase);
        var hasOutcome = GameEndRules.IsGameOver(state);

        return new GameStateResponse(
            GameId: state.GameId,
            TurnNumber: state.TurnNumber,
            ActivePlayerId: state.ActivePlayerId,
            PriorityPlayerId: state.PriorityPlayerId,
            Phase: state.Phase.ToString(),
            AttackSequenceStage: ResolveAttackSequenceStage(state),
            IsAttackSequencePending: state.HasPendingAttack,
            PendingAttackVisualState: ResolvePendingAttackVisualState(state),
            // A finished game publishes no interaction at all: no prompt to answer, no action to take and no
            // reaction window. The result travels in GameOutcome below, and the board is purely decorative.
            PendingPrompt: hasOutcome ? null : ToPendingPromptResponse(pendingPrompt, requestingPlayerId),
            AvailableActions: hasOutcome
                ? []
                : BuildAvailableActions(state, phaseData, requestingPlayerId, pendingPrompt, isPhaseAutomationEnabled),
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
            IsSupportResponseWindowOpen: !hasOutcome
                && state.Phase == GamePhase.MainPhase
                && SupportTimingRules.HasPendingSupportActivation(state),
            SupportChain: hasOutcome ? [] : BuildSupportChain(state),
            EffectNotices: effectNotices,
            GameOutcome: ToGameOutcomeResponse(state.Outcome),
            // A finished game owes nobody a presentation: the result overlay is the only affordance left.
            PendingPresentation: hasOutcome ? null : pendingPresentation,
            // Card movements are the engine's own record of what it did, so the client animates them directly
            // instead of inferring a move from zone/count deltas.
            AnimationEvents: BuildAnimationEvents(state),
            Ruleset: ruleset is null
                ? null
                : new GameRulesetBindingResponse(
                    Id: ruleset.Id.ToString(),
                    Key: ruleset.Key,
                    Name: ruleset.Name),
            // A finished game has no clock left to run. An untimed table still publishes the block with
            // IsEnabled = false, so the client distinguishes it from a game whose clock has not started.
            Clock: hasOutcome ? null : clock,
            Modifiers: modifiers,
            ActionLog: actionLog);
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

    /// <summary>
    /// Projects the tail of the game's action log into the lines the requesting player may read, oldest first.
    ///
    /// <see cref="GameActionLogPublishing"/> decides what is published at all and who may see it: the log is the
    /// engine's audit trail, and it contains entries (a face-down support being set, a skipped effect with a raw
    /// instance id) that would hand the opponent information the board deliberately hides. Sequence numbers are
    /// the entry's index in the full log, not in this tail, so a truncated tail still orders correctly.
    /// </summary>
    private static IReadOnlyList<ActionLogEntryResponse> BuildActionLog(GameInstance game, string requestingPlayerId)
    {
        var log = game.ActionLog;
        var firstPublishedIndex = Math.Max(0, log.Count - GameActionLogPublishing.MaxPublishedEntries);
        var entries = new List<ActionLogEntryResponse>();

        for (var index = firstPublishedIndex; index < log.Count; index++)
        {
            var entry = log[index];

            if (!GameActionLogPublishing.IsVisibleTo(entry, requestingPlayerId))
            {
                continue;
            }

            entries.Add(ToActionLogEntryResponse(entry, sequence: index + 1));
        }

        return entries;
    }

    private static ActionLogEntryResponse ToActionLogEntryResponse(GameActionLogEntry entry, int sequence)
    {
        return new ActionLogEntryResponse(
            EntryId: entry.EntryId,
            Sequence: sequence,
            TimestampUtc: entry.TimestampUtc.ToUniversalTime().ToString("O", System.Globalization.CultureInfo.InvariantCulture),
            ActionType: entry.ActionType,
            Category: entry.Category.ToString(),
            PlayerId: string.IsNullOrWhiteSpace(entry.PlayerId) ? null : entry.PlayerId,
            // The two key spellings are both in use: the board-action entries speak of a card, the older effect
            // notices speak of a source card. Reading both keeps this projection a pure view of the log.
            CardInstanceId: ReadMetadataValue(entry, "cardInstanceId") ?? ReadMetadataValue(entry, "sourceCardInstanceId"),
            CardDefinitionId: ReadMetadataValue(entry, "cardDefinitionId"),
            DisplayName: ReadMetadataValue(entry, "displayName") ?? ReadMetadataValue(entry, "sourceCardDisplayName"),
            TargetInstanceId: ReadMetadataValue(entry, "targetInstanceId"),
            TargetDisplayName: ReadMetadataValue(entry, "targetDisplayName"),
            // Phase entries carry `toPhase` (a transition names both ends), every other entry carries `phase`.
            Phase: ReadMetadataValue(entry, "phase") ?? ReadMetadataValue(entry, "toPhase"),
            TurnNumber: ReadMetadataIntValue(entry, "turnNumber"),
            Message: SanitizePublishedMessage(entry.Message));
    }

    /// <summary>
    /// A GUID in either wire form (hyphenated or the 32-character "N" form an entry id uses). Published messages are
    /// the server's audit sentences, so an identifier here means someone wrote a log line for a log file rather than
    /// for a player. Rather than rewrite the sentence at the boundary - which would mean guessing what the token meant
    /// - the message is withheld, and the client shows its own wording or a neutral line.
    /// </summary>
    private static readonly Regex PublishedMessageIdentifierPattern = new(
        @"\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b|\b[0-9a-fA-F]{32}\b",
        RegexOptions.Compiled);

    private static string? SanitizePublishedMessage(string message)
    {
        if (string.IsNullOrWhiteSpace(message))
        {
            return null;
        }

        return PublishedMessageIdentifierPattern.IsMatch(message) ? null : message;
    }

    private static int? ReadMetadataIntValue(GameActionLogEntry entry, string key)
    {
        return entry.Metadata.TryGetValue(key, out var value)
            && int.TryParse(value, System.Globalization.NumberStyles.Integer, System.Globalization.CultureInfo.InvariantCulture, out var parsed)
                ? parsed
                : null;
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

    /// <summary>
    /// Projects the engine's recorded card movements into the animation-event tail the client consumes. Every
    /// movement is published to every player, because a card moving is visible on both boards - unlike the effect
    /// notices, which are addressed to the player whose effect produced them.
    /// </summary>
    private static IReadOnlyList<AnimationEventResponse> BuildAnimationEvents(GameState state)
    {
        return state.RecordedCardMovements
            .Select(movement => new AnimationEventResponse(
                EventId: movement.EventId,
                Kind: movement.Kind,
                CardInstanceId: movement.CardInstanceId,
                PlayerId: movement.PlayerId,
                FromZone: movement.FromZone,
                ToZone: movement.ToZone))
            .ToList();
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
