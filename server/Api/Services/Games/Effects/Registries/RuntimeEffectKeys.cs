namespace ProjectHiddenVillage.Server.Api.Services.Games;

/// <summary>
/// Maps a card's <see cref="RuntimeEffects"/> value onto the <see cref="IGameCardEffect.EffectTypeKey"/>
/// registered in <see cref="GameCardEffectRegistry"/>. Single source of that mapping - the sequential
/// executor and the support activation planner both need it.
/// </summary>
internal static class RuntimeEffectKeys
{
    public static bool TryResolve(RuntimeEffects runtimeEffectType, out string effectTypeKey)
    {
        effectTypeKey = runtimeEffectType switch
        {
            RuntimeEffects.DestroyCard => DestroyCardEffect.EffectKey,
            RuntimeEffects.NegateEffect => NegateCardEffect.EffectKey,
            RuntimeEffects.FreezeCard => FreezeCardEffect.EffectKey,
            RuntimeEffects.InterruptAttack => InterruptAttackEffect.EffectKey,
            RuntimeEffects.GainEffect => GainKeywordEffect.EffectKey,
            RuntimeEffects.ChangeValues => ModifyAttributeEffect.EffectKey,
            RuntimeEffects.AlterResources => AlterResourcesEffect.EffectKey,
            RuntimeEffects.Tribute => TributeSummonCardEffect.EffectKey,
            RuntimeEffects.SummonCard => SummonCardEffect.EffectKey,
            RuntimeEffects.MoveCard => MoveCardEffect.EffectKey,
            RuntimeEffects.RevealCard => RevealCardEffect.EffectKey,
            RuntimeEffects.LockChakraRecovery => LockChakraRecoveryEffect.EffectKey,
            RuntimeEffects.SearchCard => SearchCardEffect.EffectKey,
            _ => string.Empty,
        };

        return !string.IsNullOrWhiteSpace(effectTypeKey);
    }
}
