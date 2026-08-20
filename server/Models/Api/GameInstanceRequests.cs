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