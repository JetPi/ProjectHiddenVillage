namespace ProjectHiddenVillage.Server;

/// <summary>
/// What an admin upload gets back: the reference to store on the card entry, plus a cache-busting version so a
/// preview can be re-fetched the moment the master changes.
/// </summary>
public sealed record CardArtUploadResponse(string CardId, string Reference, long Version);
