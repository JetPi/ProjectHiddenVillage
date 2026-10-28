namespace ProjectHiddenVillage.Server.Api.Services.Chat;

public sealed class GameChatOptions
{
    public const string SectionName = "GameChat";

    public bool Enabled { get; set; } = true;

    public int MaxTextLength { get; set; } = 500;

    /// <summary>How many messages a game keeps. The client re-reads this tail to catch up, so it stays bounded.</summary>
    public int MaxMessagesPerGame { get; set; } = 200;

    /// <summary>Per-player send budget, as a token bucket refilled over a minute.</summary>
    public int SendBudgetPerMinute { get; set; } = 30;

    /// <summary>How long a room with no traffic is kept before it is dropped.</summary>
    public int RoomIdleMinutes { get; set; } = 120;

    public int MaxRooms { get; set; } = 2000;

    /// <summary>How often an opportunistic sweep may walk the rooms, in minutes.</summary>
    public int SweepIntervalMinutes { get; set; } = 5;
}
