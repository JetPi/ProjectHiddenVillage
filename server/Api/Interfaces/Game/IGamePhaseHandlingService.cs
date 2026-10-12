using ErrorOr;

namespace ProjectHiddenVillage.Server.Api.Interfaces.Game;

public interface IGamePhaseHandlingService
{
    ErrorOr<GameInstance> ResolvePrompt(string gameId, ResolvePromptRequest request);

    ErrorOr<GameInstance> AdvancePhase(string gameId);

    ErrorOr<GameInstance> DeclarePassInActionStep(string gameId, PlayerPhaseActionRequest request);

    ErrorOr<GameInstance> DeclareActionInActionStep(string gameId, PlayerPhaseActionRequest request);

    ErrorOr<GameInstance> ExecuteCardAction(string gameId, GameCardActionExecutionRequest request);

    ErrorOr<GameCardActionTargetsResponse> GetCardActionTargets(string gameId, GameCardActionTargetsRequest request);

    ErrorOr<GameInstance> DeclareEndStep(string gameId);

    ErrorOr<GameInstance> CompleteEndStep(string gameId);

    /// <summary>
    /// Records one connected participant's acknowledgement of the phase transition the engine is waiting on, and
    /// takes the next phase step once every required participant has acknowledged. An acknowledgement for a
    /// presentation that is no longer current is ignored rather than rejected.
    /// </summary>
    ErrorOr<GameInstance> AcknowledgePhasePresentation(string gameId, string playerId, string presentationId);

    /// <summary>
    /// Releases a participant who is no longer connected from the outstanding presentation, so a closed tab can
    /// never hold the table until the acknowledgement watchdog fires. Best effort: no presentation to release is
    /// not an error.
    /// </summary>
    ErrorOr<GameInstance> ReleasePhasePresentationRequirement(string gameId, string playerId);
}
