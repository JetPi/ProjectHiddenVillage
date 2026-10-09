namespace ProjectHiddenVillage.Server.Api.Services.Games;

public static partial class GameStateResponseMapper
{
    /// <summary>
    /// Projects the engine's outcome onto its wire shape. <c>null</c> in, <c>null</c> out: the client reads
    /// "no outcome" as "the game is still running", so a running game must not carry an empty result object.
    /// </summary>
    private static GameOutcomeResponse? ToGameOutcomeResponse(GameOutcome? outcome)
    {
        return outcome is null
            ? null
            : new GameOutcomeResponse(
                WinnerPlayerId: outcome.WinnerPlayerId,
                LoserPlayerIds: outcome.LoserPlayerIds,
                Reason: outcome.Reason.ToString(),
                TurnNumber: outcome.TurnNumber);
    }
}
