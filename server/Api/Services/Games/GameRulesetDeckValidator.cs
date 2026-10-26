using ErrorOr;
using ProjectHiddenVillage.Server.Api.Interfaces.Game;

namespace ProjectHiddenVillage.Server.Api.Services.Games;

public sealed class GameRulesetDeckValidator : IGameRulesetDeckValidator
{
    public const string DeckIllegalCode = "Game.Ruleset.DeckIllegal";

    public ErrorOr<DeckRulesetEvaluation> Validate(ResolvedPlayerDeck deck, DeckRulesetDefinition ruleset)
    {
        ArgumentNullException.ThrowIfNull(deck);
        ArgumentNullException.ThrowIfNull(ruleset);

        // The resolved player deck lists one entry per copy, which is exactly what the ruleset counts, so
        // grouping restores the quantities the evaluator expects. Card metadata comes from the same definitions
        // the engine will play with, so the verdict cannot disagree with the board.
        var cards = deck.Player.Deck
            .Where(cardId => !string.IsNullOrWhiteSpace(cardId))
            .Select(cardId => cardId.Trim())
            .GroupBy(cardId => cardId, StringComparer.OrdinalIgnoreCase)
            .Select(group => new DeckRuleCard(group.Key, group.Count()))
            .ToList();

        var catalog = deck.CardDefinitions.ToDictionary(
            entry => entry.Key,
            entry => new DeckRuleCardMetadata(
                CardId: entry.Key,
                Type: entry.Value.Type,
                Color: entry.Value.Color),
            StringComparer.OrdinalIgnoreCase);

        var evaluation = DeckRulesetRules.EvaluateRuleset(cards, catalog, ruleset);
        if (evaluation.IsValid)
        {
            return evaluation;
        }

        return Error.Validation(
            code: DeckIllegalCode,
            description: $"This deck is not legal in {ruleset.Name}: "
                + string.Join(" ", evaluation.Violations.Select(violation => violation.Description)));
    }
}
