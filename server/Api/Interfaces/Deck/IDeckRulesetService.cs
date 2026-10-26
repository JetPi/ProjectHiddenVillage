using ErrorOr;

namespace ProjectHiddenVillage.Server.Api.Interfaces.Deck;

public interface IDeckRulesetService
{
    Task<ErrorOr<List<DeckRulesetResponse>>> GetRulesets(bool includeInactive = false);

    Task<ErrorOr<DeckRulesetResponse>> CreateRuleset(CreateDeckRulesetRequest request);

    Task<ErrorOr<DeckRulesetResponse>> UpdateRuleset(string rulesetId, UpdateDeckRulesetRequest request);

    Task<ErrorOr<bool>> DeleteRuleset(string rulesetId);
}
