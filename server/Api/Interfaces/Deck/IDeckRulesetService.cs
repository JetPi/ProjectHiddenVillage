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

    /// <summary>
    /// Every set code the catalogue currently contains, with how many cards carry it. The admin rule editor uses
    /// it so rules name real sets instead of codes the admin has to guess.
    /// </summary>
    Task<ErrorOr<List<DeckRulesetSetCodeResponse>>> GetCardPoolSetCodes();

    Task<ErrorOr<DeckRulesetResponse>> CreateRuleset(CreateDeckRulesetRequest request);

    Task<ErrorOr<DeckRulesetResponse>> UpdateRuleset(string rulesetId, UpdateDeckRulesetRequest request);

    Task<ErrorOr<bool>> DeleteRuleset(string rulesetId);
}
