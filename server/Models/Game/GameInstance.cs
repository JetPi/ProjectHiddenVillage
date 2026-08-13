namespace ProjectHiddenVillage.Server;

public sealed class GameInstance
{
    private static readonly IReadOnlyDictionary<GamePromptType, PromptTemplate> PromptTemplates =
        new Dictionary<GamePromptType, PromptTemplate>
        {
            [GamePromptType.ChooseStartingPlayer] = new(
                RequiresOptions: true,
                ResolveChooseStartingPlayerPrompt,
                ValidateChooseStartingPlayerPrompt),
            [GamePromptType.Mulligan] = new(
                RequiresOptions: true,
                ResolveMulliganPrompt,
                ValidateMulliganPrompt)
        };

    public GameInstance(GameState state, IEnumerable<GamePrompt>? pendingPrompts = null, DateTimeOffset? createdAtUtc = null)
    {
        State = state ?? throw new ArgumentNullException(nameof(state));
        CreatedAtUtc = createdAtUtc ?? DateTimeOffset.UtcNow;

        foreach (var prompt in pendingPrompts ?? [])
        {
            EnqueuePrompt(prompt);
        }

        ValidateInvariants();
    }

    public GameState State { get; }

    public DateTimeOffset CreatedAtUtc { get; }

    public string Id => State.GameId;

    public Queue<GamePrompt> PendingPrompts { get; } = new();

    public List<GameActionLogEntry> ActionLog { get; } = [];

    public GameActionLogEntry AddActionLogEntry(
        string actionType,
        string message,
        string? playerId = null,
        IReadOnlyDictionary<string, string>? metadata = null,
        DateTimeOffset? timestampUtc = null)
    {
        if (string.IsNullOrWhiteSpace(actionType))
        {
            throw new InvalidOperationException("ActionType is required.");
        }

        if (string.IsNullOrWhiteSpace(message))
        {
            throw new InvalidOperationException("Message is required.");
        }

        var resolvedPlayerId = playerId ?? string.Empty;

        if (!string.IsNullOrWhiteSpace(resolvedPlayerId)
            && !State.Players.Any(player => string.Equals(player.PlayerId, resolvedPlayerId, StringComparison.Ordinal)))
        {
            throw new InvalidOperationException(
                $"Log player '{resolvedPlayerId}' was not found in game players.");
        }

        var entry = new GameActionLogEntry
        {
            ActionType = actionType,
            Message = message,
            PlayerId = resolvedPlayerId,
            TimestampUtc = timestampUtc ?? DateTimeOffset.UtcNow,
            Metadata = metadata is null
                ? []
                : new Dictionary<string, string>(metadata, StringComparer.Ordinal)
        };

        ActionLog.Add(entry);
        return entry;
    }

    public void EnqueuePrompt(GamePrompt prompt)
    {
        ArgumentNullException.ThrowIfNull(prompt);

        if (!PromptTemplates.TryGetValue(prompt.Type, out var promptTemplate))
        {
            throw new InvalidOperationException($"Unsupported prompt type '{prompt.Type}'.");
        }

        if (string.IsNullOrWhiteSpace(prompt.RequestedPlayerId))
        {
            throw new InvalidOperationException("Prompt RequestedPlayerId is required.");
        }

        if (!State.Players.Any(player => string.Equals(player.PlayerId, prompt.RequestedPlayerId, StringComparison.Ordinal)))
        {
            throw new InvalidOperationException(
                $"Prompt requested player '{prompt.RequestedPlayerId}' was not found in game players.");
        }

        if (promptTemplate.RequiresOptions && prompt.Options.Count == 0)
        {
            throw new InvalidOperationException($"{prompt.Type} prompt requires at least one option.");
        }

        PendingPrompts.Enqueue(prompt);
    }

    public GamePrompt? GetPendingPrompt()
    {
        return PendingPrompts.Count > 0 ? PendingPrompts.Peek() : null;
    }

    public void ResolvePrompt(string requestedPlayerId, string selectedOption)
    {
        if (PendingPrompts.Count == 0)
        {
            throw new InvalidOperationException("There are no pending prompts to resolve.");
        }

        var prompt = PendingPrompts.Peek();

        if (!string.Equals(prompt.RequestedPlayerId, requestedPlayerId, StringComparison.Ordinal))
        {
            throw new InvalidOperationException("Only the requested player can resolve this prompt.");
        }

        if (!prompt.Options.Contains(selectedOption, StringComparer.Ordinal))
        {
            throw new InvalidOperationException("Selected option is not valid for this prompt.");
        }

        if (PromptTemplates.TryGetValue(prompt.Type, out var promptTemplate))
        {
            promptTemplate.Resolve(this, requestedPlayerId, selectedOption);
            return;
        }

        throw new InvalidOperationException($"Unsupported prompt type '{prompt.Type}'.");
    }

    public void ValidateInvariants()
    {
        if (string.IsNullOrWhiteSpace(State.GameId))
        {
            throw new InvalidOperationException("GameId is required.");
        }

        if (State.TurnNumber < 1)
        {
            throw new InvalidOperationException("TurnNumber must be at least 1.");
        }

        var playerIds = new HashSet<string>(StringComparer.Ordinal);

        foreach (var player in State.Players)
        {
            if (string.IsNullOrWhiteSpace(player.PlayerId))
            {
                throw new InvalidOperationException("Each player must have a non-empty PlayerId.");
            }

            if (!playerIds.Add(player.PlayerId))
            {
                throw new InvalidOperationException($"Duplicate player id '{player.PlayerId}' found.");
            }

            if (player.ResourcePool < 0)
            {
                throw new InvalidOperationException($"Player '{player.PlayerId}' has a negative resource pool.");
            }

            if (player.TurnCount < 0)
            {
                throw new InvalidOperationException($"Player '{player.PlayerId}' has a negative turn count.");
            }
        }

        foreach (var player in State.Players)
        {
            ValidatePlayerCardInstances(player, playerIds);
        }

        var hasPendingStartingPlayerPrompt = PendingPrompts.Any(prompt => prompt.Type == GamePromptType.ChooseStartingPlayer);

        if (State.Players.Count < 2)
        {
            if (!string.IsNullOrWhiteSpace(State.ActivePlayerId))
            {
                throw new InvalidOperationException("ActivePlayerId cannot be set before at least two players join.");
            }

            if (!string.IsNullOrWhiteSpace(State.PriorityPlayerId))
            {
                throw new InvalidOperationException("PriorityPlayerId cannot be set before at least two players join.");
            }

            if (hasPendingStartingPlayerPrompt)
            {
                throw new InvalidOperationException(
                    "ChooseStartingPlayer prompt cannot exist before at least two players join.");
            }
        }
        else if (string.IsNullOrWhiteSpace(State.ActivePlayerId))
        {
            if (State.Phase == GamePhase.ActionStep)
            {
                throw new InvalidOperationException(
                    "ActivePlayerId must be set before ActionStep can be entered.");
            }

            if (!hasPendingStartingPlayerPrompt && State.TurnNumber > 1)
            {
                throw new InvalidOperationException(
                    "ActivePlayerId must be set once the game has moved past setup.");
            }
        }
        else if (!playerIds.Contains(State.ActivePlayerId))
        {
            throw new InvalidOperationException("ActivePlayerId must reference an existing player.");
        }

        if (!string.IsNullOrEmpty(State.PriorityPlayerId) && !playerIds.Contains(State.PriorityPlayerId))
        {
            throw new InvalidOperationException("PriorityPlayerId must reference an existing player when set.");
        }

        if (State.Phase == GamePhase.ActionStep && string.IsNullOrEmpty(State.PriorityPlayerId))
        {
            throw new InvalidOperationException("PriorityPlayerId must be set during ActionStep.");
        }

        foreach (var stackCard in State.EffectResolutionStack)
        {
            ValidateCardInstance(stackCard, playerIds);
        }

        foreach (var entry in ActionLog)
        {
            ValidateActionLogEntry(entry, playerIds);
        }

        ValidatePendingPrompts(playerIds);
    }

    private static void ValidateActionLogEntry(GameActionLogEntry entry, HashSet<string> playerIds)
    {
        if (entry is null)
        {
            throw new InvalidOperationException("Action log entries cannot be null.");
        }

        if (string.IsNullOrWhiteSpace(entry.EntryId))
        {
            throw new InvalidOperationException("Action log entries must have a non-empty EntryId.");
        }

        if (string.IsNullOrWhiteSpace(entry.ActionType))
        {
            throw new InvalidOperationException("Action log entries must have a non-empty ActionType.");
        }

        if (string.IsNullOrWhiteSpace(entry.Message))
        {
            throw new InvalidOperationException("Action log entries must have a non-empty Message.");
        }

        if (!string.IsNullOrWhiteSpace(entry.PlayerId) && !playerIds.Contains(entry.PlayerId))
        {
            throw new InvalidOperationException(
                $"Action log entry references unknown player '{entry.PlayerId}'.");
        }
    }

    private void ValidatePendingPrompts(HashSet<string> playerIds)
    {
        foreach (var prompt in PendingPrompts)
        {
            if (string.IsNullOrWhiteSpace(prompt.PromptId))
            {
                throw new InvalidOperationException("Pending prompts must have a non-empty PromptId.");
            }

            if (!playerIds.Contains(prompt.RequestedPlayerId))
            {
                throw new InvalidOperationException(
                    $"Pending prompt requested player '{prompt.RequestedPlayerId}' was not found in game players.");
            }

            if (PromptTemplates.TryGetValue(prompt.Type, out var promptTemplate))
            {
                promptTemplate.Validate(this, prompt, playerIds);
                continue;
            }

            throw new InvalidOperationException($"Unsupported prompt type '{prompt.Type}'.");
        }
    }

    private static void ResolveChooseStartingPlayerPrompt(GameInstance instance, string requestedPlayerId, string selectedOption)
    {
        var startingPlayerId = ResolveStartingPlayerFromPromptOption(instance.State, requestedPlayerId, selectedOption);
        instance.State.ActivePlayerId = startingPlayerId;

        var startingPlayer = instance.State.Players.Single(player => string.Equals(player.PlayerId, startingPlayerId, StringComparison.Ordinal));
        startingPlayer.TurnCount++;

        instance.PendingPrompts.Dequeue();

        LogAction(
            instance,
            actionType: "prompt_resolved",
            playerId: requestedPlayerId,
            promptType: GamePromptType.ChooseStartingPlayer,
            selectedOption: selectedOption,
            selectedPlayerId: startingPlayerId);

        LogAction(
            instance,
            actionType: "phase_started",
            playerId: startingPlayerId);

        instance.ValidateInvariants();
    }

    private static void ValidateChooseStartingPlayerPrompt(GameInstance instance, GamePrompt prompt, HashSet<string> _)
    {
        if (prompt.Options.Count == 0)
        {
            throw new InvalidOperationException("ChooseStartingPlayer prompt requires at least one option.");
        }

        if (instance.State.Players.Count < 2)
        {
            throw new InvalidOperationException(
                "ChooseStartingPlayer prompt requires at least two players in the game.");
        }

        var validOptions = new HashSet<string>(StringComparer.Ordinal) { "goFirst", "goSecond" };

        foreach (var option in prompt.Options)
        {
            if (!validOptions.Contains(option))
            {
                throw new InvalidOperationException(
                    $"ChooseStartingPlayer option '{option}' is not supported.");
            }
        }
    }

    private static string ResolveStartingPlayerFromPromptOption(GameState state, string requestedPlayerId, string selectedOption)
    {
        if (string.Equals(selectedOption, "goFirst", StringComparison.Ordinal))
        {
            return requestedPlayerId;
        }

        if (string.Equals(selectedOption, "goSecond", StringComparison.Ordinal))
        {
            var requestedIndex = state.Players.FindIndex(player =>
                string.Equals(player.PlayerId, requestedPlayerId, StringComparison.Ordinal));

            if (requestedIndex < 0)
            {
                throw new InvalidOperationException(
                    $"Requested player '{requestedPlayerId}' was not found in turn order.");
            }

            var nextIndex = (requestedIndex + 1) % state.Players.Count;
            return state.Players[nextIndex].PlayerId;
        }

        throw new InvalidOperationException("Selected option is not valid for this prompt.");
    }

    private static void ResolveMulliganPrompt(GameInstance instance, string requestedPlayerId, string selectedOption)
    {
        var player = instance.State.Players.SingleOrDefault(entry =>
            string.Equals(entry.PlayerId, requestedPlayerId, StringComparison.Ordinal));

        if (player is null)
        {
            throw new InvalidOperationException(
                $"Requested player '{requestedPlayerId}' was not found in game players.");
        }

        if (string.Equals(selectedOption, "mulligan", StringComparison.Ordinal))
        {
            var returnedCards = player.Hand.ToList();
            player.Hand.Clear();
            player.Deck.AddRange(returnedCards);
            GameDeckShuffle.Shuffle(player.Deck);

            var drawCount = Math.Min(5, player.Deck.Count);
            if (drawCount > 0)
            {
                var redrawnCards = player.Deck.Take(drawCount).ToList();
                player.Deck.RemoveRange(0, drawCount);
                player.Hand.AddRange(redrawnCards);
            }
        }

        instance.PendingPrompts.Dequeue();
        LogAction(
            instance,
            actionType: "prompt_resolved",
            playerId: requestedPlayerId,
            promptType: GamePromptType.Mulligan,
            selectedOption: selectedOption);

        instance.ValidateInvariants();
    }

    private static void ValidateMulliganPrompt(GameInstance _, GamePrompt prompt, HashSet<string> __)
    {
        if (prompt.Options.Count == 0)
        {
            throw new InvalidOperationException("Mulligan prompt requires at least one option.");
        }

        var validOptions = new HashSet<string>(StringComparer.Ordinal) { "mulligan", "noMulligan" };

        foreach (var option in prompt.Options)
        {
            if (!validOptions.Contains(option))
            {
                throw new InvalidOperationException(
                    $"Mulligan option '{option}' is not supported.");
            }
        }
    }

    private sealed record PromptTemplate(
        bool RequiresOptions,
        Action<GameInstance, string, string> Resolve,
        Action<GameInstance, GamePrompt, HashSet<string>> Validate);

    private static void LogAction(
        GameInstance instance,
        string actionType,
        string? playerId = null,
        GamePromptType? promptType = null,
        string? selectedOption = null,
        string? selectedPlayerId = null)
    {
        var message = actionType switch
        {
            "prompt_resolved" => BuildPromptResolvedMessage(
                promptType ?? throw new InvalidOperationException("Prompt type is required."),
                playerId ?? throw new InvalidOperationException("Player id is required for prompt resolution."),
                selectedOption ?? throw new InvalidOperationException("Selected option is required for prompt resolution."),
                selectedPlayerId),
            "phase_started" => $"{playerId} starts turn {instance.State.TurnNumber} in {instance.State.Phase}.",
            _ => throw new InvalidOperationException($"Unsupported action log type '{actionType}'.")
        };

        var metadata = actionType switch
        {
            "prompt_resolved" => BuildPromptResolvedMetadata(
                promptType ?? throw new InvalidOperationException("Prompt type is required."),
                selectedOption ?? throw new InvalidOperationException("Selected option is required for prompt resolution."),
                selectedPlayerId),
            "phase_started" => CreateMetadata(
                ("phase", instance.State.Phase.ToString()),
                ("turnNumber", ToInvariant(instance.State.TurnNumber))),
            _ => throw new InvalidOperationException($"Unsupported action log type '{actionType}'.")
        };

        instance.AddActionLogEntry(actionType, message, playerId, metadata);
    }

    private static string BuildPromptResolvedMessage(
        GamePromptType promptType,
        string requestedPlayerId,
        string selectedOption,
        string? selectedPlayerId)
    {
        return promptType switch
        {
            GamePromptType.ChooseStartingPlayer =>
                $"{requestedPlayerId} selected {selectedOption} and {selectedPlayerId ?? throw new InvalidOperationException("Selected player id is required.")} will start.",
            GamePromptType.Mulligan =>
                $"{requestedPlayerId} selected {selectedOption} for mulligan.",
            _ => throw new InvalidOperationException($"Unsupported prompt type '{promptType}'.")
        };
    }

    private static IReadOnlyDictionary<string, string> BuildPromptResolvedMetadata(
        GamePromptType promptType,
        string selectedOption,
        string? selectedPlayerId)
    {
        if (promptType == GamePromptType.ChooseStartingPlayer)
        {
            return CreateMetadata(
                ("promptType", nameof(GamePromptType.ChooseStartingPlayer)),
                ("selectedOption", selectedOption),
                ("selectedPlayerId", selectedPlayerId ?? throw new InvalidOperationException("Selected player id is required.")));
        }

        if (promptType == GamePromptType.Mulligan)
        {
            return CreateMetadata(
                ("promptType", nameof(GamePromptType.Mulligan)),
                ("selectedOption", selectedOption));
        }

        throw new InvalidOperationException($"Unsupported prompt type '{promptType}'.");
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

    private void ValidatePlayerCardInstances(PlayerState player, HashSet<string> playerIds)
    {
        ValidateLeaderCardInstance(player, playerIds);

        foreach (var card in player.Deck)
        {
            ValidateCardInstance(card, playerIds);
        }

        foreach (var card in player.Hand)
        {
            ValidateCardInstance(card, playerIds);
        }

        foreach (var card in player.Battlefield)
        {
            ValidateCardInstance(card, playerIds);
        }

        foreach (var card in player.DiscardPile)
        {
            ValidateCardInstance(card, playerIds);
        }

        foreach (var card in player.SupportZone)
        {
            ValidateCardInstance(card, playerIds);
        }

        foreach (var card in player.ExileZone)
        {
            ValidateCardInstance(card, playerIds);
        }
    }

    private void ValidateLeaderCardInstance(PlayerState player, HashSet<string> playerIds)
    {
        var leader = player.LeaderCardInstance;
        if (leader is null)
        {
            return;
        }

        if (string.IsNullOrWhiteSpace(leader.InstanceId))
        {
            throw new InvalidOperationException($"Player '{player.PlayerId}' has a leader card with an empty InstanceId.");
        }

        if (string.IsNullOrWhiteSpace(leader.CardDefinitionId))
        {
            throw new InvalidOperationException($"Player '{player.PlayerId}' has a leader card with an empty CardDefinitionId.");
        }

        if (!State.CardDefinitions.TryGetValue(leader.CardDefinitionId, out var leaderDefinition))
        {
            throw new InvalidOperationException(
                $"Leader card definition '{leader.CardDefinitionId}' was not found for player '{player.PlayerId}'.");
        }

        if (leaderDefinition.Type != CardType.Leader)
        {
            throw new InvalidOperationException(
                $"Leader card definition '{leader.CardDefinitionId}' for player '{player.PlayerId}' is not a leader card.");
        }

        if (!playerIds.Contains(leader.OwnerPlayerId))
        {
            throw new InvalidOperationException(
                $"Leader card '{leader.InstanceId}' has unknown owner '{leader.OwnerPlayerId}'.");
        }

        if (!playerIds.Contains(leader.ControllerPlayerId))
        {
            throw new InvalidOperationException(
                $"Leader card '{leader.InstanceId}' has unknown controller '{leader.ControllerPlayerId}'.");
        }

        if (leader.TotalLife < 0)
        {
            throw new InvalidOperationException(
                $"Leader card '{leader.InstanceId}' has invalid TotalLife '{leader.TotalLife}'.");
        }

        if (leader.CurrentLife < 0 || leader.CurrentLife > leader.TotalLife)
        {
            throw new InvalidOperationException(
                $"Leader card '{leader.InstanceId}' has invalid CurrentLife '{leader.CurrentLife}'.");
        }
    }

    private void ValidateCardInstance(CardInstance instance, HashSet<string> playerIds)
    {
        if (instance is null)
        {
            throw new InvalidOperationException("Card instance entries cannot be null.");
        }

        if (string.IsNullOrWhiteSpace(instance.InstanceId))
        {
            throw new InvalidOperationException("Card instances must have a non-empty InstanceId.");
        }

        if (string.IsNullOrWhiteSpace(instance.CardDefinitionId))
        {
            throw new InvalidOperationException($"Card instance '{instance.InstanceId}' is missing CardDefinitionId.");
        }

        if (!State.CardDefinitions.ContainsKey(instance.CardDefinitionId))
        {
            throw new InvalidOperationException(
                $"Card definition '{instance.CardDefinitionId}' was not found for instance '{instance.InstanceId}'.");
        }

        if (!playerIds.Contains(instance.OwnerPlayerId))
        {
            throw new InvalidOperationException(
                $"Card instance '{instance.InstanceId}' has unknown owner '{instance.OwnerPlayerId}'.");
        }

        if (!playerIds.Contains(instance.ControllerPlayerId))
        {
            throw new InvalidOperationException(
                $"Card instance '{instance.InstanceId}' has unknown controller '{instance.ControllerPlayerId}'.");
        }
    }
}