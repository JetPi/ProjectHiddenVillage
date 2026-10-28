using ErrorOr;
using ProjectHiddenVillage.Server.Api.Interfaces.Game;
using ProjectHiddenVillage.Server.Api.Services.Games;

namespace ProjectHiddenVillage.Server.Api.Services.Rematch;

/// <summary>
/// The rematch handshake, played on the finished board.
///
/// One player offers, the other agrees, and the agreement reserves a fresh table code under the <em>same</em> ruleset
/// binding and modifiers the match was just played with. Nothing else happens here: the reserved table is opened by
/// whoever claims it from the login view, which is what gives both players the room to change decks in between.
///
/// The offer is part of the game state (see <see cref="GameInstance.PendingRematch"/>), so these calls run under the
/// same per-game lock the engine uses, exactly like the redo handshake.
/// </summary>
public sealed class RematchHandlingService(
    InMemoryGameInstanceRegistry registry,
    RematchReservationStore reservations,
    ProjectHiddenVillage.Server.Api.Services.Games.IGameCodeAllocator codeAllocator,
    RematchOptions options,
    TimeProvider timeProvider) : IRematchHandlingService
{
    public ErrorOr<GameInstance> RequestRematch(string gameId, string requestingPlayerId)
    {
        var gameResult = GetSeatedGame(gameId, requestingPlayerId);
        if (gameResult.IsError)
        {
            return gameResult.Errors;
        }

        var game = gameResult.Value;

        lock (game)
        {
            var readiness = EnsureOfferable(game);
            if (readiness.IsError)
            {
                return readiness.Errors;
            }

            var now = timeProvider.GetUtcNow();
            var offer = PruneLapsedOffer(game, now);

            // Already agreed: the reserved code is the answer, and asking again changes nothing.
            if (offer is not null && offer.IsReserved)
            {
                return game;
            }

            // Asking twice means "yes, I am still waiting": it must not reset the clock or create a second offer.
            if (offer is not null && string.Equals(offer.RequestedByPlayerId, requestingPlayerId, StringComparison.Ordinal))
            {
                return game;
            }

            // The opponent offered first, so this request IS the agreement.
            if (offer is not null)
            {
                return AcceptOffer(game, requestingPlayerId, offer, now);
            }

            game.OpenRematchOffer(requestingPlayerId, now.Add(ConsentLifetime));
            return game;
        }
    }

    public ErrorOr<GameInstance> AcceptRematch(string gameId, string respondingPlayerId)
    {
        var gameResult = GetSeatedGame(gameId, respondingPlayerId);
        if (gameResult.IsError)
        {
            return gameResult.Errors;
        }

        var game = gameResult.Value;

        lock (game)
        {
            var readiness = EnsureOfferable(game);
            if (readiness.IsError)
            {
                return readiness.Errors;
            }

            var now = timeProvider.GetUtcNow();
            var offer = PruneLapsedOffer(game, now);

            if (offer is null)
            {
                return Error.Validation(
                    code: "Game.Rematch.NoRequest",
                    description: "There is no rematch offer waiting for an answer.");
            }

            if (offer.IsReserved)
            {
                // Already agreed by both seats: the answer is the reserved code, which the state already publishes.
                return game;
            }

            return AcceptOffer(game, respondingPlayerId, offer, now);
        }
    }

    public ErrorOr<GameInstance> DeclineRematch(string gameId, string respondingPlayerId)
    {
        var gameResult = GetSeatedGame(gameId, respondingPlayerId);
        if (gameResult.IsError)
        {
            return gameResult.Errors;
        }

        var game = gameResult.Value;

        lock (game)
        {
            var now = timeProvider.GetUtcNow();
            var offer = PruneLapsedOffer(game, now);

            if (offer is null)
            {
                return Error.Validation(
                    code: "Game.Rematch.NoRequest",
                    description: "There is no rematch offer to decline.");
            }

            if (offer.IsReserved)
            {
                return Error.Validation(
                    code: "Game.Rematch.AlreadyReserved",
                    description: "The rematch is already agreed; the reserved table only lapses when it expires.");
            }

            if (!game.DeclineRematch(respondingPlayerId))
            {
                return Error.Unauthorized(
                    code: "Game.Rematch.Forbidden",
                    description: "Current user is not a player in this game.");
            }

            return game;
        }
    }

    public ErrorOr<RematchReservation> GetActiveReservation(string gameCode)
    {
        if (string.IsNullOrWhiteSpace(gameCode))
        {
            return Error.Validation(
                code: "Game.Rematch.MissingCode",
                description: "Game code is required.");
        }

        var normalizedCode = gameCode.Trim();

        if (reservations.TryGet(normalizedCode, out var reservation) && reservation is not null)
        {
            if (!reservation.IsExpired(timeProvider.GetUtcNow()))
            {
                return reservation;
            }

            // Expired but still in the store: answer "expired" rather than "unknown", because the player holding
            // the code needs to be told which of the two it is.
            reservations.PruneExpired();

            return Error.Validation(
                code: "Game.Rematch.Expired",
                description: "This rematch table has expired. Open a new game or queue again.");
        }

        reservations.PruneExpired();

        return Error.NotFound(
            code: "Game.Rematch.NotFound",
            description: $"No rematch table is reserved under '{normalizedCode}'.");
    }

    public void CompleteReservation(string gameCode)
    {
        reservations.TryRemove(gameCode, out _);
    }

    private TimeSpan ConsentLifetime => TimeSpan.FromSeconds(Math.Max(1, options.ConsentLifetimeSeconds));

    private TimeSpan ReservationLifetime => TimeSpan.FromSeconds(Math.Max(30, options.ReservationLifetimeSeconds));

    /// <summary>
    /// Agrees to the offer, then reserves the next table. A code that cannot be reserved leaves no half-agreed
    /// offer behind: the players are told and the board goes back to offering a rematch.
    /// </summary>
    private ErrorOr<GameInstance> AcceptOffer(
        GameInstance game,
        string acceptingPlayerId,
        RematchOffer offer,
        DateTimeOffset now)
    {
        if (!game.TryAcceptRematch(acceptingPlayerId, now))
        {
            return Error.Validation(
                code: "Game.Rematch.NotAnswerable",
                description: "This rematch offer cannot be answered by you, or it has expired.");
        }

        var reservation = ReserveTable(game, now);
        if (reservation is null)
        {
            game.ClearRematchOffer();

            return Error.Validation(
                code: "Game.Rematch.Unavailable",
                description: "A table for the rematch could not be reserved. Try again in a moment.");
        }

        game.MarkRematchReserved(reservation.Code, reservation.Ruleset?.Name);
        return game;
    }

    /// <summary>
    /// Claims a code and records the reservation. The ruleset binding (clock included) and the modifiers are copied
    /// over, which is what makes "the ruleset cannot change between matches" true whatever happens to the format
    /// definition afterwards; the decks themselves are judged against the live definition when they are claimed.
    /// </summary>
    private RematchReservation? ReserveTable(GameInstance game, DateTimeOffset now)
    {
        var allocation = codeAllocator.Allocate();
        if (!allocation.IsAllocated)
        {
            return null;
        }

        var reservation = new RematchReservation
        {
            Code = allocation.Code,
            SourceGameId = game.Id,
            Ruleset = game.Ruleset,
            Modifiers = game.Modifiers.Count == 0 ? [] : [.. game.Modifiers],
            PlayerIds = game.State.Players.Select(player => player.PlayerId).ToList(),
            CreatedAtUtc = now,
            ExpiresAtUtc = now.Add(ReservationLifetime),
        };

        if (!reservations.TryAdd(reservation))
        {
            codeAllocator.Release(allocation.Code);
            return null;
        }

        return reservation;
    }

    /// <summary>A lapsed offer is indistinguishable from no offer at all, so it is dropped before it is read.</summary>
    private RematchOffer? PruneLapsedOffer(GameInstance game, DateTimeOffset now)
    {
        var offer = game.PendingRematch;

        if (offer is not null && !offer.IsReserved && now >= offer.ExpiresAtUtc)
        {
            game.ClearRematchOffer();
            return null;
        }

        return offer;
    }

    /// <summary>Only a finished two-player table has a next match to offer.</summary>
    private static ErrorOr<Success> EnsureOfferable(GameInstance game)
    {
        if (!GameEndRules.IsGameOver(game.State))
        {
            return Error.Validation(
                code: "Game.Rematch.NotFinished",
                description: "A rematch can only be offered once this match is over.");
        }

        if (game.State.Players.Count != 2)
        {
            return Error.Validation(
                code: "Game.Rematch.TwoPlayersRequired",
                description: "A rematch needs two seated players.");
        }

        return Result.Success;
    }

    private ErrorOr<GameInstance> GetSeatedGame(string gameId, string playerId)
    {
        if (string.IsNullOrWhiteSpace(gameId))
        {
            return Error.Validation(
                code: "Game.Rematch.MissingGame",
                description: "Game id is required.");
        }

        if (!registry.TryGet(gameId.Trim(), out var game) || game is null)
        {
            return Error.NotFound(
                code: "Game.Rematch.NotFound",
                description: $"Game instance '{gameId}' was not found.");
        }

        if (!game.State.Players.Any(player => string.Equals(player.PlayerId, playerId, StringComparison.Ordinal)))
        {
            return Error.Unauthorized(
                code: "Game.Rematch.Forbidden",
                description: "Current user is not a player in this game.");
        }

        return game;
    }
}
