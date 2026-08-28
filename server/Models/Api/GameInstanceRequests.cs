namespace ProjectHiddenVillage.Server;

public sealed record CreateGameForUserRequest(
    Guid UserId,
    Guid DeckId);

public sealed record JoinGameAsPlayer(
    Guid UserId,
    Guid? DeckId);

public sealed record GameInstanceResponse(
    string Id);

public sealed record ResolvePromptRequest(
    string RequestedPlayerId,
    string SelectedOption);

public sealed record PlayerPhaseActionRequest(string PlayerId);

public sealed record GameCardActionExecutionRequest(
    string PlayerId,
    string ActionId,
    string SourceCardInstanceId,
    IReadOnlyList<GameEffectTargetReference>? SelectedTargets = null,
    IReadOnlyDictionary<string, string>? Arguments = null);

public sealed record GameCardActionTargetsRequest(
    string PlayerId,
    string ActionId,
    string SourceCardInstanceId,
    IReadOnlyDictionary<string, string>? Arguments = null);