using ErrorOr;

namespace ProjectHiddenVillage.Server.Api.Interfaces.Game;

public interface IGameReactiveEffectOrchestrator
{
    ErrorOr<ReactiveOrchestrationResult> ApplyPostMutationEffects(
        GameInstance game,
        GameMutationEvent mutationEvent,
        string? actingPlayerId);
}