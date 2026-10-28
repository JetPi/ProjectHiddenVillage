namespace ProjectHiddenVillage.Server;

public sealed record CreateGameForUserRequest(
    Guid UserId,
    Guid DeckId,
    // Optional: a game created for an invite carries the format it was created for, so anyone holding the code
    // is admitted only with a deck that fits it.
    Guid? RulesetId = null,
    // Host-only table rules (see GameModifierKeys). Quick match has no modifier field at all, which is what keeps a
    // "time relaxed" table unrequestable from the queue rather than merely hidden from its UI.
    IReadOnlyList<string>? Modifiers = null);

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