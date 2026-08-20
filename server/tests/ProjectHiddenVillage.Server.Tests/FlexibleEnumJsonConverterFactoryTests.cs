using System.Text.Json;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using ProjectHiddenVillage.Server.Api.Serialization;

namespace ProjectHiddenVillage.Server.Tests;

[TestClass]
public sealed class FlexibleEnumJsonConverterFactoryTests
{
    [TestMethod]
    public void Deserialize_UpdateCardEffectsRequest_AcceptsReadableEnumStrings()
    {
        var json = """
            {
              "effects": [
                {
                  "id": "effect-1",
                  "runtimeEffectType": "change-values",
                  "effectType": "support",
                  "timing": "Activate Main",
                  "targetRange": "opponent",
                  "isOptional": false,
                  "chakraCost": 1,
                  "globalRestrictions": "once_per_turn",
                  "passiveMode": "triggered",
                  "executionTargetSource": "source-card",
                  "passiveReevaluation": {
                    "triggerKinds": ["stats changed", "any"],
                    "scope": "source_card_only"
                  },
                  "passiveConsequences": [
                    {
                      "consequenceEffectTypeKey": "DestroyCard",
                      "targetPolicy": "trigger-selected-targets",
                      "consequenceArguments": {
                        "reason": "test"
                      }
                    }
                  ],
                  "attributeModifications": [
                    {
                      "targetType": "selected targets",
                      "targetRange": "any",
                      "attribute": "card health",
                      "operation": "add",
                      "value": 2
                    }
                  ],
                  "keywordModifications": [
                    {
                      "targetType": "source card",
                      "operation": "add",
                      "keyword": "Rush"
                    }
                  ],
                  "contextRules": [],
                  "targetRules": {
                    "operator": "any",
                    "rules": [
                      {
                        "scope": "opponent",
                        "inZone": "character field",
                        "restriction": {
                          "matchMode": "all"
                        }
                      }
                    ]
                  }
                }
              ]
            }
            """;

        var request = JsonSerializer.Deserialize<UpdateCardEffectsRequest>(json, CreateOptions());

        Assert.IsNotNull(request);
        Assert.IsNotNull(request.Effects);
        Assert.AreEqual(1, request.Effects.Count);

        var effect = request.Effects[0];
        Assert.AreEqual(RuntimeEffects.ChangeValues, effect.RuntimeEffectType);
        Assert.AreEqual(EffectKind.Support, effect.EffectType);
        Assert.AreEqual(EffectTiming.ActivateMain, effect.Timing);
        Assert.AreEqual(EffectTargetRange.Opponent, effect.TargetRange);
        Assert.AreEqual(EffectRestrictions.OncePerTurn, effect.GlobalRestrictions);
        Assert.AreEqual(PassiveMode.Triggered, effect.PassiveMode);
        Assert.AreEqual(EffectExecutionTargetSource.SourceCard, effect.ExecutionTargetSource);
        Assert.AreEqual(PassiveTriggerKind.StatsChanged, effect.PassiveReevaluation!.TriggerKinds[0]);
        Assert.AreEqual(PassiveReevaluationScope.SourceCardOnly, effect.PassiveReevaluation.Scope);
        Assert.AreEqual(PassiveConsequenceTargetPolicy.TriggerSelectedTargets, effect.PassiveConsequences[0].TargetPolicy);
        Assert.AreEqual(AttributeModificationTargetType.SelectedTargets, effect.AttributeModifications[0].TargetType);
        Assert.AreEqual(EffectTargetRange.Any, effect.AttributeModifications[0].TargetRange);
        Assert.AreEqual(EffectAttributeType.CardHealth, effect.AttributeModifications[0].Attribute);
        Assert.AreEqual(KeywordModificationTargetType.SourceCard, effect.KeywordModifications[0].TargetType);
        Assert.AreEqual(RequirementGroupOperator.Any, effect.TargetRules.Operator);
        Assert.AreEqual(PlayerZone.CharacterField, effect.TargetRules.Rules[0].InZone);
        Assert.AreEqual(ZoneRestrictionMatchMode.All, effect.TargetRules.Rules[0].Restriction.MatchMode);
    }

    [TestMethod]
    public void Deserialize_UpdateCardEffectsRequest_AcceptsNumericStringsForEnums()
    {
        var json = """
            {
              "effects": [
                {
                  "id": "effect-2",
                  "runtimeEffectType": "3",
                  "effectType": "1",
                  "timing": "1",
                  "targetRange": "1",
                  "isOptional": false,
                  "globalRestrictions": "0",
                  "contextRules": [],
                  "targetRules": {
                    "operator": "1",
                    "rules": []
                  }
                }
              ]
            }
            """;

        var request = JsonSerializer.Deserialize<UpdateCardEffectsRequest>(json, CreateOptions());

        Assert.IsNotNull(request);
        Assert.IsNotNull(request.Effects);
        Assert.AreEqual(RuntimeEffects.ChangeValues, request.Effects[0].RuntimeEffectType);
        Assert.AreEqual(EffectKind.Support, request.Effects[0].EffectType);
        Assert.AreEqual(EffectTiming.ActivateMain, request.Effects[0].Timing);
        Assert.AreEqual(EffectTargetRange.Opponent, request.Effects[0].TargetRange);
        Assert.AreEqual(EffectRestrictions.None, request.Effects[0].GlobalRestrictions);
        Assert.AreEqual(RequirementGroupOperator.Any, request.Effects[0].TargetRules.Operator);
    }

      [TestMethod]
      public void Deserialize_UpdateCardEffectsRequest_ParsesCannotBeNormalSummoned()
      {
        var json = """
          {
            "cannotBeNormalSummoned": true
          }
          """;

        var request = JsonSerializer.Deserialize<UpdateCardEffectsRequest>(json, CreateOptions());

        Assert.IsNotNull(request);
        Assert.IsTrue(request.CannotBeNormalSummoned);
      }

    private static JsonSerializerOptions CreateOptions()
    {
        var options = new JsonSerializerOptions(JsonSerializerDefaults.Web);
        options.Converters.Add(new FlexibleEnumJsonConverterFactory());
        return options;
    }
}