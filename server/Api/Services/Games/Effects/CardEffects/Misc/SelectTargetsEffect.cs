using ErrorOr;
using ProjectHiddenVillage.Server.Api.Interfaces.Game;

namespace ProjectHiddenVillage.Server.Api.Services.Games;

/// <summary>
/// "Choose 1 Leader or Character" as a clause of its own: a step that only collects the player's selection and
/// resolves to nothing. It exists so a chain can ask before its effect resolves and still act on the answer
/// afterwards (N-013: choose the card, reveal the top of the deck, and freeze the chosen card only if the
/// reveal matched).
///
/// The answer is what the step is handed as its selected targets; the sequential executor stores it in the
/// chain's shared arguments so later steps can execute against
/// <see cref="EffectExecutionTargetSource.ChainTargets"/>.
/// </summary>
public sealed class SelectTargetsEffect : IGameCardEffect
{
    public const string EffectKey = "SelectTargets";

    public string EffectTypeKey => EffectKey;

    public CanExecuteResult CanExecute(GameCardEffectContext context)
    {
        // Nothing to resolve without a choice: a prompted step whose candidate pool is empty falls straight to
        // its failure branch instead of recording a selection nobody made.
        return new CanExecuteResult
        {
            CanExecute = context.SelectedTargets.Count > 0
        };
    }

    public IReadOnlyList<GameEffectTargetReference> GetValidTargets(GameCardEffectContext context)
    {
        return [];
    }

    public ErrorOr<Success> Execute(
        GameCardEffectContext context,
        IReadOnlyList<GameEffectTargetReference> selectedTargets)
    {
        return Result.Success;
    }
}
