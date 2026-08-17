namespace ProjectHiddenVillage.Server;

public sealed record GameEffectTargetReference(
    string PlayerId,
    string Zone,
    string CardInstanceId,
    string? SlotId = null);