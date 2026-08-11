namespace ProjectHiddenVillage.Server;

public interface IGameEffectHandlingService
{
    string ExtractRecoveryEffect(string description);
    string ExtractMainEffect(string description);
}
