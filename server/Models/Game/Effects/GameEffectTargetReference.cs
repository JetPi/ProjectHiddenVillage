namespace ProjectHiddenVillage.Server;

public sealed record GameEffectTargetReference(
    string PlayerId,
    PlayerZone Zone,
    string CardInstanceId,
    string? SlotId = null,
    bool IsEffectResolutionStackTarget = false,
    string? EffectResolutionEntryId = null);