using System.Reflection;
using System.Runtime.CompilerServices;
using System.Text.Json;
using Microsoft.VisualStudio.TestTools.UnitTesting;

namespace ProjectHiddenVillage.Server.Tests;

/// <summary>
/// Keeps the published action types and the client contract in step.
///
/// The server owns the allow-list and the client owns the wording, and nothing in one language can read the other's
/// constants. <c>client/src/views/game/actionLog.contract.json</c> is the meeting point: the client fails to compile
/// when a contract type has no wording template, and this test fails when the allow-list and the contract disagree -
/// so a new published type has to arrive with its client wording rather than silently falling back to neutral text.
/// </summary>
[TestClass]
public sealed class GameActionLogPublishingContractTests
{
    [TestMethod]
    public void PublishedActionTypes_MatchTheClientContract()
    {
        var contractActionTypes = ReadContractActionTypes();
        var publishedActionTypes = ReadPublishedActionTypeConstants();

        CollectionAssert.AreEquivalent(
            contractActionTypes,
            publishedActionTypes,
            "The published action types and the client contract disagree. Update "
            + "client/src/views/game/actionLog.contract.json and add the matching game.actionLog.event.* wording in the "
            + "same change as the server entry.");
    }

    [TestMethod]
    public void EveryPublishedActionType_IsDeclaredAsAConstant()
    {
        // The allow-list is built from the constants, so this pins the rule that a literal is never published by
        // accident: anything published has to be a named action type the client contract can refer to.
        var declaredActionTypes = typeof(GameActionLogActionTypes)
            .GetFields(BindingFlags.Public | BindingFlags.Static)
            .Where(field => field.IsLiteral && field.FieldType == typeof(string))
            .Select(field => (string)field.GetRawConstantValue()!)
            .ToHashSet(StringComparer.Ordinal);

        foreach (var actionType in ReadPublishedActionTypeConstants())
        {
            Assert.IsTrue(
                declaredActionTypes.Contains(actionType),
                $"Published action type '{actionType}' is not declared on {nameof(GameActionLogActionTypes)}.");
        }
    }

    private static List<string> ReadPublishedActionTypeConstants()
    {
        return typeof(GameActionLogActionTypes)
            .GetFields(BindingFlags.Public | BindingFlags.Static)
            .Where(field => field.IsLiteral && field.FieldType == typeof(string))
            .Select(field => (string)field.GetRawConstantValue()!)
            .Where(GameActionLogPublishing.IsPublished)
            .Distinct(StringComparer.Ordinal)
            .OrderBy(actionType => actionType, StringComparer.Ordinal)
            .ToList();
    }

    private static List<string> ReadContractActionTypes([CallerFilePath] string sourceFilePath = "")
    {
        var contractPath = Path.Combine(
            ResolveRepositoryRoot(sourceFilePath),
            "client",
            "src",
            "views",
            "game",
            "actionLog.contract.json");

        Assert.IsTrue(File.Exists(contractPath), $"The client action-log contract is missing: {contractPath}");

        using var document = JsonDocument.Parse(File.ReadAllText(contractPath));

        Assert.IsTrue(
            document.RootElement.TryGetProperty("publishedActionTypes", out var publishedActionTypes),
            "The client action-log contract has no publishedActionTypes array.");

        return publishedActionTypes
            .EnumerateArray()
            .Select(entry => entry.GetString() ?? string.Empty)
            .Where(actionType => !string.IsNullOrWhiteSpace(actionType))
            .Distinct(StringComparer.Ordinal)
            .OrderBy(actionType => actionType, StringComparer.Ordinal)
            .ToList();
    }

    /// <summary>
    /// Walks up from this file's compile-time path rather than relying on the test runner's working directory, which
    /// differs between `dotnet test` from the repository root and from a single project.
    /// </summary>
    private static string ResolveRepositoryRoot(string sourceFilePath)
    {
        var directory = new DirectoryInfo(Path.GetDirectoryName(sourceFilePath)!);

        while (directory is not null && !Directory.Exists(Path.Combine(directory.FullName, "client")))
        {
            directory = directory.Parent;
        }

        Assert.IsNotNull(directory, $"Could not find the repository root above '{sourceFilePath}'.");
        return directory!.FullName;
    }
}
