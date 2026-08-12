namespace ProjectHiddenVillage.Server;

public sealed class GameInstance
{
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

        if (string.IsNullOrWhiteSpace(prompt.RequestedPlayerId))
        {
            throw new InvalidOperationException("Prompt RequestedPlayerId is required.");
        }

        if (!State.Players.Any(player => string.Equals(player.PlayerId, prompt.RequestedPlayerId, StringComparison.Ordinal)))
        {
            throw new InvalidOperationException(
                $"Prompt requested player '{prompt.RequestedPlayerId}' was not found in game players.");
        }

        if (prompt.Type == GamePromptType.ChooseStartingPlayer && prompt.Options.Count == 0)
        {
            throw new InvalidOperationException("ChooseStartingPlayer prompt requires at least one option.");
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

        if (prompt.Type == GamePromptType.ChooseStartingPlayer)
        {
            State.ActivePlayerId = selectedOption;
            var startingPlayer = State.Players.Single(player => string.Equals(player.PlayerId, selectedOption, StringComparison.Ordinal));
            startingPlayer.TurnCount++;
            PendingPrompts.Dequeue();
            AddActionLogEntry(
                actionType: "prompt_resolved",
                message: $"{requestedPlayerId} selected {selectedOption} as starting player.",
                playerId: requestedPlayerId,
                metadata: new Dictionary<string, string>(StringComparer.Ordinal)
                {
                    ["promptType"] = nameof(GamePromptType.ChooseStartingPlayer),
                    ["selectedPlayerId"] = selectedOption
                });

            AddActionLogEntry(
                actionType: "phase_started",
                message: $"{selectedOption} starts turn {State.TurnNumber} in {State.Phase}.",
                playerId: selectedOption,
                metadata: new Dictionary<string, string>(StringComparer.Ordinal)
                {
                    ["phase"] = State.Phase.ToString(),
                    ["turnNumber"] = State.TurnNumber.ToString(System.Globalization.CultureInfo.InvariantCulture)
                });

            ValidateInvariants();
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

            if (prompt.Type == GamePromptType.ChooseStartingPlayer)
            {
                if (prompt.Options.Count == 0)
                {
                    throw new InvalidOperationException("ChooseStartingPlayer prompt requires at least one option.");
                }

                if (State.Players.Count < 2)
                {
                    throw new InvalidOperationException(
                        "ChooseStartingPlayer prompt requires at least two players in the game.");
                }

                foreach (var option in prompt.Options)
                {
                    if (!playerIds.Contains(option))
                    {
                        throw new InvalidOperationException(
                            $"ChooseStartingPlayer option '{option}' was not found in game players.");
                    }
                }
            }
        }
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