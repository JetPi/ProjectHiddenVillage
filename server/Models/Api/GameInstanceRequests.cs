namespace ProjectHiddenVillage.Server;

public sealed record CreateGameInstanceRequest(
    List<Player> Players,
    List<Card> CardDefinitions);

public sealed record JoinGameInstanceRequest(Player Player);

public sealed record ResolvePromptRequest(
    string RequestedPlayerId,
    string SelectedOption);

public sealed record PlayerPhaseActionRequest(string PlayerId);