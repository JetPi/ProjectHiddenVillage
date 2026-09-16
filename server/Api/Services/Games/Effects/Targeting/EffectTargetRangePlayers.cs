namespace ProjectHiddenVillage.Server.Api.Services.Games;

/// <summary>
/// Turns an effect's <see cref="EffectTargetRange"/> into the players it applies to.
///
/// Player-scoped effects (chakra adjustments, face-state locks, chakra recovery locks) pick their audience
/// by range instead of by a card selection: <c>Self</c> is the acting player, <c>Opponent</c> the other
/// one, <c>Any</c> both. Single source of that resolution so the effect classes cannot drift apart.
/// </summary>
internal static class EffectTargetRangePlayers
{
    public static IReadOnlyList<PlayerState> Resolve(GameState state, string actingPlayerId, EffectTargetRange scope)
    {
        ArgumentNullException.ThrowIfNull(state);

        return scope switch
        {
            EffectTargetRange.Self => state.Players
                .Where(player => string.Equals(player.PlayerId, actingPlayerId, StringComparison.Ordinal))
                .ToList(),
            EffectTargetRange.Opponent => state.Players
                .Where(player => !string.Equals(player.PlayerId, actingPlayerId, StringComparison.Ordinal))
                .ToList(),
            EffectTargetRange.Any => state.Players,
            _ => [],
        };
    }
}
