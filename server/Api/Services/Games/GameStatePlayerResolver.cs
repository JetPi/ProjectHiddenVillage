namespace ProjectHiddenVillage.Server.Api.Services.Games;

internal static class GameStatePlayerResolver
{
    public static bool IsSamePlayerId(string? left, string? right)
    {
        if (string.IsNullOrWhiteSpace(left) || string.IsNullOrWhiteSpace(right))
        {
            return false;
        }

        if (Guid.TryParse(left, out var leftGuid) && Guid.TryParse(right, out var rightGuid))
        {
            return leftGuid == rightGuid;
        }

        return string.Equals(left.Trim(), right.Trim(), StringComparison.OrdinalIgnoreCase);
    }

    public static PlayerState? GetActivePlayer(GameState state, CardInstance sourceCardInstance)
    {
        return state.Players.FirstOrDefault(player =>
            IsSamePlayerId(player.PlayerId, sourceCardInstance.ControllerPlayerId));
    }
}
