using System.Globalization;
using System.Text;

namespace ProjectHiddenVillage.Server;

/// <summary>
/// A cheap, deterministic summary of everything a rewind point is judged by. Two states with the same fingerprint
/// are the same board, which is what lets a redo request skip a point the game has already returned to instead of
/// restoring a state that would change nothing.
/// </summary>
public static class GameStateFingerprint
{
    public static string Compute(GameState state, IEnumerable<GamePrompt>? pendingPrompts = null)
    {
        ArgumentNullException.ThrowIfNull(state);

        var builder = new StringBuilder(512);

        builder.Append(state.TurnNumber).Append('|')
            .Append(state.Phase).Append('|')
            .Append(state.ActivePlayerId).Append('|')
            .Append(state.PriorityPlayerId).Append('|')
            .Append(state.ConsecutivePasses).Append('|')
            .Append(state.Player1SummonCard).Append('|')
            .Append(state.Player2SummonCard).Append('|')
            .Append(JoinFlags(state.Player1CurrentChakras)).Append('|')
            .Append(JoinFlags(state.Player2CurrentChakras)).Append('|')
            .Append(state.Outcome is null ? "running" : state.Outcome.Reason.ToString()).Append('|');

        foreach (var player in state.Players)
        {
            AppendPlayer(builder, player);
        }

        builder.Append("|attack:")
            .Append(state.HasPendingAttack).Append(',')
            .Append(state.PendingAttackAttackerInstanceId).Append(',')
            .Append(state.PendingAttackDefenderInstanceId).Append(',')
            .Append(state.PendingAttackDefenderZone?.ToString()).Append(',')
            .Append(state.PendingAttackOptionalEffectId).Append('|');

        builder.Append("effects:");
        foreach (var effect in state.AppliedCardEffects)
        {
            builder.Append(effect.Id).Append(',')
                .Append(effect.TargetCardInstanceId).Append(',')
                .Append(effect.ModifierKind).Append(';');
        }

        builder.Append("|passives:");
        foreach (var passive in state.PassiveStates)
        {
            builder.Append(passive.PassiveKey).Append(',').Append(passive.IsActive).Append(';');
        }

        builder.Append("|stack:");
        foreach (var entry in state.EffectResolutionStack)
        {
            builder.Append(entry.EntryId).Append(',').Append(entry.IsNegated).Append(';');
        }

        builder.Append("|prompts:");
        foreach (var prompt in pendingPrompts ?? [])
        {
            builder.Append(prompt.PromptId).Append(',')
                .Append(prompt.RequestedPlayerId).Append(',')
                .Append(string.Join('/', prompt.Options)).Append(';');
        }

        return builder.ToString();
    }

    private static void AppendPlayer(StringBuilder builder, PlayerState player)
    {
        builder.Append('|').Append(player.PlayerId).Append(',')
            .Append(player.TurnCount).Append(',')
            .Append(player.ResourcePool).Append(',');

        if (player.LeaderCardInstance is { } leader)
        {
            builder.Append("leader:")
                .Append(leader.CurrentLife).Append(',')
                .Append(leader.Power).Append(',')
                .Append(leader.Damage).Append(',')
                .Append(leader.IsRested).Append(',');
        }

        AppendZone(builder, 'D', player.Deck);
        AppendZone(builder, 'H', player.Hand);
        AppendZone(builder, 'F', player.Battlefield);
        AppendZone(builder, 'T', player.DiscardPile);
        AppendZone(builder, 'S', player.SupportZone);
        AppendZone(builder, 'X', player.ExileZone);
    }

    private static void AppendZone(StringBuilder builder, char tag, List<CardInstance> cards)
    {
        builder.Append(tag).Append(':');
        foreach (var card in cards)
        {
            builder.Append(card.InstanceId).Append(',')
                .Append(card.IsRested).Append(',')
                .Append(card.IsFaceUp).Append(',')
                .Append(card.IsRevealedToBothPlayers).Append(',')
                .Append(card.SupportSlotIndex ?? -1).Append(',')
                .Append(card.PowerOverride ?? int.MinValue).Append(',')
                .Append(card.DamageOverride ?? int.MinValue).Append(',')
                .Append(card.HealthOverride ?? int.MinValue).Append(',')
                .Append(card.CurrentHealth ?? int.MinValue).Append(',')
                .Append(card.EffectsSuppressedWhileOnField).Append(',')
                .Append(string.Join('/', card.RuntimeKeywords)).Append(';');
        }

        builder.Append('|');
    }

    private static string JoinFlags(bool[] flags)
    {
        var builder = new StringBuilder(flags.Length);
        foreach (var flag in flags)
        {
            builder.Append(flag ? '1' : '0');
        }

        return builder.ToString();
    }
}
