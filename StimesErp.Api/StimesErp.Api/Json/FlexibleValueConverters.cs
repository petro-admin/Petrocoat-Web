using System.Globalization;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace StimesErp.Api.Json
{
    /// <summary>
    /// Angular/SQL mix numbers and strings (e.g. packSize: 20). Accept both.
    /// </summary>
    public sealed class FlexibleStringConverter : JsonConverter<string>
    {
        public override string Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
        {
            return reader.TokenType switch
            {
                JsonTokenType.Null => string.Empty,
                JsonTokenType.String => reader.GetString() ?? string.Empty,
                JsonTokenType.Number => ReadNumberAsString(ref reader),
                JsonTokenType.True => "true",
                JsonTokenType.False => "false",
                _ => throw new JsonException($"Cannot convert {reader.TokenType} to string.")
            };
        }

        public override void Write(Utf8JsonWriter writer, string value, JsonSerializerOptions options) =>
            writer.WriteStringValue(value ?? string.Empty);

        private static string ReadNumberAsString(ref Utf8JsonReader reader)
        {
            if (reader.TryGetInt64(out var whole)) return whole.ToString(CultureInfo.InvariantCulture);
            if (reader.TryGetDecimal(out var dec)) return dec.ToString(CultureInfo.InvariantCulture);
            if (reader.TryGetDouble(out var dbl)) return dbl.ToString(CultureInfo.InvariantCulture);
            return string.Empty;
        }
    }

    public sealed class FlexibleIntConverter : JsonConverter<int>
    {
        public override int Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options) =>
            FlexibleNumberParser.ReadInt(ref reader) ?? 0;

        public override void Write(Utf8JsonWriter writer, int value, JsonSerializerOptions options) =>
            writer.WriteNumberValue(value);
    }

    public sealed class FlexibleNullableIntConverter : JsonConverter<int?>
    {
        public override int? Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options) =>
            FlexibleNumberParser.ReadInt(ref reader);

        public override void Write(Utf8JsonWriter writer, int? value, JsonSerializerOptions options)
        {
            if (value.HasValue) writer.WriteNumberValue(value.Value);
            else writer.WriteNullValue();
        }
    }

    public sealed class FlexibleDecimalConverter : JsonConverter<decimal>
    {
        public override decimal Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options) =>
            FlexibleNumberParser.ReadDecimal(ref reader) ?? 0;

        public override void Write(Utf8JsonWriter writer, decimal value, JsonSerializerOptions options) =>
            writer.WriteNumberValue(value);
    }

    internal static class FlexibleNumberParser
    {
        public static int? ReadInt(ref Utf8JsonReader reader)
        {
            switch (reader.TokenType)
            {
                case JsonTokenType.Null:
                    return null;
                case JsonTokenType.Number:
                    if (reader.TryGetInt32(out var i)) return i;
                    if (reader.TryGetDecimal(out var d)) return (int)d;
                    return null;
                case JsonTokenType.String:
                    var s = reader.GetString();
                    if (string.IsNullOrWhiteSpace(s)) return null;
                    if (int.TryParse(s, NumberStyles.Any, CultureInfo.InvariantCulture, out var parsed))
                        return parsed;
                    if (decimal.TryParse(s, NumberStyles.Any, CultureInfo.InvariantCulture, out var dec))
                        return (int)dec;
                    return null;
                default:
                    return null;
            }
        }

        public static decimal? ReadDecimal(ref Utf8JsonReader reader)
        {
            switch (reader.TokenType)
            {
                case JsonTokenType.Null:
                    return null;
                case JsonTokenType.Number:
                    if (reader.TryGetDecimal(out var d)) return d;
                    return null;
                case JsonTokenType.String:
                    var s = reader.GetString();
                    if (string.IsNullOrWhiteSpace(s)) return null;
                    if (decimal.TryParse(s, NumberStyles.Any, CultureInfo.InvariantCulture, out var parsed))
                        return parsed;
                    return null;
                default:
                    return null;
            }
        }
    }
}
