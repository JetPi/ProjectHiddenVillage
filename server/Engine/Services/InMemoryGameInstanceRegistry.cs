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
    private const string BattleActionPrefix = "battle-action:";
    private const string LeaderEffectActionPrefix = "leader-effect:";
    private const string ResolveOptionalAttackEffectActionPrefix = "resolve-optional-attack-effect:";
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

            AutoAdvanceMainPhaseIfNoLegalActions(instance);

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

            var previousPhase = instance.State.Phase;
            phaseService.AdvancePhase(instance);
            ApplyPendingAttackResolutionIfNeeded(instance, previousPhase);
            AutoAdvanceMainPhaseIfNoLegalActions(instance);
            instance.ValidateInvariants();
            return instance;
        }
    }

    public GameInstance DeclarePassInActionStep(string gameId, string playerId)
    {
        var instance = GetRequired(gameId);

        lock (instance)
        {
            var previousPhase = instance.State.Phase;
            phaseService.DeclarePassInActionStep(instance, playerId);
            ApplyPendingAttackResolutionIfNeeded(instance, previousPhase);
            AutoAdvanceMainPhaseIfNoLegalActions(instance);
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
            AutoAdvanceMainPhaseIfNoLegalActions(instance);
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
                IsSamePlayerId(player.PlayerId, request.PlayerId));
            if (actingPlayer is null)
            {
                throw new InvalidOperationException($"Player '{request.PlayerId}' was not found in game.");
            }

            var arguments = request.Arguments is null
                ? new Dictionary<string, string>(StringComparer.Ordinal)
                : new Dictionary<string, string>(request.Arguments, StringComparer.Ordinal);
            var phaseBeforeActionExecution = instance.State.Phase;

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
                case BattleActionPrefix:
                    ExecuteBattleAction(instance, request.PlayerId, request, actingPlayer, sequentialEffectExecutor);
                    break;
                case LeaderEffectActionPrefix:
                    ExecuteLeaderEffectAction(instance, request.PlayerId, request, sequentialEffectExecutor, actingPlayer, arguments);
                    break;
                case ResolveOptionalAttackEffectActionPrefix:
                    ExecuteResolveOptionalAttackEffectAction(instance, request.PlayerId, request, sequentialEffectExecutor);
                    break;
                default:
                    throw new InvalidOperationException($"Card action '{request.ActionId}' is not supported yet.");
            }

            if (phaseBeforeActionExecution == GamePhase.ActionStep
                && instance.State.Phase == GamePhase.ActionStep)
            {
                phaseService.DeclareActionInActionStep(instance, request.PlayerId);
            }

            AutoAdvanceMainPhaseIfNoLegalActions(instance);

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
                IsSamePlayerId(player.PlayerId, request.PlayerId));
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
                BattleActionPrefix => BuildBattleCardActionTargets(
                    instance,
                    request.ActionId,
                    request.SourceCardInstanceId,
                    request.PlayerId,
                    actingPlayer),
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
            AutoAdvanceMainPhaseIfNoLegalActions(instance);
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

        if (actionId.StartsWith(BattleActionPrefix, StringComparison.Ordinal))
        {
            return BattleActionPrefix;
        }

        if (actionId.StartsWith(ResolveOptionalAttackEffectActionPrefix, StringComparison.Ordinal))
        {
            return ResolveOptionalAttackEffectActionPrefix;
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

            if (!IsSamePlayerId(instance.State.ActivePlayerId, playerId))
            {
                throw new InvalidOperationException("Only the active player can execute hand card actions.");
            }

            return;
        }

        if (actionPrefix == BattleActionPrefix)
        {
            if (instance.State.Phase != GamePhase.MainPhase)
            {
                throw new InvalidOperationException("Battle actions can only be executed during MainPhase.");
            }

            if (!IsSamePlayerId(instance.State.ActivePlayerId, playerId))
            {
                throw new InvalidOperationException("Only the active player can execute battle actions.");
            }

            return;
        }

        if (actionPrefix == ResolveOptionalAttackEffectActionPrefix)
        {
            if (instance.State.Phase != GamePhase.AttackDeclaration)
            {
                throw new InvalidOperationException("Optional attack effect choice can only be resolved during attack declaration.");
            }

            if (!IsSamePlayerId(instance.State.PendingAttackOptionalEffectPlayerId, playerId))
            {
                throw new InvalidOperationException("Only the attacking player can resolve optional attack effect choice.");
            }

            return;
        }

        if (actionPrefix == LeaderEffectActionPrefix)
        {
            return;
        }

        if (actionPrefix == ActivateSupportActionPrefix)
        {
            var isActivePlayer = IsSamePlayerId(instance.State.ActivePlayerId, playerId);
            if (isActivePlayer)
            {
                if (instance.State.Phase is GamePhase.MainPhase or GamePhase.ActionStep)
                {
                    if (instance.State.Phase == GamePhase.ActionStep
                        && !IsSamePlayerId(instance.State.PriorityPlayerId, playerId))
                    {
                        throw new InvalidOperationException("Only the priority player can execute card actions.");
                    }

                    return;
                }

                throw new InvalidOperationException("Support actions on your turn can only be executed during MainPhase or ActionStep.");
            }

            if (instance.State.Phase != GamePhase.ActionStep)
            if (instance.State.Phase is not (GamePhase.AttackDeclaration or GamePhase.BlockerDeclaration or GamePhase.ActionStep))
            {
                throw new InvalidOperationException("Opponent-turn supports can only be executed during attack response windows.");
            }

            if (instance.State.Phase == GamePhase.ActionStep
                && !IsSamePlayerId(instance.State.PriorityPlayerId, playerId))
            {
                throw new InvalidOperationException("Only the priority player can execute card actions.");
            }

            return;
        }

        if (instance.State.Phase != GamePhase.ActionStep)
        {
            throw new InvalidOperationException("Card actions can only be executed during ActionStep.");
        }

        if (!IsSamePlayerId(instance.State.PriorityPlayerId, playerId))
        {
            throw new InvalidOperationException("Only the priority player can execute card actions.");
        }
    }

    private static bool IsSamePlayerId(string? left, string? right)
    {
        if (string.IsNullOrWhiteSpace(left) || string.IsNullOrWhiteSpace(right))
        {
            return false;
        }

        if (Guid.TryParse(left, out var leftGuid) && Guid.TryParse(right, out var rightGuid))
        {
            return leftGuid == rightGuid;
        }

        return string.Equals(left.Trim(), right.Trim(), StringComparison.OrdinalIgnoreCase);
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

        if (actionPrefix == BattleActionPrefix)
        {
            return actionId[actionPrefix.Length..].Trim();
        }

        if (actionPrefix == ResolveOptionalAttackEffectActionPrefix)
        {
            var payload = actionId[actionPrefix.Length..].Trim();
            var delimiterIndex = payload.IndexOf(':');
            if (delimiterIndex <= 0 || delimiterIndex >= payload.Length - 1)
            {
                throw new InvalidOperationException($"Card action '{actionId}' is invalid.");
            }

            return payload[..delimiterIndex].Trim();
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
        var isActivePlayer = IsSamePlayerId(state.ActivePlayerId, actingPlayerId);
        var isPriorityPlayer = IsSamePlayerId(state.PriorityPlayerId, actingPlayerId);

        return timing switch
        {
            EffectTiming.ActivateMain or EffectTiming.DuringYourMain =>
                state.Phase == GamePhase.MainPhase && isActivePlayer,
            EffectTiming.WhenAttacking =>
                state.HasPendingAttack && state.Phase == GamePhase.BlockerDeclaration && isActivePlayer,
            EffectTiming.YourTurn =>
                isActivePlayer,
            EffectTiming.Quick =>
                state.Phase == GamePhase.ActionStep && isPriorityPlayer,
            EffectTiming.SupportActivated =>
                state.Phase == GamePhase.ActionStep && isPriorityPlayer,
            EffectTiming.DuringOpponentAttack =>
                state.HasPendingAttack && state.Phase == GamePhase.ActionStep && !isActivePlayer,
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
        var isFromSupportZone = true;
        if (sourceCardInstance is null)
        {
            isFromSupportZone = false;
            sourceCardInstance = actingPlayer.Hand.FirstOrDefault(card =>
                string.Equals(card.InstanceId, sourceCardInstanceId, StringComparison.Ordinal));
        }

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

            if (!IsSupportEffectTimingAvailable(effectSpec.Timing, instance.State, playerId, isFromSupportZone))
            {
                return new GameCardActionTargetsResponse(
                ActionId: actionId,
                SourceCardInstanceId: sourceCardInstanceId,
                IsEnabled: false,
                DisabledReason: "Support timing is not available right now.",
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
            sourceCardInstance: sourceCardInstance,
            arguments: arguments,
            selectedTargets: []);

        var canExecuteResult = canExecuteEvaluator.Evaluate(context, effectSpec, includeValidTargets: true);
        var validTargets = ResolveValidTargetsForResponse(context, effectSpec, canExecuteResult);
        return ToCardActionTargetsResponse(actionId, sourceCardInstanceId, effectSpec, canExecuteResult, validTargets);
    }

    private static GameCardActionTargetsResponse BuildBattleCardActionTargets(
        GameInstance instance,
        string actionId,
        string sourceCardInstanceId,
        string playerId,
        PlayerState actingPlayer)
    {
        var attacker = actingPlayer.Battlefield.FirstOrDefault(card =>
            string.Equals(card.InstanceId, sourceCardInstanceId, StringComparison.Ordinal));
        if (attacker is null)
        {
            throw new InvalidOperationException(
                $"Battlefield card instance '{sourceCardInstanceId}' was not found for player '{playerId}'.");
        }

        if (attacker.IsRested || attacker.IsExhausted)
        {
            return new GameCardActionTargetsResponse(
                ActionId: actionId,
                SourceCardInstanceId: sourceCardInstanceId,
                IsEnabled: false,
                DisabledReason: "Only active characters can declare attacks.",
                MinimumTargetCount: 1,
                MaximumTargetCount: 1,
                ExactTargetCount: 1,
                AutoSelectAllValidTargets: false,
                ValidTargets: []);
        }

        var defenderPlayer = instance.State.Players.FirstOrDefault(player =>
            !IsSamePlayerId(player.PlayerId, playerId));
        if (defenderPlayer is null || defenderPlayer.LeaderCardInstance is null)
        {
            return new GameCardActionTargetsResponse(
                ActionId: actionId,
                SourceCardInstanceId: sourceCardInstanceId,
                IsEnabled: false,
                DisabledReason: "No valid defender target is available.",
                MinimumTargetCount: 1,
                MaximumTargetCount: 1,
                ExactTargetCount: 1,
                AutoSelectAllValidTargets: false,
                ValidTargets: []);
        }

        var validTargets = new List<GameEffectTargetReference>
        {
            new(
                PlayerId: defenderPlayer.PlayerId,
                Zone: PlayerZone.Leader,
                CardInstanceId: defenderPlayer.LeaderCardInstance.InstanceId)
        };

        validTargets.AddRange(defenderPlayer.Battlefield
            .Where(card => card.IsRested)
            .Select(card => new GameEffectTargetReference(
                PlayerId: defenderPlayer.PlayerId,
                Zone: PlayerZone.CharacterField,
                CardInstanceId: card.InstanceId)));

        return new GameCardActionTargetsResponse(
            ActionId: actionId,
            SourceCardInstanceId: sourceCardInstanceId,
            IsEnabled: validTargets.Count > 0,
            DisabledReason: validTargets.Count > 0 ? null : "No valid defender target is available.",
            MinimumTargetCount: 1,
            MaximumTargetCount: 1,
            ExactTargetCount: 1,
            AutoSelectAllValidTargets: false,
            ValidTargets: validTargets);
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
        var isFromSupportZone = true;
        var sourceCardInstance = actingPlayer.SupportZone.FirstOrDefault(card =>
            string.Equals(card.InstanceId, request.SourceCardInstanceId, StringComparison.Ordinal));
        if (sourceCardInstance is null)
        {
            isFromSupportZone = false;
            sourceCardInstance = actingPlayer.Hand.FirstOrDefault(card =>
                string.Equals(card.InstanceId, request.SourceCardInstanceId, StringComparison.Ordinal));
        }

        if (sourceCardInstance is null)
        {
            throw new InvalidOperationException(
                $"Support card instance '{request.SourceCardInstanceId}' was not found for player '{playerId}'.");
        }

        if (IsSamePlayerId(instance.State.ActivePlayerId, playerId))
        {
            // Your turn support can be activated from hand or support area.
        }
        else
        {
            var fromSupportZone = actingPlayer.SupportZone.Any(card =>
                string.Equals(card.InstanceId, request.SourceCardInstanceId, StringComparison.Ordinal));

            if (!fromSupportZone)
            {
                throw new InvalidOperationException("Opponent-turn supports, including Quick, must be played from support area.");
            }
        }

        if (!instance.State.CardDefinitions.TryGetValue(sourceCardInstance.CardDefinitionId, out var sourceCardDefinition))
        {
            throw new InvalidOperationException(
                $"Card definition '{sourceCardInstance.CardDefinitionId}' was not found.");
        }

        var primaryEffect = sourceCardDefinition.Effects.FirstOrDefault();
        if (primaryEffect is not null
            && !IsSupportEffectTimingAvailable(primaryEffect.Timing, instance.State, playerId, isFromSupportZone))
        {
            throw new InvalidOperationException("Support timing is not available right now.");
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

        if (!isFromSupportZone)
        {
            runtimeDeckService.MoveCardToZone(
                instance,
                playerId,
                PlayerZone.Hand,
                PlayerZone.Trash,
                sourceCardInstance.InstanceId);
        }
    }

    private void ExecuteBattleAction(
        GameInstance instance,
        string playerId,
        GameCardActionExecutionRequest request,
        PlayerState actingPlayer,
        IGameSequentialEffectExecutor sequentialEffectExecutor)
    {
        var attacker = actingPlayer.Battlefield.FirstOrDefault(card =>
            string.Equals(card.InstanceId, request.SourceCardInstanceId, StringComparison.Ordinal));
        if (attacker is null)
        {
            throw new InvalidOperationException(
                $"Battlefield card instance '{request.SourceCardInstanceId}' was not found for player '{playerId}'.");
        }

        if (attacker.IsRested)
        {
            throw new InvalidOperationException("Attacking character must be active before declaring an attack.");
        }

        var selectedTarget = request.SelectedTargets?.FirstOrDefault();
        if (selectedTarget is null)
        {
            throw new InvalidOperationException("Battle actions require an explicit defender target.");
        }

        var defenderPlayer = instance.State.Players.FirstOrDefault(player =>
            !IsSamePlayerId(player.PlayerId, playerId));
        if (defenderPlayer is null)
        {
            throw new InvalidOperationException("A defender could not be resolved for this attack.");
        }

        if (!string.Equals(selectedTarget.PlayerId, defenderPlayer.PlayerId, StringComparison.Ordinal))
        {
            throw new InvalidOperationException("Battle defender target must belong to the opposing player.");
        }

        var targetZone = selectedTarget.Zone;
        if (targetZone == PlayerZone.CharacterField)
        {
            var targetId = selectedTarget.CardInstanceId;
            if (string.IsNullOrWhiteSpace(targetId))
            {
                throw new InvalidOperationException("Character attacks require a defender target.");
            }

            var defendingCard = defenderPlayer.Battlefield.FirstOrDefault(card =>
                string.Equals(card.InstanceId, targetId, StringComparison.Ordinal));

            if (defendingCard is null)
            {
                throw new InvalidOperationException("The selected defending character was not found.");
            }

            if (!defendingCard.IsRested)
            {
                throw new InvalidOperationException("You can only attack defending characters that are in rest mode.");
            }
        }
        else if (targetZone == PlayerZone.Leader)
        {
            if (!string.IsNullOrWhiteSpace(selectedTarget.CardInstanceId)
                && defenderPlayer.LeaderCardInstance is not null
                && !string.Equals(defenderPlayer.LeaderCardInstance.InstanceId, selectedTarget.CardInstanceId, StringComparison.Ordinal))
            {
                throw new InvalidOperationException("Leader attack target does not match defender leader.");
            }
        }
        else
        {
            throw new InvalidOperationException("Battle target must be a leader or a character in play.");
        }

        attacker.IsRested = true;
        instance.State.HasPendingAttack = true;
        instance.State.PendingAttackDeclarationId = Guid.NewGuid().ToString("N");
        instance.State.PendingAttackAttackerInstanceId = attacker.InstanceId;
        instance.State.PendingAttackDefenderPlayerId = defenderPlayer.PlayerId;
        instance.State.PendingAttackDefenderInstanceId = selectedTarget.CardInstanceId;
        instance.State.PendingAttackDefenderZone = targetZone;

        ExecuteAutomaticWhenAttackingEffects(instance, playerId, attacker, sequentialEffectExecutor);

        if (TryPrepareOptionalWhenAttackingChoice(instance, playerId, attacker))
        {
            instance.State.Phase = GamePhase.AttackDeclaration;
            instance.State.PriorityPlayerId = string.Empty;
            instance.State.ConsecutivePasses = 0;
            return;
        }

        EnterSupportCutInWindow(instance.State, defenderPlayer.PlayerId);
    }

    private static void ExecuteAutomaticWhenAttackingEffects(
        GameInstance instance,
        string actingPlayerId,
        CardInstance attacker,
        IGameSequentialEffectExecutor sequentialEffectExecutor)
    {
        if (instance.State.CardDefinitions.TryGetValue(attacker.CardDefinitionId, out var attackerDefinition))
        {
            ExecuteAutomaticWhenAttackingEffectsForSource(
                instance,
                actingPlayerId,
                sourceCardDefinition: attackerDefinition,
                sourceCardInstance: attacker,
                sequentialEffectExecutor);
        }
    }

    private static bool TryPrepareOptionalWhenAttackingChoice(GameInstance instance, string actingPlayerId, CardInstance attacker)
    {
        if (!instance.State.CardDefinitions.TryGetValue(attacker.CardDefinitionId, out var attackerDefinition))
        {
            return false;
        }

        var optionalEffect = attackerDefinition.Effects.FirstOrDefault(effect =>
            effect.Timing == EffectTiming.WhenAttacking && effect.IsOptional);

        if (optionalEffect is null)
        {
            ClearPendingOptionalAttackEffectState(instance.State);
            return false;
        }

        instance.State.PendingAttackOptionalEffectSourceCardInstanceId = attacker.InstanceId;
        instance.State.PendingAttackOptionalEffectId = ResolveEffectKey(optionalEffect, 0);
        instance.State.PendingAttackOptionalEffectPlayerId = actingPlayerId;
        return true;
    }

    private static void ExecuteResolveOptionalAttackEffectAction(
        GameInstance instance,
        string playerId,
        GameCardActionExecutionRequest request,
        IGameSequentialEffectExecutor sequentialEffectExecutor)
    {
        if (!TryParseResolveOptionalAttackEffectActionId(request.ActionId, out var sourceCardInstanceId, out var decision))
        {
            throw new InvalidOperationException($"Card action '{request.ActionId}' is invalid.");
        }

        if (!string.Equals(sourceCardInstanceId, instance.State.PendingAttackOptionalEffectSourceCardInstanceId, StringComparison.Ordinal)
            || !IsSamePlayerId(playerId, instance.State.PendingAttackOptionalEffectPlayerId))
        {
            throw new InvalidOperationException("Optional attack effect choice does not match pending attack context.");
        }

        if (string.Equals(decision, "yes", StringComparison.Ordinal))
        {
            var actingPlayer = instance.State.Players.FirstOrDefault(player =>
                IsSamePlayerId(player.PlayerId, playerId));

            var sourceCardInstance = actingPlayer?.Battlefield.FirstOrDefault(card =>
                string.Equals(card.InstanceId, sourceCardInstanceId, StringComparison.Ordinal));

            if (sourceCardInstance is not null
                && instance.State.CardDefinitions.TryGetValue(sourceCardInstance.CardDefinitionId, out var sourceCardDefinition))
            {
                var effectWithIndex = sourceCardDefinition.Effects
                    .Select((effect, index) => new { Effect = effect, Index = index })
                    .FirstOrDefault(entry =>
                        entry.Effect.Timing == EffectTiming.WhenAttacking
                        && entry.Effect.IsOptional
                        && string.Equals(ResolveEffectKey(entry.Effect, entry.Index), instance.State.PendingAttackOptionalEffectId, StringComparison.Ordinal));

                if (effectWithIndex is not null)
                {
                    var arguments = new Dictionary<string, string>(StringComparer.Ordinal)
                    {
                        [ReactiveEffectExecutionConstants.ActiveEffectSpecIdArgument] = string.IsNullOrWhiteSpace(effectWithIndex.Effect.Id)
                            ? effectWithIndex.Effect.RuntimeEffectType.ToString()
                            : effectWithIndex.Effect.Id,
                    };

                    var singleEffectDefinition = CloneCardDefinitionWithSingleEffect(sourceCardDefinition, effectWithIndex.Effect);

                    var context = new GameCardEffectContext(
                        game: instance,
                        actingPlayer: new Player { Id = playerId },
                        sourceCardDefinition: singleEffectDefinition,
                        sourceCardInstance: sourceCardInstance,
                        arguments: arguments,
                        selectedTargets: []);

                    var executeResult = sequentialEffectExecutor.Execute(context);
                    if (executeResult.IsError)
                    {
                        throw new InvalidOperationException(executeResult.FirstError.Description);
                    }
                }
            }
        }

        var defenderPlayerId = instance.State.PendingAttackDefenderPlayerId;
        ClearPendingOptionalAttackEffectState(instance.State);
        EnterSupportCutInWindow(instance.State, defenderPlayerId);
    }

    private static bool TryParseResolveOptionalAttackEffectActionId(string actionId, out string sourceCardInstanceId, out string decision)
    {
        sourceCardInstanceId = string.Empty;
        decision = string.Empty;

        if (!actionId.StartsWith(ResolveOptionalAttackEffectActionPrefix, StringComparison.Ordinal))
        {
            return false;
        }

        var payload = actionId[ResolveOptionalAttackEffectActionPrefix.Length..].Trim();
        var delimiterIndex = payload.IndexOf(':');
        if (delimiterIndex <= 0 || delimiterIndex >= payload.Length - 1)
        {
            return false;
        }

        sourceCardInstanceId = payload[..delimiterIndex].Trim();
        decision = payload[(delimiterIndex + 1)..].Trim();
        return !string.IsNullOrWhiteSpace(sourceCardInstanceId)
            && (string.Equals(decision, "yes", StringComparison.Ordinal) || string.Equals(decision, "no", StringComparison.Ordinal));
    }

    private static void EnterSupportCutInWindow(GameState state, string defenderPlayerId)
    {
        state.Phase = GamePhase.ActionStep;
        state.PriorityPlayerId = defenderPlayerId;
        state.ConsecutivePasses = 0;
    }

    private static void ClearPendingOptionalAttackEffectState(GameState state)
    {
        state.PendingAttackOptionalEffectSourceCardInstanceId = string.Empty;
        state.PendingAttackOptionalEffectId = string.Empty;
        state.PendingAttackOptionalEffectPlayerId = string.Empty;
    }

    private static void ExecuteAutomaticWhenAttackingEffectsForSource(
        GameInstance instance,
        string actingPlayerId,
        Card sourceCardDefinition,
        CardInstance? sourceCardInstance,
        IGameSequentialEffectExecutor sequentialEffectExecutor)
    {
        foreach (var effectSpec in sourceCardDefinition.Effects)
        {
            if (effectSpec.Timing != EffectTiming.WhenAttacking || effectSpec.IsOptional)
            {
                continue;
            }

            var arguments = new Dictionary<string, string>(StringComparer.Ordinal)
            {
                [ReactiveEffectExecutionConstants.ActiveEffectSpecIdArgument] = string.IsNullOrWhiteSpace(effectSpec.Id)
                    ? effectSpec.RuntimeEffectType.ToString()
                    : effectSpec.Id,
            };

            // Sequential executor evaluates all effects on the supplied definition.
            // Wrap to a single effect so only this mandatory WhenAttacking effect auto-triggers.
            var singleEffectDefinition = CloneCardDefinitionWithSingleEffect(sourceCardDefinition, effectSpec);

            var context = new GameCardEffectContext(
                game: instance,
                actingPlayer: new Player { Id = actingPlayerId },
                sourceCardDefinition: singleEffectDefinition,
                sourceCardInstance: sourceCardInstance,
                arguments: arguments,
                selectedTargets: []);

            var executeResult = sequentialEffectExecutor.Execute(context);
            if (executeResult.IsError)
            {
                throw new InvalidOperationException(executeResult.FirstError.Description);
            }
        }
    }

    private static Card CloneCardDefinitionWithSingleEffect(Card sourceCardDefinition, EffectSpec effectSpec)
    {
        var clonedDefinition = sourceCardDefinition switch
        {
            LeaderCard leader => new LeaderCard
            {
                Life = leader.Life,
                RecoveryEffect = leader.RecoveryEffect,
            },
            CharacterCard character => new CharacterCard
            {
                Health = character.Health,
                SupportName = character.SupportName,
                SupportEffect = character.SupportEffect,
            },
            _ => new Card(),
        };

        clonedDefinition.Id = sourceCardDefinition.Id;
        clonedDefinition.Image = sourceCardDefinition.Image;
        clonedDefinition.OriginalId = sourceCardDefinition.OriginalId;
        clonedDefinition.MainAlternate = sourceCardDefinition.MainAlternate;
        clonedDefinition.Attribute = sourceCardDefinition.Attribute;
        clonedDefinition.Name = sourceCardDefinition.Name.ToList();
        clonedDefinition.DisplayName = sourceCardDefinition.DisplayName;
        clonedDefinition.Type = sourceCardDefinition.Type;
        clonedDefinition.Traits = sourceCardDefinition.Traits.ToList();
        clonedDefinition.Color = sourceCardDefinition.Color;
        clonedDefinition.Description = sourceCardDefinition.Description;
        clonedDefinition.MainEffect = sourceCardDefinition.MainEffect;
        clonedDefinition.Damage = sourceCardDefinition.Damage;
        clonedDefinition.Power = sourceCardDefinition.Power;
        clonedDefinition.CannotBeNormalSummoned = sourceCardDefinition.CannotBeNormalSummoned;
        clonedDefinition.Conditions = sourceCardDefinition.Conditions.ToList();
        clonedDefinition.Effects = [effectSpec];

        return clonedDefinition;
    }

    private static void ResolveLeaderAttack(GameInstance instance, CardInstance attacker, PlayerState defenderPlayer)
    {
        var leader = defenderPlayer.LeaderCardInstance
            ?? throw new InvalidOperationException("Defender leader is missing.");

        if (!instance.State.CardDefinitions.TryGetValue(attacker.CardDefinitionId, out var attackerDefinition))
        {
            throw new InvalidOperationException($"Card definition '{attacker.CardDefinitionId}' was not found.");
        }

        var attackDamage = attacker.DamageOverride ?? attackerDefinition.Damage;
        leader.CurrentLife = Math.Max(0, leader.CurrentLife - attackDamage);
    }

    private void ResolveCharacterAttack(
        GameInstance instance,
        CardInstance attacker,
        PlayerState defenderPlayer,
        CardInstance defender)
    {
        if (!instance.State.CardDefinitions.TryGetValue(attacker.CardDefinitionId, out var attackerDefinition))
        {
            throw new InvalidOperationException($"Card definition '{attacker.CardDefinitionId}' was not found.");
        }

        if (!instance.State.CardDefinitions.TryGetValue(defender.CardDefinitionId, out var defenderDefinition)
            || defenderDefinition is not CharacterCard defenderCharacterDefinition)
        {
            throw new InvalidOperationException($"Card definition '{defender.CardDefinitionId}' was not found or is not a character.");
        }

        var attackerPower = attacker.PowerOverride ?? attackerDefinition.Power;
        var defenderMaxHealth = defender.HealthOverride ?? defenderCharacterDefinition.Health;
        var defenderCurrentHealth = defender.CurrentHealth ?? defenderMaxHealth;
        var nextHealth = defenderCurrentHealth - attackerPower;
        defender.CurrentHealth = nextHealth;

        if (nextHealth > 0)
        {
            return;
        }

        runtimeDeckService.MoveCardToZone(
            instance,
            defenderPlayer.PlayerId,
            PlayerZone.CharacterField,
            PlayerZone.Trash,
            defender.InstanceId);
    }

    private static bool HasAnyMainPhaseLegalAction(GameInstance instance)
    {
        if (instance.State.Phase != GamePhase.MainPhase)
        {
            return true;
        }

        var activePlayer = instance.State.Players.FirstOrDefault(player =>
            IsSamePlayerId(player.PlayerId, instance.State.ActivePlayerId));
        if (activePlayer is null)
        {
            return false;
        }

        var hasHandAction = activePlayer.Hand.Any(card =>
        {
            if (!instance.State.CardDefinitions.TryGetValue(card.CardDefinitionId, out var definition))
            {
                return false;
            }

            if (definition.Type is CardType.Chakra or CardType.Summon or CardType.Leader)
            {
                return false;
            }

            if (definition.CannotBeNormalSummoned)
            {
                return CanSpecialSummonWithoutNormalSummon(definition) || IsSupportCapable(definition);
            }

            return instance.State.IsSummonCardReady(activePlayer.PlayerId) || IsSupportCapable(definition);
        });

        if (hasHandAction)
        {
            return true;
        }

        return activePlayer.Battlefield.Any(card => !card.IsRested && !card.IsExhausted);
    }

    private void ApplyPendingAttackResolutionIfNeeded(GameInstance instance, GamePhase previousPhase)
    {
        if (instance.State.Phase != GamePhase.AttackResolution)
        {
            return;
        }

        if (!instance.State.HasPendingAttack)
        {
            return;
        }

        // AttackResolution is the damage step in the current sequence model.
        ApplyPendingAttackDamage(instance);
    }

    private void ApplyPendingAttackDamage(GameInstance instance)
    {
        var attackerPlayer = instance.State.Players.FirstOrDefault(player =>
            player.Battlefield.Any(card => string.Equals(card.InstanceId, instance.State.PendingAttackAttackerInstanceId, StringComparison.Ordinal)));
        var attacker = attackerPlayer?.Battlefield.FirstOrDefault(card =>
            string.Equals(card.InstanceId, instance.State.PendingAttackAttackerInstanceId, StringComparison.Ordinal));

        if (attacker is null)
        {
            ClearPendingAttackState(instance.State);
            return;
        }

        var defenderPlayer = instance.State.Players.FirstOrDefault(player =>
            string.Equals(player.PlayerId, instance.State.PendingAttackDefenderPlayerId, StringComparison.Ordinal));
        if (defenderPlayer is null)
        {
            ClearPendingAttackState(instance.State);
            return;
        }

        var defenderZone = instance.State.PendingAttackDefenderZone;
        if (defenderZone == PlayerZone.Leader)
        {
            ResolveLeaderAttack(instance, attacker, defenderPlayer);
            ClearPendingAttackState(instance.State);
            return;
        }

        if (defenderZone != PlayerZone.CharacterField)
        {
            ClearPendingAttackState(instance.State);
            return;
        }

        var defender = defenderPlayer.Battlefield.FirstOrDefault(card =>
            string.Equals(card.InstanceId, instance.State.PendingAttackDefenderInstanceId, StringComparison.Ordinal));
        if (defender is null)
        {
            ClearPendingAttackState(instance.State);
            return;
        }

        ResolveCharacterAttack(instance, attacker, defenderPlayer, defender);
        ClearPendingAttackState(instance.State);
    }

    private static void ClearPendingAttackState(GameState state)
    {
        state.HasPendingAttack = false;
        state.PendingAttackDeclarationId = string.Empty;
        state.PendingAttackAttackerInstanceId = string.Empty;
        state.PendingAttackDefenderPlayerId = string.Empty;
        state.PendingAttackDefenderInstanceId = string.Empty;
        state.PendingAttackDefenderZone = null;
        ClearPendingOptionalAttackEffectState(state);
    }

    private static bool IsSupportEffectTimingAvailable(
        EffectTiming timing,
        GameState state,
        string actingPlayerId,
        bool isFromSupportZone)
    {
        var isActivePlayer = IsSamePlayerId(state.ActivePlayerId, actingPlayerId);
        var isPriorityPlayer = IsSamePlayerId(state.PriorityPlayerId, actingPlayerId);

        if (!isActivePlayer && !isFromSupportZone)
        {
            return false;
        }

        return timing switch
        {
            EffectTiming.Unspecified => isActivePlayer
                ? state.Phase is GamePhase.MainPhase or GamePhase.ActionStep
                : state.Phase is GamePhase.AttackDeclaration or GamePhase.BlockerDeclaration or GamePhase.ActionStep,
            EffectTiming.ActivateMain or EffectTiming.DuringYourMain =>
                isActivePlayer && state.Phase == GamePhase.MainPhase,
            EffectTiming.WhenAttacking =>
                isActivePlayer && state.HasPendingAttack && state.Phase == GamePhase.BlockerDeclaration,
            EffectTiming.YourTurn =>
                isActivePlayer,
            EffectTiming.Quick =>
                isActivePlayer
                    ? state.Phase == GamePhase.ActionStep && isPriorityPlayer
                    : state.HasPendingAttack && state.Phase == GamePhase.ActionStep && isPriorityPlayer,
            EffectTiming.SupportActivated =>
                state.Phase == GamePhase.ActionStep && isPriorityPlayer,
            EffectTiming.DuringOpponentAttack =>
                !isActivePlayer && state.HasPendingAttack && state.Phase == GamePhase.ActionStep,
            _ => false,
        };
    }

    private void AutoAdvanceMainPhaseIfNoLegalActions(GameInstance instance)
    {
        if (instance.GetPendingPrompt() is not null)
        {
            return;
        }

        if (!HasAnyMainPhaseLegalAction(instance))
        {
            phaseService.DeclareEndStep(instance);
            phaseService.AdvancePhase(instance);
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