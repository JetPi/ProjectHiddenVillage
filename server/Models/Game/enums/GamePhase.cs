namespace ProjectHiddenVillage.Server;

public enum GamePhase
{
    ChooseStartingPlayer,
    DrawInitialHand,
    Mulligan,
    RefreshPhase,
    StartOfMainPhase,
    DrawPhase,
    MainPhase,
    AttackDeclaration,
    BlockerDeclaration,
    ActionStep,
    AttackResolution,
    BattleEndStep,
    EndStep
}

public enum PhaseAdvanceMode
{
    ManualOnly,
    AutoAdvanceWhenNoPriority,
    AutoAdvanceImmediately
}

/// <summary>
/// What a client has to show for a phase the engine entered on its own (see PhaseAdvanceMode). It is what
/// the phase-presentation handshake is about: the engine stops after such a phase and waits for its
/// acknowledgement from every connected participant (see <c>plans/server-owned-phase-transitions.md</c>).
///
/// <see cref="None"/> means the transition changed nothing a client animates, so the engine keeps walking
/// without stopping - which is also why a phase can be marked AutoAdvanceImmediately and still present
/// nothing when its entry produced no change (an empty deck draws nothing).
/// </summary>
public enum PhasePresentationKind
{
    None,
    /// <summary>The opening deal: cards travelling deck to hand.</summary>
    InitialDeal,
    /// <summary>Cards standing up in the refresh phase (battlefield cards and the leader).</summary>
    Ready,
    /// <summary>The per-turn draw.</summary>
    Draw,
    /// <summary>The damage step: damage applied and cards leaving the field for the trash.</summary>
    Damage,
    /// <summary>The battle closing: the attack state and its visuals clear.</summary>
    BattleEnd,
    /// <summary>The turn boundary: temporary damage resets and the active player changes.</summary>
    TurnEnd,
}

public enum PhaseDirectiveType
{
    SkipPhase,
    JumpToPhase
}
