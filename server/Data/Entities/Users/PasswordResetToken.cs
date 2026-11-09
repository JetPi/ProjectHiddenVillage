namespace ProjectHiddenVillage.Server.Data.Entities;

/// <summary>
/// One outstanding password-recovery link. Only the SHA-256 hash of the token is stored: a database dump must not
/// hand out working reset links, for the same reason the table never stores a password in a form that can be used
/// to sign in. The raw token exists only in the message that carries it, and only its hash is ever compared.
/// </summary>
public sealed class PasswordResetToken
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid UserId { get; set; }

    /// <summary>Hex SHA-256 of the URL-safe token. 64 characters, unique, indexed for the confirm lookup.</summary>
    public string TokenHash { get; set; } = string.Empty;

    public DateTimeOffset CreatedAtUtc { get; set; } = DateTimeOffset.UtcNow;

    public DateTimeOffset ExpiresAtUtc { get; set; }

    /// <summary>
    /// Set the moment the link is spent or superseded. A consumed row is kept for a day so the per-account request
    /// cap can be measured and so support can see that a link was issued and used; the purge removes it afterwards.
    /// </summary>
    public DateTimeOffset? ConsumedAtUtc { get; set; }

    /// <summary>Best-effort source address, kept for abuse investigation only. Never used for authorization.</summary>
    public string? RequestedFromIp { get; set; }

    public User User { get; set; } = null!;
}
