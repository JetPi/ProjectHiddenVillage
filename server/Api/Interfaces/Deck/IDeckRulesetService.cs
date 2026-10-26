using ErrorOr;

namespace ProjectHiddenVillage.Server.Api.Interfaces.Deck;

public interface IDeckRulesetService
{
    Task<ErrorOr<List<DeckRulesetResponse>>> GetRulesets(bool includeInactive = false);

    /// <summary>
    /// Loads the evaluable definition of an active ruleset. Used by anything that has to judge a deck against a
    /// format: a missing or deactivated ruleset is an error, never "allow it".
    /// </summary>
    Task<ErrorOr<DeckRulesetDefinition>> GetActiveRulesetDefinition(Guid rulesetId);

    Task<ErrorOr<DeckRulesetResponse>> CreateRuleset(CreateDeckRulesetRequest request);

    Task<ErrorOr<DeckRulesetResponse>> UpdateRuleset(string rulesetId, UpdateDeckRulesetRequest request);

    Task<ErrorOr<bool>> DeleteRuleset(string rulesetId);
}
