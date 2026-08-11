namespace ProjectHiddenVillage.Server.Api.Interfaces.Game;

public interface IGameEffectHandlingService
{
    string ExtractRecoveryEffect(string description);
    string ExtractMainEffect(string description);
}
