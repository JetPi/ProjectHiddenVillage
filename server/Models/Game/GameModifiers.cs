namespace ProjectHiddenVillage.Server;

/// <summary>
/// The modifiers a host can toggle on a game they open. A modifier changes how the table runs without describing a
/// deck format, which is why it lives on the instance and never on a ruleset: the same format can be played timed or
/// relaxed, and quick match has no way to ask for one.
///
/// See <c>plans/time-relaxed-modifier-and-quickmatch-availability.md</c>. Adding a modifier means adding a key here, an
/// effect where the engine resolves the thing it changes, and a label on the client.
/// </summary>
public static class GameModifierKeys
{
    /// <summary>
    /// The untimed table: the action clock is off for this game, whatever the ruleset it was created under binds.
    /// This replaced the seeded "Time Relaxed" ruleset, which wrongly made an untimed game look like a format.
    /// </summary>
    public const string TimeRelaxed = "time-relaxed";

    /// <summary>Every modifier a create request may ask for, in the canonical response order.</summary>
    public static IReadOnlyList<string> All { get; } = [TimeRelaxed];

    public static IReadOnlySet<string> Known { get; } = new HashSet<string>(All, StringComparer.Ordinal);

    /// <summary>The known keys as one comma-separated string, for a validation message.</summary>
    public static string AllowedList => string.Join(", ", All);

    /// <summary>
    /// Canonicalises requested modifier keys: trimmed, lower-cased, de-duplicated and reordered to the catalog order,
    /// so two requests asking for the same table always produce the same instance state.
    ///
    /// Unknown keys are reported rather than dropped: a client that asks for a modifier this deployment does not know
    /// must be told its request was not honoured, instead of silently hosting a different game than it promised.
    /// </summary>
    public static bool TryNormalize(
        IEnumerable<string>? requested,
        out IReadOnlyList<string> normalized,
        out string? unknownKey)
    {
        var requestedKeys = new HashSet<string>(StringComparer.Ordinal);

        foreach (var key in requested ?? [])
        {
            if (string.IsNullOrWhiteSpace(key))
            {
                continue;
            }

            requestedKeys.Add(key.Trim().ToLowerInvariant());
        }

        unknownKey = requestedKeys.FirstOrDefault(key => !Known.Contains(key));
        normalized = All.Where(requestedKeys.Contains).ToList();

        return unknownKey is null;
    }

    /// <summary>True when the instance carries the untimed modifier.</summary>
    public static bool IsTimeRelaxed(IEnumerable<string> modifiers)
    {
        ArgumentNullException.ThrowIfNull(modifiers);

        return modifiers.Contains(TimeRelaxed, StringComparer.Ordinal);
    }
}
