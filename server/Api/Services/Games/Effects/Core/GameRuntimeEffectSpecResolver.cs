using ProjectHiddenVillage.Server.Api.Interfaces.Game;

namespace ProjectHiddenVillage.Server.Api.Services.Games;

public sealed class GameRuntimeEffectSpecResolver : IGameRuntimeEffectSpecResolver
{
    private const string FallbackEffectKeyArgument = "__leaderEffectKey";

    public EffectSpec? Resolve(GameCardEffectContext context, RuntimeEffects runtimeEffect)
    {
        if (context.Arguments.TryGetValue(FallbackEffectKeyArgument, out var fallbackEffectKey)
            && !string.IsNullOrWhiteSpace(fallbackEffectKey))
        {
            var byFallbackKey = context.SourceCardDefinition.Effects
                .Select((effect, index) => new { Effect = effect, Index = index })
                .FirstOrDefault(entry =>
                    string.Equals(ResolveEffectKey(entry.Effect, entry.Index), fallbackEffectKey, StringComparison.Ordinal)
                    && entry.Effect.RuntimeEffectType == runtimeEffect)
                ?.Effect;

            if (byFallbackKey is not null)
            {
                return byFallbackKey;
            }
        }

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

    private static string ResolveEffectKey(EffectSpec effectSpec, int effectIndex)
    {
        if (!string.IsNullOrWhiteSpace(effectSpec.Id))
        {
            return effectSpec.Id.Trim();
        }

        return $"index-{effectIndex}";
    }
}
