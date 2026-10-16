using System.Text.RegularExpressions;

namespace ProjectHiddenVillage.Server.Api.Services.CardArt;

/// <summary>
/// Card art has exactly two possible sources, and the value stored in <c>CardCatalogEntry.Image</c> is what
/// says which one: an absolute http(s) URL that the read path fetches, or a <c>local:</c> reference naming a
/// master this server owns. A local reference is deliberately opaque to the browser - nothing is served from
/// it directly - so it can carry a relative path without leaking the deployment layout.
/// </summary>
public static partial class CardArtSourceReference
{
    /// <summary>Marks a reference as server-owned art rather than a fetchable URL.</summary>
    public const string LocalPrefix = "local:";

    /// <summary>
    /// The folder segment every local reference carries. The upload root itself stays private so a reference
    /// never has to name an absolute path.
    /// </summary>
    public const string LocalFolder = "card-art";

    /// <summary>Uploaded masters are always re-encoded, so the stored file is always a WebP.</summary>
    public const string MasterExtension = ".webp";

    /// <summary>Separates the card id from the width and version in a cached variant's file name.</summary>
    public const string VariantSeparator = "__w";

    /// <summary>Matches the <c>CardCatalogEntry.CardId</c> column length.</summary>
    public const int MaxSegmentLength = 64;

    public static bool IsLocal(string? reference)
    {
        return !string.IsNullOrWhiteSpace(reference)
            && reference.Trim().StartsWith(LocalPrefix, StringComparison.Ordinal);
    }

    /// <summary>
    /// True when a local reference has the exact shape <see cref="BuildLocalReference"/> produces:
    /// <c>local:card-art/<safe card id>.webp</c>, and nothing looser. A bare <c>local:</c> prefix names no
    /// file at all, so a validator that only asked "does it start with local:" would let one through.
    /// </summary>
    public static bool IsWellFormedLocalReference(string? reference)
    {
        if (!IsLocal(reference))
        {
            return false;
        }

        var relative = reference!.Trim()[LocalPrefix.Length..].Replace('\\', '/');
        var segments = relative.Split('/');

        if (segments.Length != 2 || !string.Equals(segments[0], LocalFolder, StringComparison.Ordinal))
        {
            return false;
        }

        return TryGetMasterCardId(segments[1], out _);
    }

    /// <summary>The reference stored on the card entry for the given card id.</summary>
    public static string BuildLocalReference(string cardId)
    {
        return $"{LocalPrefix}{LocalFolder}/{BuildFileName(cardId)}";
    }

    public static string BuildFileName(string cardId)
    {
        return $"{SafeSegment(cardId)}{MasterExtension}";
    }

    /// <summary>
    /// The reference a stored master's file name belongs to. The sweep works from files on disk back to
    /// references, so it needs the inverse of <see cref="BuildFileName"/>.
    /// </summary>
    public static string BuildLocalReferenceFromFileName(string fileName)
    {
        return $"{LocalPrefix}{LocalFolder}/{fileName}";
    }

    /// <summary>Recovers the card id a stored master file name belongs to.</summary>
    public static bool TryGetMasterCardId(string fileName, out string cardId)
    {
        cardId = string.Empty;

        if (string.IsNullOrWhiteSpace(fileName)
            || !fileName.EndsWith(MasterExtension, StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        var withoutExtension = fileName[..^MasterExtension.Length];
        if (!IsSafeSegment(withoutExtension))
        {
            return false;
        }

        cardId = withoutExtension;
        return true;
    }

    /// <summary>
    /// Recovers the card id a cached variant belongs to. Variant names are
    /// <c><cardId>__w<width>__v<version>.webp</c>; anything else is not ours and is left alone.
    /// </summary>
    public static bool TryGetVariantCardId(string fileName, out string cardId)
    {
        cardId = string.Empty;

        if (string.IsNullOrWhiteSpace(fileName))
        {
            return false;
        }

        var separatorIndex = fileName.IndexOf(VariantSeparator, StringComparison.Ordinal);
        if (separatorIndex <= 0)
        {
            return false;
        }

        var candidate = fileName[..separatorIndex];
        if (!IsSafeSegment(candidate))
        {
            return false;
        }

        cardId = candidate;
        return true;
    }

    /// <summary>
    /// Resolves a local reference to an absolute path under <paramref name="artRoot"/>. Returns false when the
    /// reference is malformed or escapes the root - the guard matters because the value comes out of the
    /// database and is about to be joined into a filesystem path.
    /// </summary>
    public static bool TryResolveLocalPath(string? reference, string? artRoot, out string fullPath)
    {
        fullPath = string.Empty;

        if (!IsLocal(reference) || string.IsNullOrWhiteSpace(artRoot))
        {
            return false;
        }

        var relative = reference!.Trim()[LocalPrefix.Length..].Replace('\\', '/');

        // Every segment is checked rather than the raw string: an empty segment means the reference trails into a
        // directory ("local:card-art/") or is rooted ("local:/etc/passwd"), and both are refused rather than
        // quietly reinterpreted. Two segments are required because BuildLocalReference always writes
        // "<folder>/<file>", so a reference naming only the folder is not a master.
        var segments = relative.Split('/');
        if (segments.Length < 2
            || Path.IsPathRooted(relative)
            || segments.Any(segment => segment.Length == 0
                || segment is "." or ".."
                || segment.Contains("..", StringComparison.Ordinal)))
        {
            return false;
        }

        var normalizedRoot = Path.GetFullPath(artRoot);
        var candidate = Path.GetFullPath(Path.Combine(normalizedRoot, relative));
        var rootWithSeparator = normalizedRoot.EndsWith(Path.DirectorySeparatorChar)
            ? normalizedRoot
            : normalizedRoot + Path.DirectorySeparatorChar;

        if (!candidate.StartsWith(rootWithSeparator, StringComparison.Ordinal))
        {
            return false;
        }

        fullPath = candidate;
        return true;
    }

    /// <summary>Turns any card id into a single safe path segment.</summary>
    public static string SafeSegment(string? value)
    {
        return InvalidPathSegmentChars().Replace(value ?? string.Empty, "_");
    }

    /// <summary>
    /// True when the card id can be used as a stored file name and as a URL segment unchanged. A card id that
    /// needs sanitising is refused rather than rewritten, so the stored art never drifts from the card.
    /// </summary>
    public static bool IsSafeSegment(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return false;
        }

        var trimmed = value.Trim();

        return trimmed.Length <= MaxSegmentLength
            && trimmed is not "." and not ".."
            && !trimmed.Contains("..", StringComparison.Ordinal)
            && SafeSegment(trimmed) == trimmed;
    }

    [GeneratedRegex(@"[^a-zA-Z0-9._-]", RegexOptions.CultureInvariant)]
    private static partial Regex InvalidPathSegmentChars();
}
