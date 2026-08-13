using ProjectHiddenVillage.Server;

namespace ProjectHiddenVillage.Server.Engine.Interfaces;

public interface IGamePhaseStateService
{
    GamePhase GetNextPhase(GamePhase currentPhase);
    bool AdvancePhase(GameState state);
    void EnqueueSkipPhase(GameState state, GamePhase phaseToSkip);
    void EnqueueJumpToPhase(GameState state, GamePhase targetPhase);
    bool DeclarePassInActionStep(GameState state, string playerId);
    void DeclareActionInActionStep(GameState state, string playerId);
    void DeclareEndStep(GameState state);
    bool CompleteEndStep(GameState state);
}
