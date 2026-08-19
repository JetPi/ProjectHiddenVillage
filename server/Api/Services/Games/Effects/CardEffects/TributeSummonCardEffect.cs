using ErrorOr;
using ProjectHiddenVillage.Server.Api.Interfaces.Game;

namespace ProjectHiddenVillage.Server.Api.Services.Games;

public sealed class TributeSummonCardEffect(
    IGameRuntimeEffectSpecResolver effectSpecResolver,
    IGameEffectCanExecuteEvaluator canExecuteEvaluator,
    IGameEffectTargetResolver targetResolver) : IGameCardEffect
{
    private const string SummonTargetIdArgumentKey = "summonTargetId";

    private readonly IGameRuntimeEffectSpecResolver effectSpecResolver = effectSpecResolver;
    private readonly IGameEffectCanExecuteEvaluator canExecuteEvaluator = canExecuteEvaluator;
    private readonly IGameEffectTargetResolver targetResolver = targetResolver;

    public const string EffectKey = "Tribute";

    public string EffectTypeKey => EffectKey;

    public CanExecuteResult CanExecute(GameCardEffectContext context)
    {
        var effectSpec = effectSpecResolver.Resolve(context, RuntimeEffects.Tribute);
        if (effectSpec is null)
        {
            return new CanExecuteResult
            {
                CanExecute = false,
                FailedConditions = ["Tribute effect is not defined on the source card."],
            };
        }

        return canExecuteEvaluator.Evaluate(context, effectSpec, includeValidTargets: true);
    }

    public IReadOnlyList<GameEffectTargetReference> GetValidTargets(GameCardEffectContext context)
    {
        var effectSpec = effectSpecResolver.Resolve(context, RuntimeEffects.Tribute);
        if (effectSpec is null)
        {
            return [];
        }

        var canExecuteResult = canExecuteEvaluator.Evaluate(context, effectSpec, includeValidTargets: false);
        if (!canExecuteResult.CanExecute)
        {
            return [];
        }

        return targetResolver.ResolveTargets(context, effectSpec);
    }

    public ErrorOr<Success> Execute(GameCardEffectContext context, IReadOnlyList<GameEffectTargetReference> selectedTargets)
    {
        var summonTargetResult = ResolveSummonTarget(context, selectedTargets);
        if (summonTargetResult.IsError)
        {
            return summonTargetResult.Errors;
        }

        var summonTarget = summonTargetResult.Value;
        var tributeTargets = selectedTargets.Where(target => target != summonTarget);

        foreach (var tributeTarget in tributeTargets)
        {
            var tributeSourcePlayer = context.Game.State.Players.First(player => player.PlayerId == tributeTarget.PlayerId);
            var tributeSourceZone = PlayerZoneCardAccessor.GetCards(tributeTarget.Zone, tributeSourcePlayer);
            var tributeCard = tributeSourceZone.First(card => card.InstanceId == tributeTarget.CardInstanceId);

            tributeSourceZone.Remove(tributeCard);

            var ownerPlayer = context.Game.State.Players.First(player => player.PlayerId == tributeCard.OwnerPlayerId);
            var ownerTrashZone = PlayerZoneCardAccessor.GetCards(PlayerZone.Trash, ownerPlayer);
            ownerTrashZone.Add(tributeCard);
        }

        var summoningPlayer = context.Game.State.Players.First(player => player.PlayerId == context.ActingPlayer.Id);
        var summonSourcePlayer = context.Game.State.Players.First(player => player.PlayerId == summonTarget.PlayerId);
        var summonSourceZone = PlayerZoneCardAccessor.GetCards(summonTarget.Zone, summonSourcePlayer);
        var summonedCard = summonSourceZone.First(card => card.InstanceId == summonTarget.CardInstanceId);

        summonSourceZone.Remove(summonedCard);

        var summoningPlayerField = PlayerZoneCardAccessor.GetCards(PlayerZone.CharacterField, summoningPlayer);
        summonedCard.ControllerPlayerId = summoningPlayer.PlayerId;
        summonedCard.EnteredFieldTurnNumber = context.Game.State.TurnNumber;
        summoningPlayerField.Add(summonedCard);

        return Result.Success;
    }

    private static ErrorOr<GameEffectTargetReference> ResolveSummonTarget(
        GameCardEffectContext context,
        IReadOnlyList<GameEffectTargetReference> selectedTargets)
    {
        if (selectedTargets.Count == 0)
        {
            return Error.Validation(
                code: "Game.Effect.TributeSummon.MissingSummonTarget",
                description: "At least one target is required for tribute summon.");
        }

        if (context.Arguments.TryGetValue(SummonTargetIdArgumentKey, out var summonTargetId)
            && !string.IsNullOrWhiteSpace(summonTargetId))
        {
            var argumentTarget = selectedTargets.FirstOrDefault(target =>
                string.Equals(target.CardInstanceId, summonTargetId, StringComparison.Ordinal));

            if (argumentTarget is not null)
            {
                return argumentTarget;
            }

            return Error.Validation(
                code: "Game.Effect.TributeSummon.InvalidSummonTarget",
                description: $"Summon target '{summonTargetId}' is not in selected targets.");
        }

        var selectedZones = selectedTargets
            .Select(target => target.Zone)
            .Distinct()
            .ToList();

        if (selectedZones.Count > 1)
        {
            return Error.Validation(
                code: "Game.Effect.TributeSummon.SummonTargetIdRequired",
                description: "summonTargetId argument is required when selected tribute/summon targets span multiple zones.");
        }

        var nonFieldTargets = selectedTargets
            .Where(target => target.Zone != PlayerZone.CharacterField)
            .ToList();

        if (nonFieldTargets.Count == 1)
        {
            return nonFieldTargets[0];
        }

        if (selectedTargets.Count == 1)
        {
            return selectedTargets[0];
        }

        return Error.Validation(
            code: "Game.Effect.TributeSummon.AmbiguousSummonTarget",
            description: "Could not infer summon target from selected targets. Provide summonTargetId argument.");
    }
}
