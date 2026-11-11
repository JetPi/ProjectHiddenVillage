namespace ProjectHiddenVillage.Server.Api.Services.Email;

/// <summary>
/// Raised when the provider refuses the message. The caller logs it and still answers the request normally: a
/// failure that only happens for addresses that exist would otherwise be a way to enumerate them.
/// </summary>
public sealed class EmailDeliveryException : Exception
{
    public EmailDeliveryException(string message)
        : base(message)
    {
    }

    public EmailDeliveryException(string message, Exception innerException)
        : base(message, innerException)
    {
    }
}
