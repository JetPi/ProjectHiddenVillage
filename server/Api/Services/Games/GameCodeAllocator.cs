using System.Security.Cryptography;
using System.Text.RegularExpressions;

namespace ProjectHiddenVillage.Server.Api.Services.Games;

/// <summary>
/// Why <see cref="IGameCodeAllocator.Allocate"/> did or did not hand out a code.
/// </summary>
public enum GameCodeAllocationStatus
{
    /// <summary>A code was claimed for the caller.</summary>
    Allocated,

    /// <summary>The preferred code is not a five-character alphanumeric string.</summary>
    InvalidFormat,

    /// <summary>The preferred code is already held by a live table or a reservation.</summary>
    InUse,

    /// <summary>Enough attempts were made and every candidate was taken.</summary>
    Exhausted,
}

public readonly record struct GameCodeAllocation(GameCodeAllocationStatus Status, string Code)
{
    public bool IsAllocated => Status == GameCodeAllocationStatus.Allocated;
}

/// <summary>
/// The authority on which game codes are in use. A code is unique among the tables that are in use - live games
/// and the reservations that will become games - and is free to be handed out again once the table it belonged to
/// has retired.
///
/// It lives next to the registry rather than inside it because two things mint codes: the registry when a table is
/// created, and the rematch store when an agreed rematch gets its code before anybody has sat down. Both have to
/// see the other's claims, or a reservation and a live table could end up with the same code.
///
/// A retired code is quarantined for a while (<see cref="QuarantineCapacity"/>) before it can be allocated again: a
/// client still holding the old code must not land in a stranger's new table.
/// </summary>
public interface IGameCodeAllocator
{
    /// <summary>Five, mirrored from the registry's format rule and the database's check constraint.</summary>
    int CodeLength { get; }

    /// <summary>True when a live table or a reservation holds <paramref name="code"/>.</summary>
    bool IsClaimed(string code);

    /// <summary>
    /// Claims a code for the caller: <paramref name="preferredCode"/> when one is given, a freshly generated one
    /// otherwise. Nothing is claimed when the status is not <see cref="GameCodeAllocationStatus.Allocated"/>.
    /// </summary>
    GameCodeAllocation Allocate(string? preferredCode = null);

    /// <summary>
    /// Takes over a code that is already claimed - the path a rematch reservation uses when the table it reserved
    /// finally opens. Returns false when the code is not claimed, so a caller cannot adopt a code out of thin air.
    /// </summary>
    bool TryAdopt(string code);

    /// <summary>
    /// Gives a code back. The table or reservation using it is gone, so the code goes into quarantine and becomes
    /// allocatable again once it falls out of it.
    /// </summary>
    void Release(string code);

    /// <summary>The codes waiting in the quarantine, oldest first. Exposed for diagnostics and tests.</summary>
    IReadOnlyList<string> QuarantinedCodes { get; }

    /// <summary>True when the string is a code the registry and the database will both accept.</summary>
    bool IsWellFormed(string code);
}

/// <summary>
/// In-memory <see cref="IGameCodeAllocator"/>, holding the same lifetime as the registry it serves.
/// </summary>
public sealed partial class GameCodeAllocator : IGameCodeAllocator
{
    public const int DefaultQuarantineCapacity = 256;

    private const int AllocationAttempts = 256;

    // Upper case only, deliberately: the hub upper-cases every incoming game id while the registry compares with
    // StringComparer.Ordinal, so a lower-case code would be a table nobody could reach.
    private const string CodeAlphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

    private readonly object syncRoot = new();
    private readonly HashSet<string> claimed = new(StringComparer.Ordinal);
    private readonly Queue<string> quarantineOrder = new();
    private readonly HashSet<string> quarantined = new(StringComparer.Ordinal);
    private readonly int quarantineCapacity;

    public GameCodeAllocator(int quarantineCapacity = DefaultQuarantineCapacity)
    {
        this.quarantineCapacity = Math.Max(0, quarantineCapacity);
    }

    public int CodeLength => 5;

    public GameCodeAllocation Allocate(string? preferredCode = null)
    {
        lock (syncRoot)
        {
            if (!string.IsNullOrWhiteSpace(preferredCode))
            {
                var normalized = preferredCode.Trim();

                if (!GameCodePattern().IsMatch(normalized))
                {
                    return new GameCodeAllocation(GameCodeAllocationStatus.InvalidFormat, string.Empty);
                }

                if (!TryClaimLocked(normalized))
                {
                    return new GameCodeAllocation(GameCodeAllocationStatus.InUse, normalized);
                }

                return new GameCodeAllocation(GameCodeAllocationStatus.Allocated, normalized);
            }

            for (var attempt = 0; attempt < AllocationAttempts; attempt++)
            {
                var candidate = GenerateCode();
                if (TryClaimLocked(candidate))
                {
                    return new GameCodeAllocation(GameCodeAllocationStatus.Allocated, candidate);
                }
            }

            return new GameCodeAllocation(GameCodeAllocationStatus.Exhausted, string.Empty);
        }
    }

    public bool TryAdopt(string code)
    {
        if (string.IsNullOrWhiteSpace(code))
        {
            return false;
        }

        lock (syncRoot)
        {
            return claimed.Contains(code.Trim());
        }
    }

    public bool IsClaimed(string code)
    {
        if (string.IsNullOrWhiteSpace(code))
        {
            return false;
        }

        lock (syncRoot)
        {
            return claimed.Contains(code.Trim());
        }
    }

    public void Release(string code)
    {
        if (string.IsNullOrWhiteSpace(code))
        {
            return;
        }

        var normalized = code.Trim();

        lock (syncRoot)
        {
            claimed.Remove(normalized);

            if (quarantineCapacity == 0 || quarantined.Contains(normalized))
            {
                return;
            }

            quarantineOrder.Enqueue(normalized);
            quarantined.Add(normalized);

            // Oldest first: the code that has been retired longest is the one most likely to be forgotten by the
            // clients that saw it, so it is the first to become allocatable again.
            while (quarantineOrder.Count > quarantineCapacity)
            {
                quarantined.Remove(quarantineOrder.Dequeue());
            }
        }
    }

    public IReadOnlyList<string> QuarantinedCodes
    {
        get
        {
            lock (syncRoot)
            {
                return quarantineOrder.ToList();
            }
        }
    }

    public bool IsWellFormed(string code)
    {
        return !string.IsNullOrWhiteSpace(code) && GameCodePattern().IsMatch(code.Trim());
    }

    /// <summary>
    /// Claims a code unless a live table, a reservation or the quarantine still holds it. Returns false when it is
    /// taken, which is the caller's signal to try another candidate.
    /// </summary>
    private bool TryClaimLocked(string code)
    {
        if (claimed.Contains(code) || quarantined.Contains(code))
        {
            return false;
        }

        claimed.Add(code);
        return true;
    }

    private string GenerateCode()
    {
        return string.Create(CodeLength, 0, static (buffer, _) =>
        {
            for (var index = 0; index < buffer.Length; index++)
            {
                buffer[index] = CodeAlphabet[RandomNumberGenerator.GetInt32(CodeAlphabet.Length)];
            }
        });
    }

    [GeneratedRegex("^[A-Za-z0-9]{5}$", RegexOptions.CultureInvariant)]
    private static partial Regex GameCodePattern();
}
