namespace ProjectHiddenVillage.Server;

public sealed class GameInstanceFactory
{
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

        var playerStates = players.Select(BuildPlayerState).ToList();

        var state = new GameState
        {
            GameId = Guid.NewGuid().ToString("N"),
            TurnNumber = 1,
            Phase = GamePhase.StartOfMainPhase,
            ActivePlayerId = string.Empty,
            PriorityPlayerId = string.Empty,
            ConsecutivePasses = 0,
            PhaseDirectives = new Queue<PhaseDirective>(),
            CardDefinitions = new Dictionary<string, Card>(cardDefinitions, StringComparer.Ordinal),
            Players = playerStates,
            Stack = []
        };

        var instance = new GameInstance(state);
        instance.AddActionLogEntry(
            actionType: "game_created",
            message: $"Game created with {state.Players.Count} player(s).",
            metadata: new Dictionary<string, string>(StringComparer.Ordinal)
            {
                ["playerCount"] = state.Players.Count.ToString(System.Globalization.CultureInfo.InvariantCulture),
                ["phase"] = state.Phase.ToString(),
                ["turnNumber"] = state.TurnNumber.ToString(System.Globalization.CultureInfo.InvariantCulture)
            });

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

        instance.State.Players.Add(BuildPlayerState(player));
        instance.AddActionLogEntry(
            actionType: "player_joined",
            message: $"{player.Id} joined the game.",
            playerId: player.Id,
            metadata: new Dictionary<string, string>(StringComparer.Ordinal)
            {
                ["playerCount"] = instance.State.Players.Count.ToString(System.Globalization.CultureInfo.InvariantCulture)
            });

        EnsureStartingPlayerPrompt(instance, random);
        instance.ValidateInvariants();
    }

    private static void EnsureStartingPlayerPrompt(GameInstance instance, Random? random)
    {
        if (instance.State.Players.Count < 2)
        {
            return;
        }

        if (!string.IsNullOrWhiteSpace(instance.State.ActivePlayerId))
        {
            return;
        }

        var hasStartingPrompt = instance.PendingPrompts.Any(prompt => prompt.Type == GamePromptType.ChooseStartingPlayer);

        if (hasStartingPrompt)
        {
            return;
        }

        var turnRng = random ?? Random.Shared;
        var chooser = instance.State.Players[turnRng.Next(instance.State.Players.Count)].PlayerId;

        var startPrompt = new GamePrompt
        {
            Type = GamePromptType.ChooseStartingPlayer,
            RequestedPlayerId = chooser,
            Options = instance.State.Players.Select(player => player.PlayerId).ToList()
        };

        instance.EnqueuePrompt(startPrompt);
        instance.AddActionLogEntry(
            actionType: "prompt_created",
            message: $"Starting player selection prompt created for {chooser}.",
            playerId: chooser,
            metadata: new Dictionary<string, string>(StringComparer.Ordinal)
            {
                ["promptType"] = nameof(GamePromptType.ChooseStartingPlayer),
                ["options"] = string.Join(",", startPrompt.Options)
            });

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

    private static PlayerState BuildPlayerState(Player player)
    {
        var deckInstances = player.Deck.Select(cardDefinitionId => new CardInstance
        {
            InstanceId = Guid.NewGuid().ToString("N"),
            CardDefinitionId = cardDefinitionId,
            OwnerPlayerId = player.Id,
            ControllerPlayerId = player.Id,
            IsExhausted = false
        }).ToList();

        return new PlayerState
        {
            PlayerId = player.Id,
            ResourcePool = 0,
            Deck = deckInstances,
            Hand = [],
            Battlefield = [],
            DiscardPile = []
        };
    }
}