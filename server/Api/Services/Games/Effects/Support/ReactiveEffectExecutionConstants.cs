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

    /// <summary>
    /// Names the ability an execution belongs to - the <c>{effectKey}</c> of
    /// <c>leader-effect:{instanceId}:{effectKey}</c> or <c>character-ability:{instanceId}:{effectKey}</c>.
    /// A card can hold several independent abilities, so the sequential executor must start at the requested
    /// effect's node instead of always walking the first non-subordinate one.
    /// </summary>
    public const string AbilityKeyArgument = "__abilityKey";


    public const string RevealedTargetIdsArgument = "revealedTargetIds";

    public const string RevealedPrimaryTargetIdArgument = "revealedPrimaryTargetId";

    /// <summary>
    /// Card instance ids of the selection the running chain was started with (an activation's selection, or the
    /// answer to a "Choose 1 Leader or Character" step the chain resumes at). A
    /// <see cref="EffectExecutionTargetSource.ChainTargets"/> step with no named slot reads this instead of asking
    /// again, which is what lets a chain choose first and resolve later (N-013).
    /// </summary>
    public const string ChainSelectedTargetIdsArgument = "__chainSelectedTargetIds";

    /// <summary>
    /// Prefix of the argument under which a step that declares
    /// <see cref="EffectSpec.TargetSlotName"/> publishes the card instance ids it resolved, so later steps of the
    /// same chain can execute against exactly those targets
    /// (<see cref="EffectExecutionTargetSource.ChainTargets"/> + <see cref="EffectSpec.ChainTargetSlotName"/>).
    /// </summary>
    public const string ChainTargetSlotArgumentPrefix = "__chainTargetSlot:";

    /// <summary>
    /// The single option of a reveal presentation prompt: acknowledging it is not a choice, it only tells the
    /// suspended chain that the player has seen the revealed card and it may carry on.
    /// </summary>
    public const string RevealPresentedOption = "__reveal-presented";
}