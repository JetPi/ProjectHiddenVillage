using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using ProjectHiddenVillage.Server.Api.Interfaces.Deck;
using ProjectHiddenVillage.Server.Data;
using ProjectHiddenVillage.Server.Data.Entities;

namespace ProjectHiddenVillage.Server.Api.Services.Deck;

/// <summary>
/// Writes the deck records with one atomic upsert per seated player.
///
/// The increments are done in SQL (`ON CONFLICT ... DO UPDATE`) rather than by loading a row, adding one and saving
/// it, because two games on the same deck can finish at the same instant and a read-modify-write would drop one of
/// them. The upsert also carries the two eligibility rules: the row is only inserted when the player is a real user
/// (guests own nothing durable, so their results are never kept) and the foreign keys reject a deck that no longer
/// exists, which makes an already-deleted deck a no-op instead of an error.
/// </summary>
public sealed class GameResultRecorder(
    IServiceScopeFactory scopeFactory,
    TimeProvider timeProvider,
    ILogger<GameResultRecorder> logger) : IGameResultRecorder
{
    public async Task RecordAsync(GameInstance instance)
    {
        ArgumentNullException.ThrowIfNull(instance);

        if (instance.State.Outcome is not { } outcome)
        {
            return;
        }

        var results = ResolveResults(instance, outcome);
        if (results.Count == 0)
        {
            return;
        }

        try
        {
            // The registry is a singleton and outlives any request, so the recorder opens its own scope for the
            // DbContext instead of holding one from a request that has already ended.
            await using var scope = scopeFactory.CreateAsyncScope();
            var dbContext = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var recordedAt = timeProvider.GetUtcNow();

            foreach (var result in results)
            {
                if (dbContext.Database.IsRelational())
                {
                    await dbContext.Database.ExecuteSqlAsync(
                        FormattableSql(result, recordedAt),
                        CancellationToken.None);
                    continue;
                }

                // The in-memory provider the tests compose has no SQL at all, so the same eligibility rules are
                // applied through EF instead. Production always takes the atomic statement above.
                await RecordThroughEfAsync(dbContext, result, recordedAt);
            }
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            // The game is already over and both players have seen the result: losing the statistics write is a
            // logging problem, not a reason to surface an error for a match that finished cleanly.
            logger.LogError(
                ex,
                "Recording the result of game {GameId} against its decks failed.",
                instance.Id);
        }
    }

    private static async Task RecordThroughEfAsync(
        ApplicationDbContext dbContext,
        DeckResult result,
        DateTimeOffset recordedAt)
    {
        var isEligibleUser = await dbContext.Users
            .AnyAsync(user => user.Id == result.UserId && !user.IsGuest);

        if (!isEligibleUser)
        {
            return;
        }

        // A deck deleted between the game and this write leaves nothing to credit; the relational path gets the
        // same behaviour from the foreign key.
        var deckExists = await dbContext.Decks.AnyAsync(deck => deck.Id == result.DeckId);
        if (!deckExists)
        {
            return;
        }

        var record = await dbContext.DeckRecords
            .SingleOrDefaultAsync(entry => entry.DeckId == result.DeckId && entry.UserId == result.UserId);

        if (record is null)
        {
            dbContext.DeckRecords.Add(new DeckRecord
            {
                DeckId = result.DeckId,
                UserId = result.UserId,
                Wins = result.Wins,
                Losses = result.Losses,
                Draws = result.Draws,
                UpdatedAtUtc = recordedAt,
            });
        }
        else
        {
            record.Wins += result.Wins;
            record.Losses += result.Losses;
            record.Draws += result.Draws;
            record.UpdatedAtUtc = recordedAt;
        }

        await dbContext.SaveChangesAsync();
    }

    private static FormattableString FormattableSql(DeckResult result, DateTimeOffset recordedAt)
    {
        return $"""
            INSERT INTO deck_records ("DeckId", "UserId", "Wins", "Losses", "Draws", "UpdatedAtUtc")
            SELECT {result.DeckId}, {result.UserId}, {result.Wins}, {result.Losses}, {result.Draws}, {recordedAt}
            FROM users
            WHERE users."Id" = {result.UserId} AND NOT users."IsGuest"
            ON CONFLICT ("DeckId", "UserId") DO UPDATE
            SET "Wins" = deck_records."Wins" + EXCLUDED."Wins",
                "Losses" = deck_records."Losses" + EXCLUDED."Losses",
                "Draws" = deck_records."Draws" + EXCLUDED."Draws",
                "UpdatedAtUtc" = EXCLUDED."UpdatedAtUtc";
            """;
    }

    /// <summary>
    /// One row per seated player who brought a stored deck. A game with no winner is a draw for everybody at the
    /// table: nothing is credited as a defeat, because a draw is not a loss.
    /// </summary>
    private static List<DeckResult> ResolveResults(GameInstance instance, GameOutcome outcome)
    {
        var results = new List<DeckResult>();
        var isDraw = string.IsNullOrWhiteSpace(outcome.WinnerPlayerId);

        foreach (var player in instance.State.Players)
        {
            if (!instance.PlayerDeckIds.TryGetValue(player.PlayerId, out var deckId) || deckId == Guid.Empty)
            {
                continue;
            }

            if (!Guid.TryParse(player.PlayerId, out var userId))
            {
                continue;
            }

            var isWinner = !isDraw
                && string.Equals(outcome.WinnerPlayerId, player.PlayerId, StringComparison.Ordinal);
            var isLoser = !isDraw && outcome.LoserPlayerIds.Contains(player.PlayerId, StringComparer.Ordinal);

            results.Add(new DeckResult(
                DeckId: deckId,
                UserId: userId,
                Wins: isWinner ? 1 : 0,
                Losses: isLoser ? 1 : 0,
                Draws: isDraw ? 1 : 0));
        }

        return results;
    }

    private sealed record DeckResult(Guid DeckId, Guid UserId, int Wins, int Losses, int Draws);
}
