namespace ProjectHiddenVillage.Server;

/// <summary>
/// The rematch offer of a finished game. It lives on the instance rather than in a side store for the same reason a
/// redo request does: the response mapper reads the instance, so the offer reaches both clients in the state payload
/// without the mapper having to know about any service.
///
/// The <em>reservation</em> is not here: it outlives the table (the players claim it from the login view), so it is
/// kept by the reservation store and only its code is recorded on the offer.
/// </summary>
public sealed partial class GameInstance
{
    public RematchOffer? PendingRematch { get; private set; }

    /// <summary>Records the caller's offer, replacing whatever was there (a declined or lapsed one).</summary>
    public RematchOffer OpenRematchOffer(string requestedByPlayerId, DateTimeOffset expiresAtUtc)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(requestedByPlayerId);

        PendingRematch = new RematchOffer
        {
            RequestedByPlayerId = requestedByPlayerId,
            ExpiresAtUtc = expiresAtUtc,
        };

        return PendingRematch;
    }

    public void ClearRematchOffer()
    {
        PendingRematch = null;
    }

    /// <summary>
    /// The other seat agrees. Refuses an offer that is already answered or reserved, one that lapsed, a player who
    /// is not seated, and the requester answering their own offer.
    /// </summary>
    public bool TryAcceptRematch(string playerId, DateTimeOffset now)
    {
        var offer = PendingRematch;

        if (offer is null || offer.IsAccepted || offer.IsDeclined || offer.IsReserved)
        {
            return false;
        }

        if (now >= offer.ExpiresAtUtc)
        {
            return false;
        }

        if (string.Equals(offer.RequestedByPlayerId, playerId, StringComparison.Ordinal))
        {
            return false;
        }

        if (!State.Players.Any(player => string.Equals(player.PlayerId, playerId, StringComparison.Ordinal)))
        {
            return false;
        }

        offer.AcceptedByPlayerId = playerId;
        return true;
    }

    /// <summary>Attaches the reserved table to an accepted offer, which is what brings both players to the login view.</summary>
    public void MarkRematchReserved(string reservedCode, string? rulesetName)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(reservedCode);

        if (PendingRematch is null)
        {
            return;
        }

        PendingRematch.ReservedCode = reservedCode;
        PendingRematch.ReservedRulesetName = rulesetName;
    }

    /// <summary>Either seat may refuse or withdraw: a rematch needs two players, so one refusal settles it.</summary>
    public bool DeclineRematch(string playerId)
    {
        var offer = PendingRematch;

        if (offer is null || offer.IsReserved)
        {
            return false;
        }

        if (!State.Players.Any(player => string.Equals(player.PlayerId, playerId, StringComparison.Ordinal)))
        {
            return false;
        }

        offer.DeclinedByPlayerId = playerId;
        return true;
    }
}
