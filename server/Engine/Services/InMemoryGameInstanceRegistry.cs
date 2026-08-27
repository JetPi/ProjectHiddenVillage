using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text.RegularExpressions;
using ProjectHiddenVillage.Server.Api.Interfaces.Game;
using ProjectHiddenVillage.Server.Api.Services.Games;

namespace ProjectHiddenVillage.Server;

public sealed class InMemoryGameInstanceRegistry
{
    private const int GameCodeLength = 5;
    private const string GameCodeAlphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    private const string ActivateSupportActionPrefix = "activate-support:";
    private const string SummonToFieldActionPrefix = "summon-to-field:";
    private const string SetSupportActionPrefix = "set-support:";
    private const string LeaderEffectActionPrefix = "leader-effect:";
    private const string SupportSlotIndexArgumentKey = "supportSlotIndex";
    private const string FallbackEffectKeyArgument = "__leaderEffectKey";
    private const int MaxSupportSlots = 5;
    private static readonly Regex GameCodePattern = new("^[A-Za-z0-9]{5}$", RegexOptions.Compiled | RegexOptions.CultureInvariant);

    private readonly ConcurrentDictionary<string, GameInstance> instances =
        new(StringComparer.Ordinal);

    private readonly GameInstanceFactory factory;
    private readonly global::ProjectHiddenVillage.Server.Engine.GamePhaseService phaseService;
    private readonly IGameRuntimeDeckService runtimeDeckService;

    public InMemoryGameInstanceRegistry(GameInstanceFactory factory, global::ProjectHiddenVillage.Server.Engine.GamePhaseService phaseService)
    {
        this.factory = factory;
        this.phaseService = phaseService;
        runtimeDeckService = new Api.Services.Games.GameRuntimeDeckService(new GameEffectHandlingService());
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
            if (instance.GetPendingPrompt() is not null)
            {
                throw new InvalidOperationException("Cannot execute card actions while a prompt is pending.");
            }

            if (string.IsNullOrWhiteSpace(request.ActionId))
            {
                throw new ArgumentException("ActionId is required.", nameof(request));
            }

            var actionPrefix = ResolveActionPrefix(request.ActionId);
            if (actionPrefix is null)
            {
                throw new InvalidOperationException($"Card action '{request.ActionId}' is not supported yet.");
            }

            ValidateCardActionWindow(instance, request.PlayerId, actionPrefix);

            var actionCardInstanceId = ResolveActionSourceCardInstanceId(request.ActionId, actionPrefix);
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

            var arguments = request.Arguments is null
                ? new Dictionary<string, string>(StringComparer.Ordinal)
                : new Dictionary<string, string>(request.Arguments, StringComparer.Ordinal);

            switch (actionPrefix)
            {
                case ActivateSupportActionPrefix:
                    ExecuteActivateSupportAction(instance, request.PlayerId, request, sequentialEffectExecutor, actingPlayer, arguments);
                    break;
                case SummonToFieldActionPrefix:
                    ExecuteSummonToFieldAction(instance, request.PlayerId, request.SourceCardInstanceId, actingPlayer);
                    break;
                case SetSupportActionPrefix:
                    ExecuteSetSupportAction(instance, request.PlayerId, request.SourceCardInstanceId, actingPlayer, arguments);
                    break;
                case LeaderEffectActionPrefix:
                    ExecuteLeaderEffectAction(instance, request.PlayerId, request, sequentialEffectExecutor, actingPlayer, arguments);
                    break;
                default:
                    throw new InvalidOperationException($"Card action '{request.ActionId}' is not supported yet.");
            }

            if (instance.State.Phase == GamePhase.ActionStep)
            {
                phaseService.DeclareActionInActionStep(instance, request.PlayerId);
            }

            instance.ValidateInvariants();
            return instance;
        }
    }

    public GameCardActionTargetsResponse GetCardActionTargets(
        string gameId,
        GameCardActionTargetsRequest request,
        IGameEffectCanExecuteEvaluator canExecuteEvaluator)
    {
        ArgumentNullException.ThrowIfNull(request);
        ArgumentNullException.ThrowIfNull(canExecuteEvaluator);

        var instance = GetRequired(gameId);

        lock (instance)
        {
            if (instance.GetPendingPrompt() is not null)
            {
                throw new InvalidOperationException("Cannot fetch card action targets while a prompt is pending.");
            }

            if (string.IsNullOrWhiteSpace(request.ActionId))
            {
                throw new ArgumentException("ActionId is required.", nameof(request));
            }

            var actionPrefix = ResolveActionPrefix(request.ActionId);
            if (actionPrefix is null)
            {
                throw new InvalidOperationException($"Card action '{request.ActionId}' is not supported yet.");
            }

            ValidateCardActionWindow(instance, request.PlayerId, actionPrefix);

            var actionCardInstanceId = ResolveActionSourceCardInstanceId(request.ActionId, actionPrefix);
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

            var arguments = request.Arguments is null
                ? new Dictionary<string, string>(StringComparer.Ordinal)
                : new Dictionary<string, string>(request.Arguments, StringComparer.Ordinal);

            return actionPrefix switch
            {
                ActivateSupportActionPrefix => BuildSupportCardActionTargets(
                    instance,
                    request.ActionId,
                    request.SourceCardInstanceId,
                    request.PlayerId,
                    actingPlayer,
                    arguments,
                    canExecuteEvaluator),
                LeaderEffectActionPrefix => BuildLeaderCardActionTargets(
                    instance,
                    request.ActionId,
                    request.SourceCardInstanceId,
                    request.PlayerId,
                    actingPlayer,
                    arguments,
                    canExecuteEvaluator),
                _ => new GameCardActionTargetsResponse(
                    ActionId: request.ActionId,
                    SourceCardInstanceId: request.SourceCardInstanceId,
                    IsEnabled: true,
                    DisabledReason: null,
                    MinimumTargetCount: null,
                    MaximumTargetCount: null,
                    ExactTargetCount: null,
                    AutoSelectAllValidTargets: false,
                    ValidTargets: []),
            };
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

    private static string? ResolveActionPrefix(string actionId)
    {
        if (actionId.StartsWith(LeaderEffectActionPrefix, StringComparison.Ordinal))
        {
            return LeaderEffectActionPrefix;
        }

        if (actionId.StartsWith(ActivateSupportActionPrefix, StringComparison.Ordinal))
        {
            return ActivateSupportActionPrefix;
        }

        if (actionId.StartsWith(SummonToFieldActionPrefix, StringComparison.Ordinal))
        {
            return SummonToFieldActionPrefix;
        }

        if (actionId.StartsWith(SetSupportActionPrefix, StringComparison.Ordinal))
        {
            return SetSupportActionPrefix;
        }

        return null;
    }

    private static void ValidateCardActionWindow(GameInstance instance, string playerId, string actionPrefix)
    {
        if (actionPrefix is SummonToFieldActionPrefix or SetSupportActionPrefix)
        {
            if (instance.State.Phase != GamePhase.MainPhase)
            {
                throw new InvalidOperationException("Hand card actions can only be executed during MainPhase.");
            }

            if (!string.Equals(instance.State.ActivePlayerId, playerId, StringComparison.Ordinal))
            {
                throw new InvalidOperationException("Only the active player can execute hand card actions.");
            }

            return;
        }

        if (actionPrefix == LeaderEffectActionPrefix)
        {
            return;
        }

        if (instance.State.Phase != GamePhase.ActionStep)
        {
            throw new InvalidOperationException("Card actions can only be executed during ActionStep.");
        }

        if (!string.Equals(instance.State.PriorityPlayerId, playerId, StringComparison.Ordinal))
        {
            throw new InvalidOperationException("Only the priority player can execute card actions.");
        }
    }

    private static string ResolveActionSourceCardInstanceId(string actionId, string actionPrefix)
    {
        if (actionPrefix == LeaderEffectActionPrefix)
        {
            if (!TryParseLeaderEffectActionId(actionId, out var parsedLeaderInstanceId, out _))
            {
                throw new InvalidOperationException($"Card action '{actionId}' is invalid.");
            }

            return parsedLeaderInstanceId;
        }

        return actionId[actionPrefix.Length..].Trim();
    }

    private static bool TryParseLeaderEffectActionId(string actionId, out string leaderInstanceId, out string effectKey)
    {
        leaderInstanceId = string.Empty;
        effectKey = string.Empty;

        if (!actionId.StartsWith(LeaderEffectActionPrefix, StringComparison.Ordinal))
        {
            return false;
        }

        var payload = actionId[LeaderEffectActionPrefix.Length..];
        var delimiterIndex = payload.IndexOf(':');
        if (delimiterIndex <= 0 || delimiterIndex >= payload.Length - 1)
        {
            return false;
        }

        leaderInstanceId = payload[..delimiterIndex].Trim();
        effectKey = payload[(delimiterIndex + 1)..].Trim();
        return !string.IsNullOrWhiteSpace(leaderInstanceId) && !string.IsNullOrWhiteSpace(effectKey);
    }

    private static bool IsLeaderEffectTimingAvailable(EffectTiming timing, GameState state, string actingPlayerId)
    {
        var isActivePlayer = string.Equals(state.ActivePlayerId, actingPlayerId, StringComparison.Ordinal);
        var isPriorityPlayer = string.Equals(state.PriorityPlayerId, actingPlayerId, StringComparison.Ordinal);

        return timing switch
        {
            EffectTiming.ActivateMain or EffectTiming.DuringYourMain =>
                state.Phase == GamePhase.MainPhase && isActivePlayer,
            EffectTiming.YourTurn =>
                isActivePlayer,
            EffectTiming.Quick =>
                state.Phase == GamePhase.ActionStep && isPriorityPlayer,
            EffectTiming.SupportActivated =>
                state.Phase == GamePhase.ActionStep && isPriorityPlayer,
            EffectTiming.DuringOpponentAttack =>
                state.Phase is GamePhase.AttackDeclaration or GamePhase.BlockerDeclaration or GamePhase.ActionStep
                && !isActivePlayer,
            _ => false,
        };
    }

    private static string ResolveEffectKey(EffectSpec effectSpec, int effectIndex)
    {
        if (!string.IsNullOrWhiteSpace(effectSpec.Id))
        {
            return effectSpec.Id.Trim();
        }

        return $"index-{effectIndex}";
    }

    private static bool MatchesEffectKey(EffectSpec effectSpec, int effectIndex, string effectKey)
    {
        var resolvedEffectKey = ResolveEffectKey(effectSpec, effectIndex);
        return string.Equals(resolvedEffectKey, effectKey, StringComparison.Ordinal);
    }

    private GameCardActionTargetsResponse BuildSupportCardActionTargets(
        GameInstance instance,
        string actionId,
        string sourceCardInstanceId,
        string playerId,
        PlayerState actingPlayer,
        IReadOnlyDictionary<string, string> arguments,
        IGameEffectCanExecuteEvaluator canExecuteEvaluator)
    {
        var sourceCardInstance = actingPlayer.SupportZone.FirstOrDefault(card =>
            string.Equals(card.InstanceId, sourceCardInstanceId, StringComparison.Ordinal));
        if (sourceCardInstance is null)
        {
            throw new InvalidOperationException(
                $"Support card instance '{sourceCardInstanceId}' was not found for player '{playerId}'.");
        }

        if (!instance.State.CardDefinitions.TryGetValue(sourceCardInstance.CardDefinitionId, out var sourceCardDefinition))
        {
            throw new InvalidOperationException($"Card definition '{sourceCardInstance.CardDefinitionId}' was not found.");
        }

        var effectSpec = sourceCardDefinition.Effects.FirstOrDefault();
        if (effectSpec is null)
        {
            return new GameCardActionTargetsResponse(
                ActionId: actionId,
                SourceCardInstanceId: sourceCardInstanceId,
                IsEnabled: true,
                DisabledReason: null,
                MinimumTargetCount: null,
                MaximumTargetCount: null,
                ExactTargetCount: null,
                AutoSelectAllValidTargets: false,
                ValidTargets: []);
        }

        var context = new GameCardEffectContext(
            game: instance,
            actingPlayer: new Player { Id = playerId },
            sourceCardDefinition: sourceCardDefinition,
            sourceCardInstance: sourceCardInstance,
            arguments: arguments,
            selectedTargets: []);

        var canExecuteResult = canExecuteEvaluator.Evaluate(context, effectSpec, includeValidTargets: true);
        var validTargets = ResolveValidTargetsForResponse(context, effectSpec, canExecuteResult);
        return ToCardActionTargetsResponse(actionId, sourceCardInstanceId, effectSpec, canExecuteResult, validTargets);
    }

    private GameCardActionTargetsResponse BuildLeaderCardActionTargets(
        GameInstance instance,
        string actionId,
        string sourceCardInstanceId,
        string playerId,
        PlayerState actingPlayer,
        IReadOnlyDictionary<string, string> arguments,
        IGameEffectCanExecuteEvaluator canExecuteEvaluator)
    {
        var leaderInstance = actingPlayer.LeaderCardInstance;
        if (leaderInstance is null
            || !string.Equals(leaderInstance.InstanceId, sourceCardInstanceId, StringComparison.Ordinal))
        {
            throw new InvalidOperationException(
                $"Leader card instance '{sourceCardInstanceId}' was not found for player '{playerId}'.");
        }

        if (!instance.State.CardDefinitions.TryGetValue(leaderInstance.CardDefinitionId, out var sourceCardDefinition))
        {
            throw new InvalidOperationException($"Card definition '{leaderInstance.CardDefinitionId}' was not found.");
        }

        if (!TryParseLeaderEffectActionId(actionId, out _, out var effectKey))
        {
            throw new InvalidOperationException($"Card action '{actionId}' is invalid.");
        }

        var effectWithIndex = sourceCardDefinition.Effects
            .Select((effect, index) => new { Effect = effect, Index = index })
            .FirstOrDefault(entry => MatchesEffectKey(entry.Effect, entry.Index, effectKey));

        if (effectWithIndex is null)
        {
            throw new InvalidOperationException($"Leader effect '{effectKey}' was not found on '{sourceCardDefinition.Id}'.");
        }

        var effectSpec = effectWithIndex.Effect;
        var timingAvailable = IsLeaderEffectTimingAvailable(effectSpec.Timing, instance.State, playerId);
        if (!timingAvailable)
        {
            return new GameCardActionTargetsResponse(
                ActionId: actionId,
                SourceCardInstanceId: sourceCardInstanceId,
                IsEnabled: false,
                DisabledReason: $"Leader effect '{effectSpec.Timing}' timing is not available right now.",
                MinimumTargetCount: effectSpec.TargetRules.MinimumTargetCount,
                MaximumTargetCount: effectSpec.TargetRules.MaximumTargetCount,
                ExactTargetCount: effectSpec.TargetRules.ExactTargetCount,
                AutoSelectAllValidTargets: effectSpec.TargetRules.AutoSelectAllValidTargets,
                ValidTargets: []);
        }

        var context = new GameCardEffectContext(
            game: instance,
            actingPlayer: new Player { Id = playerId },
            sourceCardDefinition: sourceCardDefinition,
            sourceCardInstance: null,
            arguments: arguments,
            selectedTargets: []);

        var canExecuteResult = canExecuteEvaluator.Evaluate(context, effectSpec, includeValidTargets: true);
        var validTargets = ResolveValidTargetsForResponse(context, effectSpec, canExecuteResult);
        return ToCardActionTargetsResponse(actionId, sourceCardInstanceId, effectSpec, canExecuteResult, validTargets);
    }

    private static GameCardActionTargetsResponse ToCardActionTargetsResponse(
        string actionId,
        string sourceCardInstanceId,
        EffectSpec effectSpec,
        CanExecuteResult canExecuteResult,
        IReadOnlyList<GameEffectTargetReference> validTargets)
    {
        return new GameCardActionTargetsResponse(
            ActionId: actionId,
            SourceCardInstanceId: sourceCardInstanceId,
            IsEnabled: canExecuteResult.CanExecute,
            DisabledReason: canExecuteResult.FailedConditions.Count == 0
                ? null
                : canExecuteResult.FailedConditions[0],
            MinimumTargetCount: effectSpec.TargetRules.MinimumTargetCount,
            MaximumTargetCount: effectSpec.TargetRules.MaximumTargetCount,
            ExactTargetCount: effectSpec.TargetRules.ExactTargetCount,
            AutoSelectAllValidTargets: effectSpec.TargetRules.AutoSelectAllValidTargets,
            ValidTargets: validTargets);
    }

    private static IReadOnlyList<GameEffectTargetReference> ResolveValidTargetsForResponse(
        GameCardEffectContext context,
        EffectSpec effectSpec,
        CanExecuteResult canExecuteResult)
    {
        if (!canExecuteResult.CanExecute)
        {
            return [];
        }

        if (effectSpec.TargetRules.Rules.Count == 0)
        {
            return [];
        }

        var targetResolver = new Api.Services.Games.EffectTargetResolver();
        return targetResolver.ResolveTargets(context, effectSpec);
    }

    private void ExecuteLeaderEffectAction(
        GameInstance instance,
        string playerId,
        GameCardActionExecutionRequest request,
        IGameSequentialEffectExecutor sequentialEffectExecutor,
        PlayerState actingPlayer,
        Dictionary<string, string> arguments)
    {
        var leaderInstance = actingPlayer.LeaderCardInstance;
        if (leaderInstance is null
            || !string.Equals(leaderInstance.InstanceId, request.SourceCardInstanceId, StringComparison.Ordinal))
        {
            throw new InvalidOperationException(
                $"Leader card instance '{request.SourceCardInstanceId}' was not found for player '{playerId}'.");
        }

        if (!instance.State.CardDefinitions.TryGetValue(leaderInstance.CardDefinitionId, out var sourceCardDefinition))
        {
            throw new InvalidOperationException($"Card definition '{leaderInstance.CardDefinitionId}' was not found.");
        }

        if (!TryParseLeaderEffectActionId(request.ActionId, out _, out var effectKey))
        {
            throw new InvalidOperationException($"Card action '{request.ActionId}' is invalid.");
        }

        var effectWithIndex = sourceCardDefinition.Effects
            .Select((effect, index) => new { Effect = effect, Index = index })
            .FirstOrDefault(entry => MatchesEffectKey(entry.Effect, entry.Index, effectKey));

        if (effectWithIndex is null)
        {
            throw new InvalidOperationException($"Leader effect '{effectKey}' was not found on '{sourceCardDefinition.Id}'.");
        }

        var effectSpec = effectWithIndex.Effect;
        if (!IsLeaderEffectTimingAvailable(effectSpec.Timing, instance.State, playerId))
        {
            throw new InvalidOperationException($"Leader effect '{effectSpec.Timing}' timing is not available right now.");
        }

        arguments[ReactiveEffectExecutionConstants.ActiveEffectSpecIdArgument] = string.IsNullOrWhiteSpace(effectSpec.Id)
            ? effectSpec.RuntimeEffectType.ToString()
            : effectSpec.Id;
        arguments[FallbackEffectKeyArgument] = effectKey;

        var selectedTargets = request.SelectedTargets ?? [];
        var context = new GameCardEffectContext(
            game: instance,
            actingPlayer: new Player { Id = playerId },
            sourceCardDefinition: sourceCardDefinition,
            sourceCardInstance: null,
            arguments: arguments,
            selectedTargets: selectedTargets);

        var executeResult = sequentialEffectExecutor.Execute(context);
        if (executeResult.IsError)
        {
            throw new InvalidOperationException(executeResult.FirstError.Description);
        }
    }

    private void ExecuteActivateSupportAction(
        GameInstance instance,
        string playerId,
        GameCardActionExecutionRequest request,
        IGameSequentialEffectExecutor sequentialEffectExecutor,
        PlayerState actingPlayer,
        Dictionary<string, string> arguments)
    {
        var sourceCardInstance = actingPlayer.SupportZone.FirstOrDefault(card =>
            string.Equals(card.InstanceId, request.SourceCardInstanceId, StringComparison.Ordinal));
        if (sourceCardInstance is null)
        {
            throw new InvalidOperationException(
                $"Support card instance '{request.SourceCardInstanceId}' was not found for player '{playerId}'.");
        }

        if (!instance.State.CardDefinitions.TryGetValue(sourceCardInstance.CardDefinitionId, out var sourceCardDefinition))
        {
            throw new InvalidOperationException(
                $"Card definition '{sourceCardInstance.CardDefinitionId}' was not found.");
        }

        var selectedTargets = request.SelectedTargets ?? [];

        var context = new GameCardEffectContext(
            game: instance,
            actingPlayer: new Player { Id = playerId },
            sourceCardDefinition: sourceCardDefinition,
            sourceCardInstance: sourceCardInstance,
            arguments: arguments,
            selectedTargets: selectedTargets);

        var executeResult = sequentialEffectExecutor.Execute(context);
        if (executeResult.IsError)
        {
            throw new InvalidOperationException(executeResult.FirstError.Description);
        }
    }

    private void ExecuteSummonToFieldAction(
        GameInstance instance,
        string playerId,
        string sourceCardInstanceId,
        PlayerState actingPlayer)
    {
        var sourceCardInstance = actingPlayer.Hand.FirstOrDefault(card =>
            string.Equals(card.InstanceId, sourceCardInstanceId, StringComparison.Ordinal));
        if (sourceCardInstance is null)
        {
            throw new InvalidOperationException(
                $"Hand card instance '{sourceCardInstanceId}' was not found for player '{playerId}'.");
        }

        if (!instance.State.CardDefinitions.TryGetValue(sourceCardInstance.CardDefinitionId, out var sourceCardDefinition))
        {
            throw new InvalidOperationException(
                $"Card definition '{sourceCardInstance.CardDefinitionId}' was not found.");
        }

        if (sourceCardDefinition.Type is CardType.Chakra or CardType.Summon or CardType.Leader)
        {
            throw new InvalidOperationException(
                $"Card '{sourceCardDefinition.Id}' cannot be summoned to the battlefield from hand.");
        }

        var requiresReadySummonCard = !sourceCardDefinition.CannotBeNormalSummoned;
        if (requiresReadySummonCard && !instance.State.IsSummonCardReady(playerId))
        {
            throw new InvalidOperationException("Your summon card is rested.");
        }

        if (sourceCardDefinition.CannotBeNormalSummoned && !CanSpecialSummonWithoutNormalSummon(sourceCardDefinition))
        {
            throw new InvalidOperationException(
                $"Card '{sourceCardDefinition.Id}' cannot be summoned because its summon condition is not satisfiable.");
        }

        var movedCard = MoveCardToZone(
            instance,
            playerId,
            sourceCardInstanceId,
            PlayerZone.Hand,
            PlayerZone.CharacterField,
            destinationIndex: null);

        movedCard.IsRested = false;

        if (requiresReadySummonCard)
        {
            instance.State.SetSummonCardReady(playerId, false);
        }
    }

    private void ExecuteSetSupportAction(
        GameInstance instance,
        string playerId,
        string sourceCardInstanceId,
        PlayerState actingPlayer,
        IReadOnlyDictionary<string, string> arguments)
    {
        var sourceCardInstance = actingPlayer.Hand.FirstOrDefault(card =>
            string.Equals(card.InstanceId, sourceCardInstanceId, StringComparison.Ordinal));
        if (sourceCardInstance is null)
        {
            throw new InvalidOperationException(
                $"Hand card instance '{sourceCardInstanceId}' was not found for player '{playerId}'.");
        }

        if (!instance.State.CardDefinitions.TryGetValue(sourceCardInstance.CardDefinitionId, out var sourceCardDefinition))
        {
            throw new InvalidOperationException(
                $"Card definition '{sourceCardInstance.CardDefinitionId}' was not found.");
        }

        if (!IsSupportCapable(sourceCardDefinition))
        {
            throw new InvalidOperationException(
                $"Card '{sourceCardDefinition.Id}' cannot be set to support zone.");
        }

        if (!arguments.TryGetValue(SupportSlotIndexArgumentKey, out var rawSlot)
            || !int.TryParse(rawSlot, out var slotIndex)
            || slotIndex < 0
            || slotIndex >= MaxSupportSlots)
        {
            throw new InvalidOperationException("A valid support slot index is required.");
        }

        var occupiedSlotIndex = actingPlayer.SupportZone
            .Select((card, currentIndex) => card.SupportSlotIndex ?? currentIndex)
            .Any(currentSlotIndex => currentSlotIndex == slotIndex);

        if (occupiedSlotIndex)
        {
            throw new InvalidOperationException($"Support slot {slotIndex} is already occupied.");
        }

        MoveCardToZone(
            instance,
            playerId,
            sourceCardInstanceId,
            PlayerZone.Hand,
            PlayerZone.SupportZone,
            slotIndex);
    }

    private CardInstance MoveCardToZone(
        GameInstance instance,
        string playerId,
        string cardInstanceId,
        PlayerZone sourceZone,
        PlayerZone destinationZone,
        int? destinationIndex)
    {
        return runtimeDeckService.MoveCardToZone(
            instance,
            playerId,
            sourceZone,
            destinationZone,
            cardInstanceId,
            destinationIndex: destinationIndex);
    }

    private static bool IsSupportCapable(Card card)
    {
        if (card is not CharacterCard characterCard)
        {
            return false;
        }

        return !string.IsNullOrWhiteSpace(characterCard.SupportName)
            || !string.IsNullOrWhiteSpace(characterCard.SupportEffect);
    }

    private static bool CanSpecialSummonWithoutNormalSummon(Card card)
    {
        if (card.Conditions.Count == 0)
        {
            return false;
        }

        return card.Conditions.Any(condition =>
            string.Equals(condition, EffectConditionKeywords.SummonRequirements, StringComparison.OrdinalIgnoreCase)
            || string.Equals(condition, "hasSummonTarget", StringComparison.OrdinalIgnoreCase));
    }
}