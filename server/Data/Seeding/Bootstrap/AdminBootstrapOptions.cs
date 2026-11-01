namespace ProjectHiddenVillage.Server.Data.Seeding.Bootstrap;

public sealed class AdminBootstrapOptions
{
    public const string SectionName = "AdminBootstrap";

    public string Email { get; set; } = string.Empty;

    public string Username { get; set; } = string.Empty;

    // Only used to create the account the first time; an existing account is never rewritten.
    public string Password { get; set; } = string.Empty;
}
