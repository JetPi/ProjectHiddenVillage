namespace ProjectHiddenVillage.Server.Api.Services.Games;

public static class ReactiveEffectExecutionConstants
{
    public const string SkipReactiveOrchestrationArgument = "__skipReactiveOrchestration";

    public const string ExpectedTriggerTargetIdsArgument = "__expectedTriggerTargetIds";

    public const string ActiveEffectSpecIdArgument = "__activeEffectSpecId";

    public const string SupportActivationChakraCostArgument = "__supportActivationChakraCost";

    /// <summary>
    /// Set on a deferred support activation replay: the chakra was already spent when the player
    /// activated the card, so the sequential executor must not charge it again.
    /// </summary>
    public const string ActivationCostPaidArgument = "__activationCostPaid";

    public const string EnforceTargetCountArgument = "__enforceTargetCount";

    public const string RevealedTargetIdsArgument = "revealedTargetIds";

    public const string RevealedPrimaryTargetIdArgument = "revealedPrimaryTargetId";
}