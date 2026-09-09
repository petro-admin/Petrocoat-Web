using System.Globalization;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace StimesErp.Api.Json
{
    /// <summary>
    /// HTML date/time inputs send "" or "HH:mm", which System.Text.Json cannot map to DateTime?.
    /// Treat empty strings as null and accept date-only, time-only, and ISO values.
    /// </summary>
    public sealed class FlexibleDateTimeConverterFactory : JsonConverterFactory
    {
        public override bool CanConvert(Type typeToConvert) =>
            typeToConvert == typeof(DateTime) || typeToConvert == typeof(DateTime?);

        public override JsonConverter CreateConverter(Type typeToConvert, JsonSerializerOptions options) =>
            typeToConvert == typeof(DateTime?)
                ? new FlexibleNullableDateTimeConverter()
                : new FlexibleDateTimeConverter();
    }

    public sealed class FlexibleDateTimeConverter : JsonConverter<DateTime>
    {
        public override DateTime Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
        {
            if (FlexibleDateTimeParser.TryRead(ref reader, out var value) && value.HasValue)
                return value.Value;
            throw new JsonException("A valid date/time is required.");
        }

        public override void Write(Utf8JsonWriter writer, DateTime value, JsonSerializerOptions options) =>
            writer.WriteStringValue(value.ToString("o", CultureInfo.InvariantCulture));
    }

    public sealed class FlexibleNullableDateTimeConverter : JsonConverter<DateTime?>
    {
        public override DateTime? Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
        {
            if (FlexibleDateTimeParser.TryRead(ref reader, out var value))
                return value;
            throw new JsonException("The JSON value could not be converted to DateTime.");
        }

        public override void Write(Utf8JsonWriter writer, DateTime? value, JsonSerializerOptions options)
        {
            if (value.HasValue)
                writer.WriteStringValue(value.Value.ToString("o", CultureInfo.InvariantCulture));
            else
                writer.WriteNullValue();
        }
    }

    internal static class FlexibleDateTimeParser
    {
        private static readonly string[] Formats =
        {
            "yyyy-MM-dd",
            "yyyy-MM-ddTHH:mm",
            "yyyy-MM-ddTHH:mm:ss",
            "yyyy-MM-ddTHH:mm:ss.FFFFFFF",
            "yyyy-MM-ddTHH:mm:ss.FFFFFFFZ",
            "HH:mm",
            "HH:mm:ss"
        };

        public static bool TryRead(ref Utf8JsonReader reader, out DateTime? value)
        {
            value = null;

            if (reader.TokenType == JsonTokenType.Null)
                return true;

            if (reader.TokenType != JsonTokenType.String)
                return false;

            var raw = reader.GetString();
            if (string.IsNullOrWhiteSpace(raw))
                return true;

            raw = raw.Trim();

            if (TimeOnly.TryParseExact(raw, new[] { "HH:mm", "HH:mm:ss" }, CultureInfo.InvariantCulture, DateTimeStyles.None, out var timeOnly))
            {
                value = DateTime.Today.Add(timeOnly.ToTimeSpan());
                return true;
            }

            if (DateTime.TryParseExact(raw, Formats, CultureInfo.InvariantCulture, DateTimeStyles.AssumeLocal | DateTimeStyles.AllowWhiteSpaces, out var exact))
            {
                value = exact;
                return true;
            }

            if (DateTime.TryParse(raw, CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind, out var parsed))
            {
                value = parsed;
                return true;
            }

            return false;
        }
    }
}
