using System.Text.Json;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using ProjectHiddenVillage.Server.Api.Serialization;

namespace ProjectHiddenVillage.Server.Tests;

/// <summary>
/// <c>test-data/seed-profiles.json</c> is the only hand-authored card source and <c>server/Api/rawCardCatalogDump.txt</c>
/// is the real catalogue it is regenerated from, so both have to keep satisfying the authoring contract the admin
/// editor enforces (<see cref="UpdateCardEffectsRequestValidator"/>). These tests are the guard for the drift that
/// silently dropped N-012's authored Prompted split: the dump is not read at runtime, so nothing else would notice.
/// </summary>
[TestClass]
public sealed class SeedManifestAuthoringTests
{
    private static readonly JsonSerializerOptions ManifestSerializerOptions = CreateManifestSerializerOptions();

    [TestMethod]
    public void EverySeededCard_PassesTheEffectAuthoringContract()
    {
        var manifest = LoadManifest();
        var validator = new UpdateCardEffectsRequestValidator();
        var failures = new List<string>();

        foreach (var card in manifest.CatalogEntries)
        {
            var request = new UpdateCardEffectsRequest(
                Conditions: null,
                Effects: card.Effects,
                Description: null,
                SupportEffect: null);
            var result = validator.Validate(request);

            foreach (var error in result.Errors)
            {
                failures.Add($"{card.CardId} ({error.PropertyName}): {error.ErrorMessage}");
            }
        }

        Assert.AreEqual(0, failures.Count, string.Join(Environment.NewLine, failures));
    }

    // The three [On Summon] chains that only work when the node asks mid-chain: a summoned card's own chain has
    // no action chip to collect the pick, so `Upfront` resolves no targets and silently skips the effect.
    [DataTestMethod]
    [DataRow("N-003", "on-summon-effect", "SummonFromZone")]
    [DataRow("N-005", "on-summon", "SummonFromZone")]
    [DataRow("N-014", "on-summon", "DestroyFromZone")]
    public void PromptedOnSummonEffects_AskMidChainInsteadOfResolvingUpfront(string cardId, string nodeId, string selectionPromptKind)
    {
        var node = LoadManifest().CatalogEntries
            .Single(card => card.CardId == cardId).Effects
            .Single(effect => effect.Id == nodeId);

        Assert.AreEqual(EffectSelectionTiming.Prompted, node.SelectionTiming, $"{cardId}/{nodeId} must defer its selection");
        Assert.AreNotEqual(
            EffectExecutionFlowMode.AtomicChain,
            node.ExecutionFlowMode,
            $"{cardId}/{nodeId} must run per step: an atomic chain cannot suspend for a prompt");
        Assert.AreEqual(selectionPromptKind, node.SelectionPromptKind.ToString(), $"{cardId}/{nodeId} selection bucket");
    }

    // A card that prints "[On Summon]" must actually carry an On Summon-timed node: the trigger runner
    // (GameTriggeredEffectRunner.ExecuteAutomaticTimedEffects) dispatches purely on `Timing`, so a
    // `[On Summon]` chain authored with any other timing never fires when the card lands. N-022 (Manda) was
    // authored that way - its reveal node carried `Quick`, so the top card was never revealed on summon.
    [TestMethod]
    public void CardsWithAnOnSummonCondition_HaveAMandatoryOnSummonTimedNode()
    {
        var offenders = LoadManifest().CatalogEntries
            .Where(card => card.Conditions is not null
                && card.Conditions.Contains(EffectConditionKeywords.OnSummon, StringComparer.Ordinal))
            .Where(card => !card.Effects.Any(effect =>
                effect.Timing == EffectTiming.OnSummon && !effect.IsOptional))
            .Select(card => card.CardId)
            .ToList();

        Assert.AreEqual(
            0,
            offenders.Count,
            $"Cards printing '[On Summon]' without a mandatory On Summon-timed effect: {string.Join(", ", offenders)}");
    }

    // A card that prints "during this turn" scopes its buff to the turn boundary, and the engine only honours a
    // turn boundary through a dispellable duration: ModifyAttributeEffect / GainKeywordEffect / FreezeCardEffect /
    // LockChakraRecoveryEffect write their *permanent* form (`PowerOverride`, `RuntimeKeywords`, ...) whenever
    // `CardRuntimeEffectStateService.IsDurationSupportedForAttributes` says no, which is only ever `Instant`, and
    // `CompleteEndStep` dispels registered temporary effects only. N-002 (Choji) was authored that way, so its
    // "the chosen card's power is doubled during this turn" wrote `PowerOverride` and survived every later turn.
    // `Instant` stays right for a node with no printed turn scope (a permanent buff, a one-shot life/chakra
    // change), and a passive node is engine-driven and carries no duration of its own - both are out of scope.
    [TestMethod]
    public void CardsThatPrintATurnScopedBuff_UseADispellableDuration()
    {
        var offenders = LoadManifest().CatalogEntries
            .Where(card => card.Description?.Contains("during this turn", StringComparison.OrdinalIgnoreCase) == true)
            .SelectMany(card => card.Effects
                .Where(node => node.PassiveMode == PassiveMode.None
                    && node.DurationMode == EffectDurationMode.Instant
                    && node.RuntimeEffectType is RuntimeEffects.ChangeValues
                        or RuntimeEffects.GainEffect
                        or RuntimeEffects.FreezeCard
                        or RuntimeEffects.LockChakraRecovery)
                .Select(node => $"{card.CardId}/{node.Id} ({node.RuntimeEffectType})"))
            .ToList();

        Assert.AreEqual(
            0,
            offenders.Count,
            "A node that prints a turn scope must not be Instant:"
                + Environment.NewLine
                + string.Join(Environment.NewLine, offenders));
    }

    [TestMethod]
    public void AuthoredNodesInTheManifest_KeepTheirShapeInTheRawDump()
    {
        var root = FindRepositoryRoot();
        var dump = LoadJson<IReadOnlyList<RawCatalogDumpEntry>>(Path.Combine(root, "server", "Api", "rawCardCatalogDump.txt"));
        var dumpById = dump.ToDictionary(entry => entry.Id, StringComparer.Ordinal);
        var mismatches = new List<string>();

        foreach (var card in LoadManifest().CatalogEntries)
        {
            // The dump only holds the real catalogue; the manifest also carries test fixtures (T-*).
            if (!dumpById.TryGetValue(card.CardId, out var dumpCard))
            {
                continue;
            }

            var dumpNodesById = dumpCard.Effects.ToDictionary(effect => effect.Id, StringComparer.Ordinal);

            foreach (var node in card.Effects)
            {
                if (!dumpNodesById.TryGetValue(node.Id, out var dumpNode))
                {
                    mismatches.Add($"{card.CardId}: the dump is missing the authored node '{node.Id}'");
                    continue;
                }

                if (node.ExecutionFlowMode != dumpNode.ExecutionFlowMode
                    || node.SelectionTiming != dumpNode.SelectionTiming
                    || node.SelectionPromptKind != dumpNode.SelectionPromptKind
                    || node.DurationMode != dumpNode.DurationMode)
                {
                    mismatches.Add(
                        $"{card.CardId}/{node.Id}: manifest flow={node.ExecutionFlowMode} timing={node.SelectionTiming} "
                        + $"kind={node.SelectionPromptKind} duration={node.DurationMode} vs dump "
                        + $"flow={dumpNode.ExecutionFlowMode} timing={dumpNode.SelectionTiming} "
                        + $"kind={dumpNode.SelectionPromptKind} duration={dumpNode.DurationMode}");
                }
            }
        }

        Assert.AreEqual(0, mismatches.Count, string.Join(Environment.NewLine, mismatches));
    }

    private static SeedManifestDefinition LoadManifest()
    {
        return LoadJson<SeedManifestDefinition>(
            Path.Combine(FindRepositoryRoot(), "test-data", "seed-profiles.json"));
    }

    private static TValue LoadJson<TValue>(string path)
    {
        var value = JsonSerializer.Deserialize<TValue>(File.ReadAllText(path), ManifestSerializerOptions);

        Assert.IsNotNull(value, $"{path} could not be parsed");

        return value;
    }

    private static JsonSerializerOptions CreateManifestSerializerOptions()
    {
        var options = new JsonSerializerOptions(JsonSerializerDefaults.Web);
        options.Converters.Add(new FlexibleEnumJsonConverterFactory());
        return options;
    }

    private static string FindRepositoryRoot()
    {
        var current = new DirectoryInfo(AppContext.BaseDirectory);

        while (current is not null)
        {
            if (File.Exists(Path.Combine(current.FullName, "test-data", "seed-profiles.json"))
                && File.Exists(Path.Combine(current.FullName, "server", "Api", "rawCardCatalogDump.txt")))
            {
                return current.FullName;
            }

            current = current.Parent;
        }

        throw new InvalidOperationException($"Unable to locate the repository root from '{AppContext.BaseDirectory}'.");
    }

    private sealed record SeedManifestDefinition(IReadOnlyList<SeedCatalogEntryDefinition> CatalogEntries);

    private sealed record SeedCatalogEntryDefinition(
        string CardId,
        IReadOnlyList<string>? Conditions,
        IReadOnlyList<EffectSpec> Effects,
        string? Description);

    private sealed record RawCatalogDumpEntry(string Id, IReadOnlyList<EffectSpec> Effects);
}
