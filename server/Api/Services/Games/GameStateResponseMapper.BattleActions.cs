using ErrorOr;
using ProjectHiddenVillage.Server.Engine;
using ProjectHiddenVillage.Server.Engine.Interfaces;

namespace ProjectHiddenVillage.Server.Api.Services.Games;

public static partial class GameStateResponseMapper
{
    private static IReadOnlyList<GameActionOptionResponse> BuildBattleActionOptions(
        CardInstance card,
        GameState state,
        bool isLeader = false)
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

        var canDeclareBattleResult = CanDeclareBattleAction(card, state, isLeader);
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

    private static ErrorOr<bool> CanDeclareBattleAction(CardInstance card, GameState state, bool isLeader = false)
    {
        var restriction = BattleActionRules.ResolveRestriction(state, card, isLeader);
        if (restriction == BattleActionRestriction.None)
        {
            return true;
        }

        return Error.Failure(
            code: BattleActionRules.ResolveRestrictionCode(restriction),
            description: BattleActionRules.DescribeRestriction(restriction));
    }
}
