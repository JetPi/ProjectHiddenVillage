using ProjectHiddenVillage.Server.Api.Interfaces.Game;

namespace ProjectHiddenVillage.Server.Api.Services.Games;

public sealed class GameRuntimeEffectSpecResolver : IGameRuntimeEffectSpecResolver
{
    public EffectSpec? Resolve(GameCardEffectContext context, RuntimeEffects runtimeEffect)
    {
        return context.SourceCardDefinition.Effects
            .FirstOrDefault(effect => effect.RuntimeEffectType == runtimeEffect);
    }
}
