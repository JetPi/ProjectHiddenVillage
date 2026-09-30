namespace ProjectHiddenVillage.Server.Api.Services.Games;

// Single source of truth for chakra recovery. The leader "Recovery" ability ("rest this card and turn all of
// your CHAKRA face-up") is gated here, and the response mapper publishes that verdict as the leader option's
// availability while the registry refuses a direct submit with the same reason, so the UI and the engine can
// never disagree. The pool ceiling lives here too because recovery can never turn up more cards than the
// player owns.
public static class ChakraRecoveryRules
{
    public static bool CanActivateLeaderRecovery(GameState state, PlayerState player, out string? disabledReason)
    {
        disabledReason = null;

        if (player.TurnCount < 2)
        {
            disabledReason = "Recovery can only be activated starting from your second turn.";
            return false;
        }

        // A chakra recovery lock (N-016) means "you cannot turn your CHAKRA face-up": while it lasts there is
        // nothing Recovery could do, so the option is disabled instead of failing on submit.
        if (CardRuntimeEffectStateService.IsChakraRecoveryBlocked(state, player.PlayerId))
        {
            disabledReason = "Your chakra is locked and cannot be turned face-up.";
            return false;
        }

        if (!HasFaceDownChakra(player))
        {
            disabledReason = "All chakra cards are already face up.";
            return false;
        }

        return true;
    }

    /// <summary>
    /// Whether the player still has a chakra card that can be turned face up. <see cref="PlayerState.ResourcePool"/>
    /// is the face-up part of the pool, so a full pool means every card is already face up.
    /// </summary>
    public static bool HasFaceDownChakra(PlayerState player)
    {
        return player.ResourcePool < PlayerState.ChakraCardCount;
    }

    /// <summary>
    /// How much of a recovery <paramref name="amount"/> the player can actually take: a recovery is not a way
    /// to exceed the chakra cards the player owns (a full pool stays full).
    /// </summary>
    public static int ClampRecoveryAmount(PlayerState player, int amount)
    {
        return Math.Clamp(amount, 0, PlayerState.ChakraCardCount - player.ResourcePool);
    }
}
