using ProjectHiddenVillage.Server.Data.Entities;
using System.Text.Json;
using ProjectHiddenVillage.Server.Api.Interfaces.Game;

namespace ProjectHiddenVillage.Server;

public sealed class GameRuntimeDeckService(IGameEffectHandlingService gameEffectHandlingService) : IGameRuntimeDeckService
{
	private static readonly JsonSerializerOptions SerializerOptions = new(JsonSerializerDefaults.Web);

	public Card ToRuntimeCard(CardCatalogEntry entry)
	{
		var names = DeserializeOrDefault<List<string>>(entry.NameJson, []);
		var traits = DeserializeOrDefault<List<string>>(entry.TraitsJson, []);
		var conditions = DeserializeOrDefault<List<ConditionSpec>>(entry.ConditionsJson, []);
		var effects = DeserializeOrDefault<List<EffectSpec>>(entry.EffectsJson, []);

		Card card = entry.Type switch
		{
			CardType.Leader => new LeaderCard
			{
				Life = entry.Life ?? 0,
				RecoveryEffect = gameEffectHandlingService.ExtractRecoveryEffect(entry.Description)
			},
			CardType.Character or CardType.ExCharacter => new CharacterCard
			{
				Health = entry.Health ?? 0,
				SupportName = entry.SupportName ?? string.Empty,
				SupportEffect = entry.SupportEffect ?? string.Empty,
				SupportCost = entry.SupportCost ?? 0
			},
			_ => new Card()
		};

		card.Id = entry.CardId;
		card.Image = entry.Image;
		card.OriginalId = entry.OriginalId;
		card.MainAlternate = entry.MainAlternate;
		card.Attribute = entry.Attribute;
		card.Name = names;
		card.DisplayName = entry.DisplayName;
		card.Type = entry.Type;
		card.Traits = traits;
		card.Color = entry.Color;
		card.Description = entry.Description;
		card.MainEffect = gameEffectHandlingService.ExtractMainEffect(entry.Description);
		card.Damage = entry.Damage;
		card.Power = entry.Power;
		card.Conditions = conditions;
		card.Effects = effects;

		return card;
	}

	public List<CardInstance> ToRuntimeDeck(IReadOnlyList<string> cardDefinitionIds, string playerId)
	{
		throw new NotImplementedException();
	}

	public void DeckShuffle(List<CardInstance> deck, Random? random = null)
	{
		throw new NotImplementedException();
	}

	private static T DeserializeOrDefault<T>(string json, T fallback)
	{
		if (string.IsNullOrWhiteSpace(json))
		{
			return fallback;
		}

		try
		{
			return JsonSerializer.Deserialize<T>(json, SerializerOptions) ?? fallback;
		}
		catch (JsonException)
		{
			return fallback;
		}
	}
}
