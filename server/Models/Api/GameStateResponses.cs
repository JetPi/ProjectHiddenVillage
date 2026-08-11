namespace ProjectHiddenVillage.Server;

public sealed record GameStateResponse(
    string GameId,
    int TurnNumber,
    string ActivePlayerId,
    string PriorityPlayerId,
    string Phase,
    IReadOnlyList<PlayerZonesResponse> Players);

public sealed record PlayerZonesResponse(
    string PlayerId,
    IReadOnlyList<CardInstanceResponse> Deck,
    int DeckCount,
    IReadOnlyList<CardInstanceResponse> Hand,
    int HandCount,
    IReadOnlyList<CardInstanceResponse> CharacterField,
    IReadOnlyList<CardInstanceResponse> SupportZone,
    IReadOnlyList<CardInstanceResponse> Trash,
    IReadOnlyList<CardInstanceResponse> ExileZone);

public sealed record CardInstanceResponse(
    string InstanceId,
    string CardDefinitionId,
    string OwnerPlayerId,
    string ControllerPlayerId,
    bool IsExhausted);