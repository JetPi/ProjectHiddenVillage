using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text.RegularExpressions;
using ProjectHiddenVillage.Server.Api.Interfaces.Game;

namespace ProjectHiddenVillage.Server;

public sealed class InMemoryGameInstanceRegistry
{
    private const int GameCodeLength = 5;
    private const string GameCodeAlphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    private static readonly Regex GameCodePattern = new("^[A-Za-z0-9]{5}$", RegexOptions.Compiled | RegexOptions.CultureInvariant);

    private readonly ConcurrentDictionary<string, GameInstance> instances =
        new(StringComparer.Ordinal);

    private readonly GameInstanceFactory factory;
    private readonly global::ProjectHiddenVillage.Server.Engine.GamePhaseService phaseService;

    public InMemoryGameInstanceRegistry(GameInstanceFactory factory, global::ProjectHiddenVillage.Server.Engine.GamePhaseService phaseService)
    {
        this.factory = factory;
        this.phaseService = phaseService;
    }

    public GameInstance Create(
        IReadOnlyList<Player> players,
        IReadOnlyDictionary<string, Card> cardDefinitions,
        string? preferredGameCode,
        Random? random = null)
    {
        var instance = factory.Create(players, cardDefinitions, random);

        if (!string.IsNullOrWhiteSpace(preferredGameCode))
        {
            var normalizedCode = preferredGameCode.Trim();
            if (!GameCodePattern.IsMatch(normalizedCode))
            {
                throw new ArgumentException("Preferred game code must be a 5-character alphanumeric string.", nameof(preferredGameCode));
            }

            instance.State.GameId = normalizedCode;
            if (instances.TryAdd(instance.Id, instance))
            {
                return instance;
            }

            throw new InvalidOperationException($"Game code '{normalizedCode}' is already in use.");
        }

        for (var attempt = 0; attempt < 128; attempt++)
        {
            instance.State.GameId = GenerateGameCode();
            if (instances.TryAdd(instance.Id, instance))
            {
                return instance;
            }
        }

        throw new InvalidOperationException("A unique game code could not be generated.");
    }

    public GameInstance Create(
        IReadOnlyList<Player> players,
        IReadOnlyDictionary<string, Card> cardDefinitions,
        Random? random = null)
    {
        return Create(players, cardDefinitions, preferredGameCode: null, random);
    }

    public bool TryGet(string gameId, out GameInstance? instance)
    {
        var found = instances.TryGetValue(gameId, out var existing);
        instance = existing;
        return found;
    }

    public GameInstance Join(string gameId, Player player, Random? random = null)
    {
        return Join(gameId, player, additionalCardDefinitions: null, random);
    }

    public GameInstance Join(
        string gameId,
        Player player,
        IReadOnlyDictionary<string, Card>? additionalCardDefinitions,
        Random? random = null)
    {
        var instance = GetRequired(gameId);

        lock (instance)
        {
            if (instance.State.Players.Count >= 2)
            {
                throw new InvalidOperationException($"Game instance '{gameId}' already has two players.");
            }

            if (additionalCardDefinitions is not null)
            {
                foreach (var (cardId, definition) in additionalCardDefinitions)
                {
                    if (!instance.State.CardDefinitions.ContainsKey(cardId))
                    {
                        instance.State.CardDefinitions[cardId] = definition;
                    }
                }
            }

            factory.JoinPlayer(instance, player, random);
            return instance;
        }
    }

    public GameInstance ResolvePrompt(
        string gameId,
        string requestedPlayerId,
        string selectedOption)
    {
        var instance = GetRequired(gameId);

        lock (instance)
        {
            var phaseBeforeResolve = instance.State.Phase;
            instance.ResolvePrompt(requestedPlayerId, selectedOption);

            if (ShouldAdvanceAfterPromptResolution(phaseBeforeResolve, instance.GetPendingPrompt()))
            {
                phaseService.AdvancePhase(instance);
            }

            instance.ValidateInvariants();
            return instance;
        }
    }

    private static bool ShouldAdvanceAfterPromptResolution(GamePhase phaseBeforeResolve, GamePrompt? nextPendingPrompt)
    {
        if (nextPendingPrompt is not null)
        {
            return false;
        }

        return phaseBeforeResolve is GamePhase.ChooseStartingPlayer or GamePhase.Mulligan;
    }

    public GameInstance AdvancePhase(string gameId)
    {
        var instance = GetRequired(gameId);

        lock (instance)
        {
            if (instance.GetPendingPrompt() is not null)
            {
                throw new InvalidOperationException("Cannot advance phase while a prompt is pending.");
            }

            phaseService.AdvancePhase(instance);
            instance.ValidateInvariants();
            return instance;
        }
    }

    public GameInstance DeclarePassInActionStep(string gameId, string playerId)
    {
        var instance = GetRequired(gameId);

        lock (instance)
        {
            phaseService.DeclarePassInActionStep(instance, playerId);
            instance.ValidateInvariants();
            return instance;
        }
    }

    public GameInstance DeclareActionInActionStep(string gameId, string playerId)
    {
        var instance = GetRequired(gameId);

        lock (instance)
        {
            phaseService.DeclareActionInActionStep(instance, playerId);
            instance.ValidateInvariants();
            return instance;
        }
    }

    public GameInstance ExecuteCardAction(
        string gameId,
        GameCardActionExecutionRequest request,
        IGameSequentialEffectExecutor sequentialEffectExecutor)
    {
        ArgumentNullException.ThrowIfNull(request);
        ArgumentNullException.ThrowIfNull(sequentialEffectExecutor);

        var instance = GetRequired(gameId);

        lock (instance)
        {
            if (instance.State.Phase != GamePhase.ActionStep)
            {
                throw new InvalidOperationException("Card actions can only be executed during ActionStep.");
            }

            if (!string.Equals(instance.State.PriorityPlayerId, request.PlayerId, StringComparison.Ordinal))
            {
                throw new InvalidOperationException("Only the priority player can execute card actions.");
            }

            if (instance.GetPendingPrompt() is not null)
            {
                throw new InvalidOperationException("Cannot execute card actions while a prompt is pending.");
            }

            if (string.IsNullOrWhiteSpace(request.ActionId))
            {
                throw new ArgumentException("ActionId is required.", nameof(request));
            }

            if (!request.ActionId.StartsWith("activate-support:", StringComparison.Ordinal))
            {
                throw new InvalidOperationException($"Card action '{request.ActionId}' is not supported yet.");
            }

            var actionCardInstanceId = request.ActionId["activate-support:".Length..].Trim();
            if (!string.Equals(actionCardInstanceId, request.SourceCardInstanceId, StringComparison.Ordinal))
            {
                throw new InvalidOperationException("ActionId source card does not match SourceCardInstanceId.");
            }

            var actingPlayer = instance.State.Players.FirstOrDefault(player =>
                string.Equals(player.PlayerId, request.PlayerId, StringComparison.Ordinal));
            if (actingPlayer is null)
            {
                throw new InvalidOperationException($"Player '{request.PlayerId}' was not found in game.");
            }

            var sourceCardInstance = actingPlayer.SupportZone.FirstOrDefault(card =>
                string.Equals(card.InstanceId, request.SourceCardInstanceId, StringComparison.Ordinal));
            if (sourceCardInstance is null)
            {
                throw new InvalidOperationException(
                    $"Support card instance '{request.SourceCardInstanceId}' was not found for player '{request.PlayerId}'.");
            }

            if (!instance.State.CardDefinitions.TryGetValue(sourceCardInstance.CardDefinitionId, out var sourceCardDefinition))
            {
                throw new InvalidOperationException(
                    $"Card definition '{sourceCardInstance.CardDefinitionId}' was not found.");
            }

            var arguments = request.Arguments is null
                ? new Dictionary<string, string>(StringComparer.Ordinal)
                : new Dictionary<string, string>(request.Arguments, StringComparer.Ordinal);

            var selectedTargets = request.SelectedTargets ?? [];

            var context = new GameCardEffectContext(
                game: instance,
                actingPlayer: new Player { Id = request.PlayerId },
                sourceCardDefinition: sourceCardDefinition,
                sourceCardInstance: sourceCardInstance,
                arguments: arguments,
                selectedTargets: selectedTargets);

            var executeResult = sequentialEffectExecutor.Execute(context);
            if (executeResult.IsError)
            {
                throw new InvalidOperationException(executeResult.FirstError.Description);
            }

            if (instance.State.Phase == GamePhase.ActionStep)
            {
                phaseService.DeclareActionInActionStep(instance, request.PlayerId);
            }

            instance.ValidateInvariants();
            return instance;
        }
    }

    public GameInstance DeclareEndStep(string gameId)
    {
        var instance = GetRequired(gameId);

        lock (instance)
        {
            phaseService.DeclareEndStep(instance);
            instance.ValidateInvariants();
            return instance;
        }
    }

    public GameInstance CompleteEndStep(string gameId)
    {
        var instance = GetRequired(gameId);

        lock (instance)
        {
            phaseService.CompleteEndStep(instance);
            instance.ValidateInvariants();
            return instance;
        }
    }

    private GameInstance GetRequired(string gameId)
    {
        if (string.IsNullOrWhiteSpace(gameId))
        {
            throw new InvalidOperationException("Game id is required.");
        }

        if (!instances.TryGetValue(gameId, out var instance) || instance is null)
        {
            throw new KeyNotFoundException($"Game instance '{gameId}' was not found.");
        }

        return instance;
    }

    private static string GenerateGameCode()
    {
        return string.Create(GameCodeLength, 0, static (buffer, _) =>
        {
            for (var index = 0; index < buffer.Length; index++)
            {
                buffer[index] = GameCodeAlphabet[RandomNumberGenerator.GetInt32(GameCodeAlphabet.Length)];
            }
        });
    }
}