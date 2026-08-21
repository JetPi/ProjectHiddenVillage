using ErrorOr;

namespace ProjectHiddenVillage.Server.Api.Interfaces.Game;

public interface IGameEffectChainResolver
{
    ErrorOr<EffectChainResolutionResult> Resolve(
        GameInstance game,
        string? actingPlayerId,
        PassiveChainResolutionOptions options);
}