using ProjectHiddenVillage.Server.Api.Interfaces.Game;

namespace ProjectHiddenVillage.Server.Api.Services.Games;

public sealed class GameRuntimeEffectSpecResolver : IGameRuntimeEffectSpecResolver
{
    public EffectSpec? Resolve(GameCardEffectContext context, RuntimeEffects runtimeEffect)
    {
        if (context.Arguments.TryGetValue(ReactiveEffectExecutionConstants.ActiveEffectSpecIdArgument, out var effectSpecId)
            && !string.IsNullOrWhiteSpace(effectSpecId))
        {
            var byId = context.SourceCardDefinition.Effects.FirstOrDefault(effect =>
                string.Equals(effect.Id, effectSpecId, StringComparison.Ordinal)
                && effect.RuntimeEffectType == runtimeEffect);

            if (byId is not null)
            {
                return byId;
            }
        }

        return context.SourceCardDefinition.Effects
            .FirstOrDefault(effect => effect.RuntimeEffectType == runtimeEffect);
    }
}
