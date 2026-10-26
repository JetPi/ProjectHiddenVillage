using ErrorOr;

namespace ProjectHiddenVillage.Server.Api.Interfaces.Game;

public interface IGameRulesetDeckValidator
{
    /// <summary>
    /// Judges an already-resolved deck against a ruleset. The deck is the one the game would actually play with,
    /// so the verdict covers exactly the cards that will be shuffled, not the stored deck row.
    /// </summary>
    ErrorOr<DeckRulesetEvaluation> Validate(ResolvedPlayerDeck deck, DeckRulesetDefinition ruleset);
}
