using ErrorOr;

namespace ProjectHiddenVillage.Server.Api.Services.Chat;

internal static class GameChatErrorCodes
{
    internal const string MissingGameId = "Game.Chat.MissingGameId";
    internal const string Disabled = "Game.Chat.Disabled";
    internal const string Empty = "Game.Chat.Empty";
    internal const string TooLong = "Game.Chat.TooLong";
    internal const string RateLimited = "Game.Chat.RateLimited";
}

internal static class GameChatRules
{
    /// <summary>
    /// Trims and bounds the text. A rejected message is reported rather than truncated, because a silently
    /// shortened message reads as if the opponent received what was typed.
    /// </summary>
    internal static ErrorOr<string> NormalizeText(string? text, GameChatOptions options)
    {
        var normalized = (text ?? string.Empty).Trim();

        if (normalized.Length == 0)
        {
            return Error.Validation(
                code: GameChatErrorCodes.Empty,
                description: "A chat message cannot be empty.");
        }

        var maxLength = Math.Max(1, options.MaxTextLength);
        if (normalized.Length > maxLength)
        {
            return Error.Validation(
                code: GameChatErrorCodes.TooLong,
                description: $"A chat message cannot be longer than {maxLength} characters.");
        }

        return normalized;
    }
}

/// <summary>
/// One player's send budget in one game. Time is passed in rather than read from the ambient clock so the refill
/// can be driven by a fake clock in tests.
/// </summary>
internal sealed class ChatSendBudget
{
    private readonly double capacity;
    private readonly double refillPerSecond;
    private double tokens;
    private DateTimeOffset lastRefillUtc;

    internal ChatSendBudget(int sendBudgetPerMinute, DateTimeOffset now)
    {
        capacity = Math.Max(1, sendBudgetPerMinute);
        refillPerSecond = capacity / 60d;
        tokens = capacity;
        lastRefillUtc = now;
    }

    internal bool TryConsume(DateTimeOffset now)
    {
        var elapsedSeconds = (now - lastRefillUtc).TotalSeconds;
        if (elapsedSeconds > 0)
        {
            tokens = Math.Min(capacity, tokens + (elapsedSeconds * refillPerSecond));
            lastRefillUtc = now;
        }

        if (tokens < 1)
        {
            return false;
        }

        tokens -= 1;
        return true;
    }
}
