using ErrorOr;

namespace ProjectHiddenVillage.Server;

public interface IGamePhaseHandlingService
{
    ErrorOr<GameInstance> ResolvePrompt(string gameId, ResolvePromptRequest request);

    ErrorOr<GameInstance> AdvancePhase(string gameId);

    ErrorOr<GameInstance> DeclarePassInActionStep(string gameId, PlayerPhaseActionRequest request);

    ErrorOr<GameInstance> DeclareActionInActionStep(string gameId, PlayerPhaseActionRequest request);

    ErrorOr<GameInstance> DeclareEndStep(string gameId);

    ErrorOr<GameInstance> CompleteEndStep(string gameId);
}
