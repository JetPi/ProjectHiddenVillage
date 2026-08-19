using System.Text.Json;
using System.Text.Json.Serialization;

namespace ProjectHiddenVillage.Server.Api.Serialization;

public sealed class FlexibleEnumJsonConverterFactory : JsonConverterFactory
{
    public override bool CanConvert(Type typeToConvert)
    {
        var enumType = Nullable.GetUnderlyingType(typeToConvert) ?? typeToConvert;
        return enumType.IsEnum;
    }

    public override JsonConverter CreateConverter(Type typeToConvert, JsonSerializerOptions options)
    {
        var enumType = Nullable.GetUnderlyingType(typeToConvert);
        if (enumType is null)
        {
            var converterType = typeof(FlexibleEnumJsonConverter<>).MakeGenericType(typeToConvert);
            return (JsonConverter)Activator.CreateInstance(converterType)!;
        }

        var nullableConverterType = typeof(NullableFlexibleEnumJsonConverter<>).MakeGenericType(enumType);
        return (JsonConverter)Activator.CreateInstance(nullableConverterType)!;
    }

    private sealed class NullableFlexibleEnumJsonConverter<TEnum> : JsonConverter<TEnum?> where TEnum : struct, Enum
    {
        private readonly FlexibleEnumJsonConverter<TEnum> innerConverter = new();

        public override TEnum? Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
        {
            if (reader.TokenType == JsonTokenType.Null)
            {
                return null;
            }

            return innerConverter.Read(ref reader, typeof(TEnum), options);
        }

        public override void Write(Utf8JsonWriter writer, TEnum? value, JsonSerializerOptions options)
        {
            if (!value.HasValue)
            {
                writer.WriteNullValue();
                return;
            }

            innerConverter.Write(writer, value.Value, options);
        }
    }

    private sealed class FlexibleEnumJsonConverter<TEnum> : JsonConverter<TEnum> where TEnum : struct, Enum
    {
        private static readonly Dictionary<string, TEnum> ValueByNormalizedName = BuildLookup();

        public override TEnum Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
        {
            if (reader.TokenType == JsonTokenType.Number)
            {
                if (reader.TryGetInt32(out var numericValue))
                {
                    return (TEnum)Enum.ToObject(typeof(TEnum), numericValue);
                }

                throw new JsonException($"Unable to parse numeric enum value for '{typeof(TEnum).Name}'.");
            }

            if (reader.TokenType != JsonTokenType.String)
            {
                throw new JsonException($"Unexpected token {reader.TokenType} for enum '{typeof(TEnum).Name}'.");
            }

            var rawValue = reader.GetString();
            if (string.IsNullOrWhiteSpace(rawValue))
            {
                throw new JsonException($"Enum '{typeof(TEnum).Name}' cannot be an empty string.");
            }

            var trimmed = rawValue.Trim();

            if (Enum.TryParse<TEnum>(trimmed, ignoreCase: true, out var parsed))
            {
                return parsed;
            }

            if (int.TryParse(trimmed, out var numericStringValue))
            {
                return (TEnum)Enum.ToObject(typeof(TEnum), numericStringValue);
            }

            var normalized = Normalize(trimmed);
            if (ValueByNormalizedName.TryGetValue(normalized, out var matched))
            {
                return matched;
            }

            throw new JsonException($"Value '{rawValue}' is not valid for enum '{typeof(TEnum).Name}'.");
        }

        public override void Write(Utf8JsonWriter writer, TEnum value, JsonSerializerOptions options)
        {
            writer.WriteNumberValue(Convert.ToInt32(value));
        }

        private static Dictionary<string, TEnum> BuildLookup()
        {
            var result = new Dictionary<string, TEnum>(StringComparer.OrdinalIgnoreCase);

            foreach (var enumName in Enum.GetNames<TEnum>())
            {
                var value = Enum.Parse<TEnum>(enumName);
                result[Normalize(enumName)] = value;
            }

            return result;
        }

        private static string Normalize(string value)
        {
            return string.Concat(value.Where(ch => char.IsLetterOrDigit(ch))).ToUpperInvariant();
        }
    }
}