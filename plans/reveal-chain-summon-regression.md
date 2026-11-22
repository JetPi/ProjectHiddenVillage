# A successful reveal stops summoning the card it turned over

Report: N-019 (Jugo) — *"[When Attacking] Reveal the top card of your deck, and if the revealed card is
[Sasuke Uchiha] or a [The Taka] type card other than an EX Character, summon that card."* The reveal presents
and the post-condition passes, but nothing is summoned. The reveal and summon ("deploy") chains in the live
catalogue behave the same way.

## Root cause

Two shapes exist for "the branch step acts on the card the reveal turned over", and only one of them survived
[`dd55166`](server/Api/Services/Games/Effects/Execution/GameSequentialEffectExecutor.cs:76):

| shape | authored as | worked before the regression? |
| --- | --- | --- |
| slot handoff | branch step is `Chain Targets` + `chainTargetSlotName: revealed` | yes - reads the reveal's published slot from the chain arguments |
| selection handoff | branch step is `Selected Targets`, no rules, no slot name | **no** - it relied on the reveal's selection being handed to it on resume |

`dd55166` fixed a real bug: a reveal presentation acknowledgement is not a target selection, so resuming with
the revealed cards silenced a branch step that has to ask its own question (N-013's "Choose 1 Leader or
Character: Reveal the top card of your deck, and if it has the [Uchiha Clan] type, ..."). The fix made every
reveal acknowledgement resume with an **empty** selection:

```csharp
var selectedTargets = isRevealPresentationAcknowledgement
    ? []
    : selection.Count > 0
        ? selection
        : continuation.SelectedTargets;
```

That also took the selection handoff away from a step that never asks. `ResolveSelectedTargets` then had
nothing to hand back:

```csharp
if (context.SelectedTargets.Count > 0) { return context.SelectedTargets; }
// no rules to auto-resolve: no targets, so the step is a silent no-op
return [];
```

The shipped N-019 entry in the live catalogue is authored in the selection shape
(`executionTargetSource: Selected Targets`, `chainTargetSlotName: null`), while the imported reference data and
`test-data/seed-profiles.json` use the slot shape (`Chain Targets` / `chainTargetSlotName: revealed`). So the
seeded card worked and the live one did not.

## Why the tests missed it

The existing coverage used the **slot** shape for the branch step, which never went through the resume
handoff:

- [`InMemoryGameInstanceRegistryWhenAttackingTests.CreateSummonEffect()`](server/tests/ProjectHiddenVillage.Server.Tests/InMemoryGameInstanceRegistryWhenAttackingTests.cs:369)
  builds the branch step as `ChainTargets` + `ChainTargetSlotName = "revealed"`.
- [`GameSequentialEffectExecutorTests`](server/tests/ProjectHiddenVillage.Server.Tests/GameSequentialEffectExecutorTests.cs:1985)
  even pins the opposite: `Execute_ChainedStepWithoutItsOwnTargets_NoLongerActsOnTheRevealedCard` asserts the
  selection shape resolves nothing - but only for a chain that never suspends, so it never exercised the
  resume path the live card depends on.

Nothing asserted "reveal the top card, acknowledge, and the branch step that takes the chain's selection
summons it", which is the shape the live authoring produces.

## Fix

`Resume` still never answers a node that asks, but it keeps the reveal's selection for a node that does not:

```csharp
var resumeNodeKeepsTheChainSelection = resumeNodeEffectSpec is not null
    && resumeNodeEffectSpec.ExecutionTargetSource == EffectExecutionTargetSource.SelectedTargets
    && resumeNodeEffectSpec.SelectionTiming != EffectSelectionTiming.Prompted
    && !resumeNodeEffectSpec.TargetRules.AutoSelectAllValidTargets;

selectedTargets = isRevealPresentationAcknowledgement
    ? (resumeNodeKeepsTheChainSelection ? continuation.SelectedTargets : [])
    : (selection.Count > 0 ? selection : continuation.SelectedTargets);
```

`continuation.SelectedTargets` is the selection the reveal step acted on, i.e. the revealed cards - so the
selection shape now resumes with exactly what it used to receive, while a `Prompted` node still starts empty
and asks (N-013), and a `Chain Targets` node is unaffected either way (N-022).

## Guards

- [`InMemoryGameInstanceRegistryWhenAttackingTests`](server/tests/ProjectHiddenVillage.Server.Tests/InMemoryGameInstanceRegistryWhenAttackingTests.cs:110):
  the shipped shape end to end - attack, present the reveal, acknowledge, and the revealed `card-1` lands on
  the battlefield; plus the failing post-condition case, which must still only reveal.
- [`GameSequentialEffectExecutorTests`](server/tests/ProjectHiddenVillage.Server.Tests/GameSequentialEffectExecutorTests.cs:2050):
  the resume rule directly - a `Selected Targets`/`Upfront` branch node receives the revealed card, and a
  `Prompted` branch node is handed nothing and asks instead.
- `dotnet test`: 1126 passed (1122 + 4).

## Authoring contract (both shapes, one preferred)

- Preferred: the branch step names the reveal's slot - `executionTargetSource: Chain Targets`,
  `chainTargetSlotName: <the reveal's targetSlotName>`. It survives the suspension as a chain argument and is
  independent of resume semantics.
- Also supported: a branch step with `Selected Targets`, no target rules and `selectionTiming: Upfront`.
  It resumes with the cards the reveal acted on. This is what the live N-019 save looks like.
- Never: `Selected Targets` + `selectionTiming: Prompted` for a step that acts on a revealed card - a prompted
  step asks its own question, so it must own target rules.

## Found while investigating (out of scope)

[`BuildAtomicExecutionPlan()`](server/Api/Services/Games/Effects/Execution/GameSequentialEffectExecutor.cs:496)
never handles `SelectionTiming == Prompted`: inside an `Atomic Chain` a prompted node executes immediately with
whatever selection it has (or none) instead of asking. No shipped card uses that combination today - every
prompted node lives in a `Per Step` chain - and `SelectionPromptKind` is authored per node, so it is a live
trap for the next card that mixes them. A guard test or a validator rejection would be the cheap way to keep it
unreachable.
