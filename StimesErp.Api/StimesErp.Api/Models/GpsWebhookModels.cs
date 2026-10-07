using System.Text.Json;
using System.Text.Json.Serialization;

namespace StimesErp.Api.Models
{
    // Matches the GPSWOX webhook payload (BON Tracker PRO's underlying platform) -
    // both the simple "Overspeed Alert" shape and the richer nested "device"/"additional" shape
    // the vendor's docs showed, so every field below is optional/nullable. Altitude/Speed/Course
    // come back as a plain number in one of the vendor's own two example payloads and as a quoted
    // string in the other, so those use JsonElement to accept either without throwing.
    public class GpsWebhookPayload
    {
        [JsonPropertyName("event_id")] public int? EventId { get; set; }
        [JsonPropertyName("alert_id")] public int? AlertId { get; set; }
        [JsonPropertyName("alert_name")] public string? AlertName { get; set; }
        [JsonPropertyName("name")] public string? Name { get; set; }
        [JsonPropertyName("type")] public string? Type { get; set; }
        [JsonPropertyName("message")] public string? Message { get; set; }
        [JsonPropertyName("device_id")] public int? DeviceId { get; set; }
        [JsonPropertyName("device_name")] public string? DeviceName { get; set; }
        [JsonPropertyName("imei")] public string? Imei { get; set; }
        // JsonElement, not string - the vendor's two setup-time example payloads sent these as
        // quoted strings, but the real live webhook sends them as raw JSON numbers
        // (e.g. "latitude":24.692545). A plain string property throws on a raw number, which
        // silently discarded the entire payload (caught by the controller's catch-all, storing
        // an empty row with only RawPayload/ReceivedAt filled in) - this accepts either shape.
        [JsonPropertyName("latitude")] public JsonElement? Latitude { get; set; }
        [JsonPropertyName("longitude")] public JsonElement? Longitude { get; set; }
        [JsonPropertyName("altitude")] public JsonElement? Altitude { get; set; }
        [JsonPropertyName("speed")] public JsonElement? Speed { get; set; }
        [JsonPropertyName("course")] public JsonElement? Course { get; set; }
        [JsonPropertyName("time")] public string? Time { get; set; }
        [JsonPropertyName("address")] public string? Address { get; set; }
        [JsonPropertyName("additional_data")] public GpsWebhookAdditionalData? AdditionalData { get; set; }
        [JsonPropertyName("additional")] public GpsWebhookAdditionalData? Additional { get; set; }
        [JsonPropertyName("device")] public GpsWebhookDevice? Device { get; set; }
        [JsonPropertyName("sensors")] public List<GpsWebhookSensor>? Sensors { get; set; }
    }

    public class GpsWebhookAdditionalData
    {
        [JsonPropertyName("driver_name")] public string? DriverName { get; set; }
    }

    public class GpsWebhookDevice
    {
        [JsonPropertyName("id")] public int? Id { get; set; }
        [JsonPropertyName("name")] public string? Name { get; set; }
        [JsonPropertyName("imei")] public string? Imei { get; set; }
        [JsonPropertyName("plate_number")] public string? PlateNumber { get; set; }
        [JsonPropertyName("current_driver_id")] public int? CurrentDriverId { get; set; }
    }

    public class GpsWebhookSensor
    {
        [JsonPropertyName("type")] public string? Type { get; set; }
        [JsonPropertyName("name")] public string? Name { get; set; }
        [JsonPropertyName("value")] public object? Value { get; set; }
    }
}
