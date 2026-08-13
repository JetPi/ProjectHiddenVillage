using ProjectHiddenVillage.Server.Api.Interfaces.Game;
using ProjectHiddenVillage.Server.Api.Services.Games;

namespace ProjectHiddenVillage.Server;

public sealed class GameInstanceFactory
{
    private readonly IGameRuntimeDeckService gameRuntimeDeckService;

    public GameInstanceFactory()
        : this(new GameRuntimeDeckService(new GameEffectHandlingService()))
    {
    }

    public GameInstanceFactory(IGameRuntimeDeckService gameRuntimeDeckService)
    {
        this.gameRuntimeDeckService = gameRuntimeDeckService;
    }

    public GameInstance Create(
        IReadOnlyList<Player> players,
        IReadOnlyDictionary<string, Card> cardDefinitions,
        Random? random = null)
    {
        ArgumentNullException.ThrowIfNull(players);
        ArgumentNullException.ThrowIfNull(cardDefinitions);

        var knownPlayerIds = new HashSet<string>(StringComparer.Ordinal);

        foreach (var player in players)
        {
            ValidateJoinablePlayer(player, knownPlayerIds, cardDefinitions);
        }

        var playerStates = players.Select(player => BuildPlayerState(player, cardDefinitions)).ToList();

        var state = new GameState
        {
            GameId = Guid.NewGuid().ToString("N"),
            TurnNumber = 1,
            Phase = GamePhase.ChooseStartingPlayer,
            ActivePlayerId = string.Empty,
            PriorityPlayerId = string.Empty,
            ConsecutivePasses = 0,
            PhaseDirectives = new Queue<PhaseDirective>(),
            CardDefinitions = new Dictionary<string, Card>(cardDefinitions, StringComparer.Ordinal),
            Players = playerStates,
            EffectResolutionStack = []
        };

        var instance = new GameInstance(state);
        LogAction(
            instance,
            actionType: "game_created");

        EnsureStartingPlayerPrompt(instance, random);
        return instance;
    }

    public void JoinPlayer(GameInstance instance, Player player, Random? random = null)
    {
        ArgumentNullException.ThrowIfNull(instance);
        ArgumentNullException.ThrowIfNull(player);

        var knownPlayerIds = new HashSet<string>(
            instance.State.Players.Select(existing => existing.PlayerId),
            StringComparer.Ordinal);

        ValidateJoinablePlayer(player, knownPlayerIds, instance.State.CardDefinitions);

        instance.State.Players.Add(BuildPlayerState(player, instance.State.CardDefinitions));
        LogAction(
            instance,
            actionType: "player_joined",
            playerId: player.Id);

        EnsureStartingPlayerPrompt(instance, random);
        instance.ValidateInvariants();
    }

    private static void EnsureStartingPlayerPrompt(GameInstance instance, Random? random)
    {
        if (instance.State.Players.Count < 2)
        {
            return;
        }

        if (!string.IsNullOrWhiteSpace(instance.State.ActivePlayerId)
            || instance.PendingPrompts.Any(prompt => prompt.Type == GamePromptType.ChooseStartingPlayer))
        {
            return;
        }

        var turnRng = random ?? Random.Shared;
        var requestedPlayerId = instance.State.Players[turnRng.Next(instance.State.Players.Count)].PlayerId;
        instance.State.ActivePlayerId = requestedPlayerId;

        LogAction(
            instance,
            actionType: "starting_player_assigned",
            playerId: requestedPlayerId);

        instance.EnqueuePrompt(new GamePrompt
        {
            RequestedPlayerId = requestedPlayerId,
            Type = GamePromptType.ChooseStartingPlayer,
            Options = ["goFirst", "goSecond"]
        });

        LogAction(
            instance,
            actionType: "starting_player_prompted",
            playerId: requestedPlayerId);

        instance.ValidateInvariants();
    }

    private static void ValidateJoinablePlayer(
        Player player,
        HashSet<string> knownPlayerIds,
        IReadOnlyDictionary<string, Card> cardDefinitions)
    {
        if (string.IsNullOrWhiteSpace(player.Id))
        {
            throw new InvalidOperationException("Each player must have a non-empty id.");
        }

        if (!knownPlayerIds.Add(player.Id))
        {
            throw new InvalidOperationException($"Duplicate player id '{player.Id}' found while creating game.");
        }

        foreach (var deckCardId in player.Deck)
        {
            if (!cardDefinitions.ContainsKey(deckCardId))
            {
                throw new InvalidOperationException(
                    $"Card definition '{deckCardId}' in player '{player.Id}' deck was not found.");
            }
        }
    }

    private PlayerState BuildPlayerState(Player player, IReadOnlyDictionary<string, Card> cardDefinitions)
    {
        var deckInstances = gameRuntimeDeckService.ToRuntimeDeck(player.Deck, cardDefinitions, player.Id);

        var leaderCardInstance = BuildLeaderCardInstance(player.Deck, cardDefinitions, player.Id);

        return new PlayerState
        {
            PlayerId = player.Id,
            TurnCount = 0,
            ResourcePool = 0,
            LeaderCardInstance = leaderCardInstance,
            Deck = deckInstances,
            Hand = [],
            Battlefield = [],
            DiscardPile = []
        };
    }

    private static LeaderCardInstanceState? BuildLeaderCardInstance(
        IReadOnlyList<string> cardDefinitionIds,
        IReadOnlyDictionary<string, Card> cardDefinitions,
        string playerId)
    {
        var leaderCardDefinitionId = cardDefinitionIds.FirstOrDefault(cardDefinitionId =>
            cardDefinitions.TryGetValue(cardDefinitionId, out var definition)
            && definition.Type == CardType.Leader);

        if (string.IsNullOrWhiteSpace(leaderCardDefinitionId))
        {
            return null;
        }

        if (!cardDefinitions.TryGetValue(leaderCardDefinitionId, out var leaderDefinition))
        {
            return null;
        }

        var totalLife = leaderDefinition is LeaderCard typedLeader
            ? typedLeader.Life
            : 0;

        var recoveryEffect = leaderDefinition is LeaderCard withRecovery
            ? withRecovery.RecoveryEffect
            : string.Empty;

        return new LeaderCardInstanceState
        {
            InstanceId = Guid.NewGuid().ToString("N"),
            CardDefinitionId = leaderCardDefinitionId,
            OwnerPlayerId = playerId,
            ControllerPlayerId = playerId,
            Name = ResolveLeaderName(leaderDefinition),
            Color = leaderDefinition.Color,
            Description = leaderDefinition.Description,
            Traits = [.. leaderDefinition.Traits],
            Damage = leaderDefinition.Damage,
            Power = leaderDefinition.Power,
            RecoveryEffect = recoveryEffect,
            TotalLife = totalLife,
            CurrentLife = totalLife
        };
    }

    private static string ResolveLeaderName(Card card)
    {
        if (!string.IsNullOrWhiteSpace(card.DisplayName))
        {
            return card.DisplayName;
        }

        var fallbackName = card.Name.FirstOrDefault(name => !string.IsNullOrWhiteSpace(name));
        if (!string.IsNullOrWhiteSpace(fallbackName))
        {
            return fallbackName;
        }

        return card.Id;
    }

    private static void LogAction(
        GameInstance instance,
        string actionType,
        string? playerId = null)
    {
        var message = actionType switch
        {
            "game_created" => $"Game created with {instance.State.Players.Count} player(s).",
            "player_joined" => $"{playerId} joined the game.",
            "starting_player_assigned" => $"Starting player candidate auto-assigned to {playerId}.",
            "starting_player_prompted" => $"{playerId} must choose who starts.",
            _ => throw new InvalidOperationException($"Unsupported action log type '{actionType}'.")
        };

        var metadata = actionType switch
        {
            "game_created" => CreateMetadata(
                ("playerCount", ToInvariant(instance.State.Players.Count)),
                ("phase", instance.State.Phase.ToString()),
                ("turnNumber", ToInvariant(instance.State.TurnNumber))),
            "player_joined" => CreateMetadata(
                ("playerCount", ToInvariant(instance.State.Players.Count))),
            "starting_player_assigned" => CreateMetadata(
                ("assignmentType", "candidate"),
                ("playerCount", ToInvariant(instance.State.Players.Count))),
            "starting_player_prompted" => CreateMetadata(
                ("promptType", nameof(GamePromptType.ChooseStartingPlayer)),
                ("playerCount", ToInvariant(instance.State.Players.Count))),
            _ => throw new InvalidOperationException($"Unsupported action log type '{actionType}'.")
        };

        instance.AddActionLogEntry(actionType, message, playerId, metadata);
    }

    private static IReadOnlyDictionary<string, string> CreateMetadata(params (string Key, string Value)[] entries)
    {
        var map = new Dictionary<string, string>(StringComparer.Ordinal);

        foreach (var (key, value) in entries)
        {
            map[key] = value;
        }

        return map;
    }

    private static string ToInvariant(int value)
    {
        return value.ToString(System.Globalization.CultureInfo.InvariantCulture);
    }
}