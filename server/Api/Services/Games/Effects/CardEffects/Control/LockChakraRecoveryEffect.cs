using ErrorOr;
using Microsoft.Extensions.DependencyInjection;
using ProjectHiddenVillage.Server.Api.Interfaces.Game;

namespace ProjectHiddenVillage.Server.Api.Services.Games;

/// <summary>
/// "You cannot turn your CHAKRA face-up" (N-016): a player-scoped chakra recovery lock with a duration.
///
/// The node declares no card targets - the affected players come from the effect's
/// <see cref="EffectSpec.TargetRange"/> (<c>Self</c> / <c>Opponent</c> / <c>Any</c>), so one node can lock
/// the activator, the opponent, or both. While the lock lasts, the affected player's chakra cannot be
/// turned face-up, which is what the leader's Recovery effect (and every other chakra flip-up) checks
/// before resolving - the resource pool can only go down.
///
/// This is deliberately separate from the card-level <c>FreezeCard</c> keyword and from the
/// <c>Alter Resources</c> face-state locks: it restricts a *player*, not a card.
/// </summary>
public sealed class LockChakraRecoveryEffect(
    IGameRuntimeEffectSpecResolver effectSpecResolver,
    IGameEffectCanExecuteEvaluator canExecuteEvaluator,
    IServiceProvider? serviceProvider = null) : IGameCardEffect
{
    private readonly IGameRuntimeEffectSpecResolver effectSpecResolver = effectSpecResolver;
    private readonly IGameEffectCanExecuteEvaluator canExecuteEvaluator = canExecuteEvaluator;
    private readonly IServiceProvider? serviceProvider = serviceProvider;

    public const string EffectKey = "LockChakraRecovery";

    public string EffectTypeKey => EffectKey;

    public CanExecuteResult CanExecute(GameCardEffectContext context)
    {
        var effectSpec = effectSpecResolver.Resolve(context, RuntimeEffects.LockChakraRecovery);
        if (effectSpec is null)
        {
            return new CanExecuteResult
            {
                CanExecute = false,
                FailedConditions = ["LockChakraRecovery effect is not defined on the source card."],
            };
        }

        if (!CardRuntimeEffectStateService.IsDurationSupportedForChakraRecoveryLocks(effectSpec.DurationMode))
        {
            return new CanExecuteResult
            {
                CanExecute = false,
                FailedConditions = ["LockChakraRecovery requires a temporary duration mode."],
            };
        }

        if (EffectTargetRangePlayers.Resolve(context.Game.State, context.ActingPlayer.Id, effectSpec.TargetRange).Count == 0)
        {
            return new CanExecuteResult
            {
                CanExecute = false,
                FailedConditions = ["LockChakraRecovery has no player to lock."],
            };
        }

        return canExecuteEvaluator.Evaluate(context, effectSpec, includeValidTargets: false);
    }

    /// <summary>The lock is player-scoped, so it never publishes card targets.</summary>
    public IReadOnlyList<GameEffectTargetReference> GetValidTargets(GameCardEffectContext context)
    {
        return [];
    }

    public ErrorOr<Success> Execute(GameCardEffectContext context, IReadOnlyList<GameEffectTargetReference> selectedTargets)
    {
        var effectSpec = effectSpecResolver.Resolve(context, RuntimeEffects.LockChakraRecovery);
        if (effectSpec is null)
        {
            return Error.Validation(
                code: "Game.Effect.LockChakraRecovery.MissingEffectSpec",
                description: "LockChakraRecovery effect is not defined on the source card.");
        }

        if (!CardRuntimeEffectStateService.IsDurationSupportedForChakraRecoveryLocks(effectSpec.DurationMode))
        {
            return Error.Validation(
                code: "Game.Effect.LockChakraRecovery.DurationNotSupported",
                description: "LockChakraRecovery requires a temporary duration mode.");
        }

        if (context.SourceCardInstance is null)
        {
            return Error.Validation(
                code: "Game.Effect.LockChakraRecovery.SourceMissing",
                description: "LockChakraRecovery requires a source card instance.");
        }

        var targetPlayers = EffectTargetRangePlayers.Resolve(
            context.Game.State,
            context.ActingPlayer.Id,
            effectSpec.TargetRange);

        if (targetPlayers.Count == 0)
        {
            return Error.Validation(
                code: "Game.Effect.LockChakraRecovery.NoTargetPlayers",
                description: "LockChakraRecovery has no player to lock.");
        }

        foreach (var player in targetPlayers)
        {
            CardRuntimeEffectStateService.AddTemporaryChakraRecoveryLockEffect(
                context.Game.State,
                context.SourceCardInstance,
                effectSpec.Id,
                player.PlayerId,
                effectSpec.DurationMode);
        }

        var affectedPlayerIds = new HashSet<string>(
            targetPlayers.Select(player => player.PlayerId),
            StringComparer.Ordinal)
        {
            context.ActingPlayer.Id,
        };

        var mutationResult = EmitMutation(context, affectedPlayerIds);
        if (mutationResult.IsError)
        {
            return mutationResult.Errors;
        }

        return Result.Success;
    }

    private ErrorOr<Success> EmitMutation(GameCardEffectContext context, IReadOnlyCollection<string> affectedPlayerIds)
    {
        if (context.Arguments.TryGetValue(ReactiveEffectExecutionConstants.SkipReactiveOrchestrationArgument, out var skipValue)
            && bool.TryParse(skipValue, out var shouldSkip)
            && shouldSkip)
        {
            return Result.Success;
        }

        var reactiveEffectOrchestrator = serviceProvider?.GetService<IGameReactiveEffectOrchestrator>();
        if (reactiveEffectOrchestrator is null)
        {
            return Result.Success;
        }

        var mutationEvent = new GameMutationEvent
        {
            Kind = GameMutationKind.EffectResolved,
            GameId = context.Game.State.GameId,
            ActingPlayerId = context.ActingPlayer.Id,
            TurnNumber = context.Game.State.TurnNumber,
            Phase = context.Game.State.Phase,
            AffectedPlayerIds = affectedPlayerIds.ToList(),
        };

        var orchestrationResult = reactiveEffectOrchestrator.ApplyPostMutationEffects(context.Game, mutationEvent, context.ActingPlayer.Id);
        return orchestrationResult.IsError ? orchestrationResult.Errors : Result.Success;
    }
}
