using ProjectHiddenVillage.Server.Data.Entities;

namespace ProjectHiddenVillage.Server;

internal sealed record ResolvedPlayerDeck(
    Player Player,
    IReadOnlyDictionary<string, Card> CardDefinitions);
