using ErrorOr;
using Microsoft.EntityFrameworkCore;
using ProjectHiddenVillage.Server.Api.Interfaces.Card;
using ProjectHiddenVillage.Server.Api.Interfaces.Game;
using ProjectHiddenVillage.Server.Api.Services.Games;
using ProjectHiddenVillage.Server.Data;
using ProjectHiddenVillage.Server.Data.Entities;

namespace ProjectHiddenVillage.Server;

public sealed class GamesEvaluatorService(
    InMemoryGameInstanceRegistry registry,
    ICardMappingService cardMappingService,
    ApplicationDbContext dbContext,
    IGameRuntimeDeckService gameRuntimeDeckService)
{
    private static readonly GameRuntimeEffectSpecResolver RuntimeEffectSpecResolver = new();
    private static readonly EffectTargetResolver EffectTargetResolver = new();

    private static readonly GameEffectCanExecuteEvaluator LeaderEffectCanExecuteEvaluator = new(
        new EffectContextConditionEvaluator(),
        new EffectTargetResolver(),
        new GameValidTargetResultFactory(),
        new GameEffectConditionDiagnostics());

    public static (bool IsEnabled, string DisabledReason) EvaluateSummonRequirementAvailability(
        GameState state,
        CardInstance sourceCardInstance,
        Card cardDefinition)
    {
        if (cardDefinition.Conditions.Count == 0)
        {
            return (true, string.Empty);
        }

        var hasSummonRequirementMarker = cardDefinition.Conditions.Any(condition =>
            string.Equals(condition, EffectConditionKeywords.SummonRequirements, StringComparison.OrdinalIgnoreCase));

        if (!hasSummonRequirementMarker)
        {
            return (true, string.Empty);
        }

        var actingPlayer = GameStatePlayerResolver.GetActivePlayer(state, sourceCardInstance);
        if (actingPlayer is null)
        {
            return (false, "Cannot perform regular summons when its not your turn.");
        }

        var context = new GameCardEffectContext(
            game: new(state),
            actingPlayer: new Player { Id = actingPlayer.PlayerId },
            sourceCardDefinition: cardDefinition,
            sourceCardInstance: sourceCardInstance,
            arguments: new Dictionary<string, string>(StringComparer.Ordinal),
            selectedTargets: []);

        var tributeEffectSpec = RuntimeEffectSpecResolver.Resolve(context, RuntimeEffects.Tribute)!;

        var hasTributeComposition = tributeEffectSpec.TargetRules.TributeComposition is not null;

        // The summon candidate is the hand card being summoned, so it never counts against the
        // material selection; availability is decided via the tribute composition's distinct
        // material assignment solver instead of the generic target-count check.
        var canExecuteResult = LeaderEffectCanExecuteEvaluator.Evaluate(context, tributeEffectSpec, includeValidTargets: false);
        if (!canExecuteResult.CanExecute)
        {
            return (false, canExecuteResult.FailedConditions.FirstOrDefault() ?? "Summon requirements are not currently satisfiable.");
        }

        var materialTargets = EffectTargetResolver.ResolveTargets(context, tributeEffectSpec);

        if (hasTributeComposition
            && !TributeTargetCompositionValidator.TryValidateMaterialAvailability(
                context,
                tributeEffectSpec,
                materialTargets,
                out var materialAvailabilityError))
        {
            return (false, materialAvailabilityError);
        }

        if (materialTargets.Count == 0)
        {
            return (false, "No valid tribute targets available.");
        }

        return (true, string.Empty);
    }
}
