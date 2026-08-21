using ErrorOr;

namespace ProjectHiddenVillage.Server.Api.Interfaces.Game;

public interface IGamePassiveEffectService
{
    ErrorOr<PassiveEvaluationResult> EvaluateAndEnqueue(
        GameInstance game,
        GameMutationEvent mutationEvent,
        PassiveChainResolutionOptions options);
}