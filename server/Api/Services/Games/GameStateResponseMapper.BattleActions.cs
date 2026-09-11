using ErrorOr;
using ProjectHiddenVillage.Server.Engine;
using ProjectHiddenVillage.Server.Engine.Interfaces;

namespace ProjectHiddenVillage.Server.Api.Services.Games;

public static partial class GameStateResponseMapper
{
    private static IReadOnlyList<GameActionOptionResponse> BuildBattleActionOptions(CardInstance card, GameState state)
    {
        var actionId = $"battle-action:{card.InstanceId}";

        if (!CanUseBattleCardActions(card, state))
        {
            return
            [
                new GameActionOptionResponse(
                    ActionId: actionId,
                    Label: "Battle",
                    IsEnabled: false,
                    DisabledReason: "Battle actions are only available during your own main phase.")
            ];
        }

        var canDeclareBattleResult = CanDeclareBattleAction(card, state);
        if (canDeclareBattleResult.IsError)
        {
            return
            [
                new GameActionOptionResponse(
                    ActionId: actionId,
                    Label: "Battle",
                    IsEnabled: false,
                    DisabledReason: canDeclareBattleResult.FirstError.Description)
            ];
        }

        return
        [
            new GameActionOptionResponse(
                ActionId: actionId,
                Label: "Battle",
                IsEnabled: true)
        ];
    }

    private static ErrorOr<bool> CanDeclareBattleAction(CardInstance card, GameState state)
    {
        var activePlayer = state.Players.Find(player => player.PlayerId == state.ActivePlayerId);
        var currentPlayerTurn = activePlayer?.TurnCount ?? 1;

        if (currentPlayerTurn == 1)
        {
            return Error.Failure(
                code: "BattleAction.FirstTurn",
                description: "Cannot declare battle action because it is the first turn.");
        }

        if (card.IsRested)
        {
            return Error.Failure(
                code: "BattleAction.CardRested",
                description: "Cannot declare battle action because the card is rested.");
        }

        var effectiveKeywords = CardRuntimeEffectStateService.ResolveEffectiveKeywords(state, card);
        if (effectiveKeywords.Any(keyword =>
            string.Equals(keyword, FreezeCardEffect.CannotAttackKeyword, StringComparison.OrdinalIgnoreCase)))
        {
            return Error.Failure(
                code: "BattleAction.RestrictedByEffect",
                description: "Cannot declare battle action because the card is under an effect that restricts it.");
        }

        if (!card.EnteredFieldTurnNumber.HasValue
            || card.EnteredFieldTurnNumber.Value != state.TurnNumber
            || HasRushKeyword(card, state))
        {
            return true;
        }

        return Error.Failure(
            code: "BattleAction.SummonedThisTurn",
            description: "Cannot declare battle action the turn that the card entered the field.");
    }

    private static bool HasRushKeyword(CardInstance card, GameState state)
    {
        var effectiveKeywords = CardRuntimeEffectStateService.ResolveEffectiveKeywords(state, card);

        if (effectiveKeywords.Any(keyword =>
            string.Equals(keyword, EffectConditionKeywords.Rush, StringComparison.OrdinalIgnoreCase)))
        {
            return true;
        }

        if (!state.CardDefinitions.TryGetValue(card.CardDefinitionId, out var definition))
        {
            return false;
        }

        return definition.Conditions.Any(condition =>
            string.Equals(condition, EffectConditionKeywords.Rush, StringComparison.OrdinalIgnoreCase));
    }
}
