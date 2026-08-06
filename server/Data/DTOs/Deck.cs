using ProjectHiddenVillage.Server.Data.Entities;

namespace ProjectHiddenVillage.Server.Data.DTOs;

public sealed record CreateDeckRequest(
    DeckType Type,
    string Cards,
    Guid? UserId = null);
