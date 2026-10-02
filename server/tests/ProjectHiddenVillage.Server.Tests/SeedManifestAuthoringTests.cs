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
                    || node.SelectionPromptKind != dumpNode.SelectionPromptKind)
                {
                    mismatches.Add(
                        $"{card.CardId}/{node.Id}: manifest flow={node.ExecutionFlowMode} timing={node.SelectionTiming} "
                        + $"kind={node.SelectionPromptKind} vs dump flow={dumpNode.ExecutionFlowMode} "
                        + $"timing={dumpNode.SelectionTiming} kind={dumpNode.SelectionPromptKind}");
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

    private sealed record SeedCatalogEntryDefinition(string CardId, IReadOnlyList<EffectSpec> Effects);

    private sealed record RawCatalogDumpEntry(string Id, IReadOnlyList<EffectSpec> Effects);
}
