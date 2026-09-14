namespace ProjectHiddenVillage.Server.Api.Services.Games;

/// <summary>
/// Compares a resolved card property value with an authored predicate value.
///
/// Card types are authored with their printed spelling ("EX Character"), while the engine resolves the
/// <see cref="CardType"/> enum name ("ExCharacter"). Comparing those literally made
/// <c>Type Equals "EX Character"</c> unmatchable and <c>Type Not Equals "EX Character"</c>
/// unconditionally true - so "non-EX only" restrictions (e.g. N-018's K.O., N-019/N-022's
/// reveal-summon filters) silently accepted EX characters. Type values are therefore compared on an
/// alphanumeric, case-insensitive form, which also tolerates "EXCharacter"/"Ex Character".
/// </summary>
internal static class ZoneCardPropertyValueMatcher
{
    public static bool IsMatch(
        ZoneCardProperty property,
        string propertyValue,
        string expectedValue,
        bool ignoreCase)
    {
        if (property == ZoneCardProperty.Type)
        {
            return string.Equals(
                NormalizeTypeValue(propertyValue),
                NormalizeTypeValue(expectedValue),
                StringComparison.Ordinal);
        }

        return string.Equals(
            propertyValue,
            expectedValue,
            ignoreCase ? StringComparison.OrdinalIgnoreCase : StringComparison.Ordinal);
    }

    private static string NormalizeTypeValue(string value)
    {
        return string.Concat(value.Where(char.IsLetterOrDigit)).ToUpperInvariant();
    }
}
