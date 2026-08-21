namespace ProjectHiddenVillage.Server.Api.Interfaces.Game;

public interface IGameRuntimeEffectSpecResolver
{
    EffectSpec? Resolve(GameCardEffectContext context, RuntimeEffects runtimeEffect);
}
