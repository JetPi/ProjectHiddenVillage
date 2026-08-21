namespace ProjectHiddenVillage.Server.Api.Interfaces.Game;

public interface IGameEffectConditionDiagnostics
{
    string BuildFailureMessage(EffectContextCondition condition);
}
