using ErrorOr;
using ProjectHiddenVillage.Server.Engine;
using ProjectHiddenVillage.Server.Engine.Interfaces;

namespace ProjectHiddenVillage.Server.Api.Services.Games;

public static partial class GameStateResponseMapper
{
    private static readonly IGamePhaseStateService PhaseStateService = new GamePhaseStateService();
    private static readonly GameEffectCanExecuteEvaluator LeaderEffectCanExecuteEvaluator = new(
        new EffectContextConditionEvaluator(),
        new EffectTargetResolver(),
        new GameValidTargetResultFactory(),
        new GameEffectConditionDiagnostics());
    private static readonly GameRuntimeEffectSpecResolver RuntimeEffectSpecResolver = new();
    private static readonly EffectTargetResolver EffectTargetResolver = new();
    private const string ConcealedCardDefinitionId = "concealed-card";
    private const string SummonToFieldActionPrefix = "summon-to-field:";
    private const string SetSupportActionPrefix = "set-support:";
    private const string LeaderEffectActionPrefix = "leader-effect:";
    private const string ResolveOptionalAttackEffectActionPrefix = "resolve-optional-attack-effect:";

    // Canonical id comparison lives in GameStatePlayerResolver; keep one shared entry point here.
    private static bool IsSamePlayerId(string? left, string? right)
    {
        return GameStatePlayerResolver.IsSamePlayerId(left, right);
    }
}
