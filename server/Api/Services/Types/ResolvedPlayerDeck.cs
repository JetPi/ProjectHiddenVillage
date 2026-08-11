using ProjectHiddenVillage.Server.Data.Entities;

namespace ProjectHiddenVillage.Server;

public sealed record ResolvedPlayerDeck(
    Player Player,
    IReadOnlyDictionary<string, Card> CardDefinitions);
