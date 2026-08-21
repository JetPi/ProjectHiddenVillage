namespace ProjectHiddenVillage.Server.Api.Services.Games;

internal static class SourceCardEffectSuppression
{
    public static bool IsSuppressedWhileOnField(GameState state, CardInstance? sourceCard)
    {
        if (sourceCard is null || !sourceCard.EffectsSuppressedWhileOnField)
        {
            return false;
        }

        return state.Players.Any(player => player.Battlefield.Any(card =>
            string.Equals(card.InstanceId, sourceCard.InstanceId, StringComparison.Ordinal)));
    }
}
