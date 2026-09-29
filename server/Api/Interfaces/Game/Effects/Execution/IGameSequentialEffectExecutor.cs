using ErrorOr;

namespace ProjectHiddenVillage.Server.Api.Interfaces.Game;

public interface IGameSequentialEffectExecutor
{
    ErrorOr<Success> Execute(GameCardEffectContext context);

    /// <summary>
    /// Continues a chain that suspended on a <see cref="GamePromptType.Effect"/> selection prompt, using the
    /// player's answer as the suspended node's targets.
    /// </summary>
    ErrorOr<Success> Resume(
        GameInstance game,
        PendingEffectContinuation continuation,
        IReadOnlyList<GameEffectTargetReference> selection);
}