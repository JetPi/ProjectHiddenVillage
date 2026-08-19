using ErrorOr;
using ProjectHiddenVillage.Server.Api.Interfaces.Game;

namespace ProjectHiddenVillage.Server.Api.Services.Games;

public sealed class GameSequentialEffectExecutor(IGameCardEffectRegistry effectRegistry) : IGameSequentialEffectExecutor
{
    private readonly IGameCardEffectRegistry effectRegistry = effectRegistry;

    public ErrorOr<Success> Execute(GameCardEffectContext context)
    {
        ArgumentNullException.ThrowIfNull(context);

        foreach (var effectSpec in context.SourceCardDefinition.Effects)
        {
            if (!TryResolveEffectKey(effectSpec.RuntimeEffectType, out var effectTypeKey))
            {
                return Error.Validation(
                    code: "Game.Effect.Sequential.UnsupportedRuntimeEffect",
                    description: $"Runtime effect '{effectSpec.RuntimeEffectType}' is not supported by sequential execution.");
            }

            if (!effectRegistry.TryResolve(effectTypeKey, out var effect) || effect is null)
            {
                return Error.NotFound(
                    code: "Game.Effect.Sequential.EffectTypeNotRegistered",
                    description: $"Could not resolve effect type '{effectTypeKey}' for runtime effect '{effectSpec.RuntimeEffectType}'.");
            }

            var arguments = new Dictionary<string, string>(context.Arguments, StringComparer.Ordinal)
            {
                [ReactiveEffectExecutionConstants.ActiveEffectSpecIdArgument] = effectSpec.Id,
            };

            var perEffectContext = new GameCardEffectContext(
                game: context.Game,
                actingPlayer: context.ActingPlayer,
                sourceCardDefinition: context.SourceCardDefinition,
                sourceCardInstance: context.SourceCardInstance,
                arguments: arguments,
                selectedTargets: context.SelectedTargets);

            var executeResult = effect.Execute(perEffectContext, perEffectContext.SelectedTargets);
            if (executeResult.IsError)
            {
                return executeResult.Errors;
            }
        }

        return Result.Success;
    }

    private static bool TryResolveEffectKey(RuntimeEffects runtimeEffectType, out string effectTypeKey)
    {
        effectTypeKey = runtimeEffectType switch
        {
            RuntimeEffects.DestroyCard => DestroyCardEffect.EffectKey,
            RuntimeEffects.NegateEffect => NegateCardEffect.EffectKey,
            RuntimeEffects.GainEffect => GainKeywordEffect.EffectKey,
            RuntimeEffects.ChangeValues => ModifyAttributeEffect.EffectKey,
            RuntimeEffects.Tribute => TributeSummonCardEffect.EffectKey,
            RuntimeEffects.SummonCard => SummonCardEffect.EffectKey,
            _ => string.Empty,
        };

        return !string.IsNullOrWhiteSpace(effectTypeKey);
    }
}