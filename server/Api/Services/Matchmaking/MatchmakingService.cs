using ErrorOr;
using Microsoft.Extensions.Options;
using ProjectHiddenVillage.Server.Api.Interfaces.Deck;
using ProjectHiddenVillage.Server.Api.Interfaces.Game;
using ProjectHiddenVillage.Server.Api.Interfaces.User;

namespace ProjectHiddenVillage.Server.Api.Services.Matchmaking;

/// <summary>
/// The quick-match queue. Two players meet here only when they queued for the same ruleset, and the game is
/// created at the instant the second one arrives: no half-populated game ever enters the registry, so the engine's
/// "a game starts when it has two players" rule keeps holding.
/// </summary>
public sealed class MatchmakingService : IMatchmakingService
{
    private readonly InMemoryGameInstanceRegistry registry;
    private readonly IGameReadService gameReadService;
    private readonly IDeckRulesetService deckRulesetService;
    private readonly IGameRulesetDeckValidator deckValidator;
    private readonly MatchmakingQueue queue;
    private readonly MatchmakingOptions options;
    private readonly TimeProvider timeProvider;
    private readonly IGuestUserService? guestUserService;

    public MatchmakingService(
        InMemoryGameInstanceRegistry registry,
        IGameReadService gameReadService,
        IDeckRulesetService deckRulesetService,
        IGameRulesetDeckValidator deckValidator,
        MatchmakingQueue queue,
        IOptions<MatchmakingOptions> options,
        TimeProvider timeProvider,
        IGuestUserService? guestUserService = null)
    {
        this.registry = registry;
        this.gameReadService = gameReadService;
        this.deckRulesetService = deckRulesetService;
        this.deckValidator = deckValidator;
        this.queue = queue;
        this.options = options.Value;
        this.timeProvider = timeProvider;
        this.guestUserService = guestUserService;
    }

    public async Task<ErrorOr<MatchTicketResponse>> EnqueueAsync(
        EnqueueMatchRequest request,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);

        if (request.UserId == Guid.Empty)
        {
            return Error.Validation(code: "Matchmaking.Enqueue.MissingUser", description: "A player is required to queue.");
        }

        if (request.DeckId == Guid.Empty)
        {
            return Error.Validation(code: "Matchmaking.Enqueue.MissingDeck", description: "A deck is required to queue.");
        }

        if (request.RulesetId == Guid.Empty)
        {
            return Error.Validation(code: "Matchmaking.Enqueue.MissingRuleset", description: "A ruleset is required to queue.");
        }

        var rulesetResult = await deckRulesetService.GetActiveRulesetDefinition(request.RulesetId);
        if (rulesetResult.IsError)
        {
            return rulesetResult.Errors;
        }

        var ruleset = rulesetResult.Value;

        var deckResult = await gameReadService.ResolvePlayerDeckData(
            request.UserId,
            request.DeckId,
            operationName: "Matchmaking.Enqueue");

        if (deckResult.IsError)
        {
            return deckResult.Errors;
        }

        var deck = deckResult.Value;

        // The deck is judged before the player joins the queue, so an illegal deck can never take a slot that an
        // opponent might get paired with.
        var legality = deckValidator.Validate(deck, ruleset);
        if (legality.IsError)
        {
            return legality.Errors;
        }

        if (guestUserService is not null)
        {
            await guestUserService.TouchAsync(request.UserId.ToString("N"), cancellationToken);
        }

        var now = timeProvider.GetUtcNow();
        var ticket = new MatchTicket
        {
            RulesetId = ruleset.Id,
            RulesetKey = ruleset.Key,
            RulesetName = ruleset.Name,
            UserId = request.UserId,
            DeckId = request.DeckId,
            PlayerName = deck.Player.DisplayName,
            Deck = deck,
            EnqueuedAtUtc = now,
        };

        lock (queue.SyncRoot)
        {
            PruneTickets(now);
            // Queueing again replaces whatever this player had in flight: two tickets from one player must never
            // be able to share an opponent.
            EvictTicketsForUser(ticket.UserId);

            var opponent = queue.Snapshot()
                .Where(candidate => candidate.State == MatchTicketStates.Waiting
                    && candidate.RulesetId == ruleset.Id
                    && candidate.UserId != ticket.UserId
                    && candidate.Deck is not null)
                .OrderBy(candidate => candidate.EnqueuedAtUtc)
                .FirstOrDefault();

            if (opponent is null)
            {
                queue.Add(ticket);
                return ToResponse(ticket);
            }

            var opponentDeck = opponent.Deck!;
            GameInstance game;

            try
            {
                game = registry.Create(
                    [opponentDeck.Player, deck.Player],
                    MergeCardDefinitions(opponentDeck.CardDefinitions, deck.CardDefinitions));
            }
            catch (Exception ex) when (ex is ArgumentException or InvalidOperationException)
            {
                // The game could not be minted (a deck the engine refuses, for instance): the arriving player
                // waits instead of the queue losing both of them.
                queue.Add(ticket);
                return ToResponse(ticket);
            }

            game.Ruleset = new GameRulesetBinding(ruleset.Id, ruleset.Key, ruleset.Name);
            OpeningSupportSeeding.EnsureSupportCardSeededIntoOpeningDrawWindow(game, opponentDeck.Player.Id, opponent.DeckId);
            OpeningSupportSeeding.EnsureSupportCardSeededIntoOpeningDrawWindow(game, deck.Player.Id, ticket.DeckId);

            opponent.State = MatchTicketStates.Matched;
            opponent.GameId = game.Id;
            opponent.OpponentName = ticket.PlayerName;
            opponent.FinishedAtUtc = now;

            ticket.State = MatchTicketStates.Matched;
            ticket.GameId = game.Id;
            ticket.OpponentName = opponent.PlayerName;
            ticket.FinishedAtUtc = now;

            queue.Add(opponent);
            queue.Add(ticket);

            return ToResponse(ticket);
        }
    }

    public ErrorOr<MatchTicketResponse> GetTicket(string ticketId, Guid requestingUserId)
    {
        if (string.IsNullOrWhiteSpace(ticketId))
        {
            return Error.Validation(code: "Matchmaking.Ticket.MissingId", description: "A ticket id is required.");
        }

        lock (queue.SyncRoot)
        {
            PruneTickets(timeProvider.GetUtcNow());

            if (!queue.TryGet(ticketId.Trim(), out var ticket) || ticket is null)
            {
                return Error.NotFound(
                    code: "Matchmaking.Ticket.NotFound",
                    description: "This match ticket no longer exists.");
            }

            if (ticket.UserId != requestingUserId)
            {
                return Error.Unauthorized(
                    code: "Matchmaking.Ticket.Forbidden",
                    description: "This match ticket belongs to another player.");
            }

            return ToResponse(ticket);
        }
    }

    public ErrorOr<MatchTicketResponse> Cancel(string ticketId, Guid requestingUserId)
    {
        var ticketResult = GetTicket(ticketId, requestingUserId);
        if (ticketResult.IsError)
        {
            return ticketResult.Errors;
        }

        lock (queue.SyncRoot)
        {
            if (!queue.TryGet(ticketResult.Value.TicketId, out var ticket) || ticket is null)
            {
                return ticketResult.Value;
            }

            if (ticket.State != MatchTicketStates.Waiting)
            {
                // Already matched: leaving the queue would strand the opponent in a game they cannot start.
                return ToResponse(ticket);
            }

            ticket.State = MatchTicketStates.Cancelled;
            ticket.FinishedAtUtc = timeProvider.GetUtcNow();
            queue.Add(ticket);

            return ToResponse(ticket);
        }
    }

    private void PruneTickets(DateTimeOffset now)
    {
        var waitingLifetime = TimeSpan.FromSeconds(Math.Max(1, options.TicketLifetimeSeconds));
        var finishedRetention = TimeSpan.FromSeconds(Math.Max(1, options.FinishedTicketRetentionSeconds));

        foreach (var ticket in queue.Snapshot())
        {
            if (ticket.State == MatchTicketStates.Waiting)
            {
                if (now - ticket.EnqueuedAtUtc >= waitingLifetime)
                {
                    ticket.State = MatchTicketStates.Expired;
                    ticket.FinishedAtUtc = now;
                }

                continue;
            }

            var finishedAt = ticket.FinishedAtUtc ?? ticket.EnqueuedAtUtc;
            if (now - finishedAt >= finishedRetention)
            {
                queue.Remove(ticket.Id);
            }
        }
    }

    private void EvictTicketsForUser(Guid userId)
    {
        foreach (var existing in queue.Snapshot().Where(candidate => candidate.UserId == userId))
        {
            queue.Remove(existing.Id);
        }
    }

    private static Dictionary<string, Card> MergeCardDefinitions(
        IReadOnlyDictionary<string, Card> first,
        IReadOnlyDictionary<string, Card> second)
    {
        var merged = new Dictionary<string, Card>(first, StringComparer.Ordinal);

        foreach (var (cardId, card) in second)
        {
            merged.TryAdd(cardId, card);
        }

        return merged;
    }

    private static MatchTicketResponse ToResponse(MatchTicket ticket)
    {
        return new MatchTicketResponse(
            TicketId: ticket.Id,
            RulesetId: ticket.RulesetId,
            RulesetName: ticket.RulesetName,
            State: ticket.State,
            GameId: ticket.GameId,
            OpponentName: ticket.OpponentName,
            EnqueuedAtUtc: ticket.EnqueuedAtUtc);
    }
}
