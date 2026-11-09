namespace ProjectHiddenVillage.Server;

public static class AuthorizationPolicies
{
    public const string CardCatalogAdmin = "CardCatalogAdmin";
    public const string CardCatalogAdminClaimType = "card_catalog_admin";
    public const string CardCatalogAdminClaimValue = "true";

    /// <summary>
    /// Marks a token minted for a throwaway guest identity. Guests play every game mode, but they own nothing
    /// durable: decks cannot be saved and their win/loss record is never kept.
    /// </summary>
    public const string GuestClaimType = "guest";
    public const string GuestClaimValue = "true";

    /// <summary>
    /// The account's <c>AuthVersion</c> at the moment the session was minted. A password reset increments the stored
    /// version, and validation refuses any token whose claim no longer matches.
    /// </summary>
    public const string AuthVersionClaimType = "ver";

    /// <summary>
    /// Authenticated and not a guest. Used by the endpoints that persist something a guest must not own.
    /// </summary>
    public const string RegisteredUser = "RegisteredUser";
}
