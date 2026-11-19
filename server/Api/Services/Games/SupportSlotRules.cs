using ProjectHiddenVillage.Server;

namespace ProjectHiddenVillage.Server.Api.Services.Games;

/// <summary>
/// Single home for support-slot assignment.
///
/// A support row has <see cref="SlotCount"/> slots and holds at most one card per slot. That was previously
/// enforced only by <c>ExecuteSetSupportAction</c>: every other entry point (a MoveCard effect, a SearchCard
/// effect, any wrapper that forwards no destination index) went through <c>MoveCardToZone</c>, which used the
/// row's <em>length</em> as the slot index. A length is not a slot: the moment a support card leaves the row
/// from a middle slot the row keeps a hole, so <c>Count</c> can point at an occupied slot (two cards stacked on
/// one slot) or, on a full row, at index 5 (a card no client can draw). Players see that as a support card that
/// flashes the card underneath it, because the client paints one card per slot and the survivor depends on the
/// order the row happened to be in.
///
/// Supported indexes are only ever assigned here: an explicit index is honoured when it is valid and free,
/// otherwise the card takes the leftmost free slot, and a full row is refused instead of overflowed.
/// </summary>
internal static class SupportSlotRules
{
    /// <summary>The number of support slots a player's support row has.</summary>
    internal const int SlotCount = 5;

    /// <summary>True when <paramref name="slotIndex"/> addresses a real slot.</summary>
    internal static bool IsValidSlot(int? slotIndex)
    {
        return slotIndex is >= 0 and < SlotCount;
    }

    /// <summary>
    /// Resolves where a card entering the support row lands.
    ///
    /// An explicit index is honoured only when it addresses a real, free slot: the caller is a client or an
    /// authored effect that named a slot, so silently relocating it would hide the mistake. Without an index the
    /// card takes the leftmost free slot, which is what the board offers players.
    /// </summary>
    /// <returns><see langword="false"/> when the row is full.</returns>
    /// <exception cref="InvalidOperationException">
    /// The requested index is outside the row, or already occupied by another card.
    /// </exception>
    internal static bool TryResolveSlot(
        IReadOnlyList<CardInstance> supportZone,
        int? requestedSlotIndex,
        out int slotIndex)
    {
        ArgumentNullException.ThrowIfNull(supportZone);

        var claimedSlots = ResolveClaimedSlots(supportZone);

        if (requestedSlotIndex.HasValue)
        {
            if (!IsValidSlot(requestedSlotIndex))
            {
                throw new InvalidOperationException("A valid support slot index is required.");
            }

            if (claimedSlots.Contains(requestedSlotIndex.Value))
            {
                throw new InvalidOperationException($"Support slot {requestedSlotIndex.Value} is already occupied.");
            }

            slotIndex = requestedSlotIndex.Value;
            return true;
        }

        slotIndex = ResolveFirstFreeSlot(claimedSlots);
        return slotIndex >= 0;
    }

    /// <summary>Resolves the leftmost free slot for a card entering the row, or <see langword="false"/> when it is full.</summary>
    internal static bool TryResolveSlot(IReadOnlyList<CardInstance> supportZone, out int slotIndex)
    {
        return TryResolveSlot(supportZone, requestedSlotIndex: null, out slotIndex);
    }

    /// <summary>
    /// Repairs a row that is already broken: duplicate, missing or out-of-range slot indexes are re-assigned.
    ///
    /// A game that was played before the allocator existed can still hold two cards on one slot in memory. The
    /// row is healed where it is published, so such a game stops flipping its support cards on the state push
    /// that follows instead of waiting for a restart. The pass is deterministic (existing valid slots win, the
    /// rest are ordered by instance id) and idempotent, so running it on an already-healthy row changes nothing.
    /// </summary>
    /// <returns><see langword="true"/> when a slot index was changed.</returns>
    internal static bool NormalizeSlots(List<CardInstance> supportZone)
    {
        ArgumentNullException.ThrowIfNull(supportZone);

        var isChanged = false;
        var claimedSlots = new HashSet<int>();

        foreach (var card in OrderForNormalization(supportZone))
        {
            if (IsValidSlot(card.SupportSlotIndex) && claimedSlots.Add(card.SupportSlotIndex!.Value))
            {
                continue;
            }

            var freeSlot = ResolveFirstFreeSlot(claimedSlots);
            if (freeSlot < 0)
            {
                // More cards than the row can hold: the surplus keeps no slot, so no client paints it on top of
                // a card that legitimately owns one.
                if (card.SupportSlotIndex is not null)
                {
                    card.SupportSlotIndex = null;
                    isChanged = true;
                }

                continue;
            }

            if (card.SupportSlotIndex != freeSlot)
            {
                card.SupportSlotIndex = freeSlot;
                isChanged = true;
            }

            claimedSlots.Add(freeSlot);
        }

        return isChanged;
    }

    private static List<CardInstance> OrderForNormalization(IReadOnlyList<CardInstance> supportZone)
    {
        return supportZone
            .OrderBy(card => IsValidSlot(card.SupportSlotIndex) ? 0 : 1)
            .ThenBy(card => IsValidSlot(card.SupportSlotIndex) ? card.SupportSlotIndex!.Value : int.MaxValue)
            .ThenBy(card => card.InstanceId, StringComparer.Ordinal)
            .ToList();
    }

    private static HashSet<int> ResolveClaimedSlots(IReadOnlyList<CardInstance> supportZone)
    {
        var claimedSlots = new HashSet<int>();

        foreach (var card in supportZone)
        {
            if (IsValidSlot(card.SupportSlotIndex))
            {
                claimedSlots.Add(card.SupportSlotIndex!.Value);
            }
        }

        return claimedSlots;
    }

    private static int ResolveFirstFreeSlot(IReadOnlySet<int> claimedSlots)
    {
        for (var candidateSlot = 0; candidateSlot < SlotCount; candidateSlot++)
        {
            if (!claimedSlots.Contains(candidateSlot))
            {
                return candidateSlot;
            }
        }

        return -1;
    }
}
