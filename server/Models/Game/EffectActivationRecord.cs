namespace ProjectHiddenVillage.Server;

/// <summary>
/// Records that a player activated a specific effect on a specific turn, so effects flagged with
/// <see cref="EffectRestrictions.OncePerTurn"/> can be enforced server-side.
/// </summary>
public sealed record EffectActivationRecord(
    string PlayerId,
    string SourceInstanceId,
    string EffectKey,
    int TurnNumber);
