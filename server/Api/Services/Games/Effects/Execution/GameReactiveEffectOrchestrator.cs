using ErrorOr;
using ProjectHiddenVillage.Server.Api.Interfaces.Game;

namespace ProjectHiddenVillage.Server.Api.Services.Games;

public sealed class GameReactiveEffectOrchestrator(
    IGamePassiveEffectService passiveEffectService,
    IGameEffectChainResolver chainResolver) : IGameReactiveEffectOrchestrator
{
    private static readonly PassiveChainResolutionOptions DefaultResolutionOptions = new();

    private readonly IGamePassiveEffectService passiveEffectService = passiveEffectService;
    private readonly IGameEffectChainResolver chainResolver = chainResolver;

    public ErrorOr<ReactiveOrchestrationResult> ApplyPostMutationEffects(
        GameInstance game,
        GameMutationEvent mutationEvent,
        string? actingPlayerId)
    {
        ArgumentNullException.ThrowIfNull(game);
        ArgumentNullException.ThrowIfNull(mutationEvent);

        var passiveResult = passiveEffectService.EvaluateAndEnqueue(game, mutationEvent, DefaultResolutionOptions);
        if (passiveResult.IsError)
        {
            return passiveResult.Errors;
        }

        var chainResult = chainResolver.Resolve(game, actingPlayerId, DefaultResolutionOptions);
        if (chainResult.IsError)
        {
            return chainResult.Errors;
        }

        return new ReactiveOrchestrationResult
        {
            PassiveEvaluation = passiveResult.Value,
            ChainResolution = chainResult.Value,
        };
    }
}