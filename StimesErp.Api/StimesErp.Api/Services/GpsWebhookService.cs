using System.Data;
using System.Globalization;
using System.Text.Json;
using Microsoft.Data.SqlClient;
using StimesErp.Api.Data;
using StimesErp.Api.Models;

namespace StimesErp.Api.Services
{
    public class GpsWebhookService
    {
        private readonly SqlHelper _db;

        public GpsWebhookService(SqlHelper db)
        {
            _db = db;
        }

        // Stores every incoming event as-is (plus the raw JSON, for safety while we're still
        // learning the exact payload shapes this vendor sends) - trip start/end detection is
        // derived later by reading this table, not computed here.
        public void StoreEvent(GpsWebhookPayload payload, string rawJson)
        {
            var odometer = payload.Sensors?
                .FirstOrDefault(s => string.Equals(s.Type, "odometer", StringComparison.OrdinalIgnoreCase))
                ?.Value;

            var sql = @"INSERT INTO GpsWebhookEvent
                (EventId, AlertId, AlertName, AlertType, DeviceId, DeviceName, Imei, PlateNumber,
                 DriverId, DriverName, Latitude, Longitude, Altitude, Speed, Course, Odometer,
                 Address, EventTime, Message, RawPayload)
                VALUES
                (@EventId, @AlertId, @AlertName, @AlertType, @DeviceId, @DeviceName, @Imei, @PlateNumber,
                 @DriverId, @DriverName, @Latitude, @Longitude, @Altitude, @Speed, @Course, @Odometer,
                 @Address, @EventTime, @Message, @RawPayload)";

            var p = new[]
            {
                SqlHelper.Param("@EventId", SqlDbType.Int, payload.EventId),
                SqlHelper.Param("@AlertId", SqlDbType.Int, payload.AlertId),
                SqlHelper.Param("@AlertName", SqlDbType.VarChar, payload.AlertName ?? payload.Name, 200),
                SqlHelper.Param("@AlertType", SqlDbType.VarChar, payload.Type, 100),
                SqlHelper.Param("@DeviceId", SqlDbType.Int, payload.DeviceId ?? payload.Device?.Id),
                SqlHelper.Param("@DeviceName", SqlDbType.VarChar, payload.DeviceName ?? payload.Device?.Name, 200),
                SqlHelper.Param("@Imei", SqlDbType.VarChar, payload.Imei ?? payload.Device?.Imei, 50),
                SqlHelper.Param("@PlateNumber", SqlDbType.VarChar, payload.Device?.PlateNumber, 50),
                SqlHelper.Param("@DriverId", SqlDbType.Int, payload.Device?.CurrentDriverId),
                SqlHelper.Param("@DriverName", SqlDbType.VarChar, payload.AdditionalData?.DriverName ?? payload.Additional?.DriverName, 200),
                SqlHelper.Param("@Latitude", SqlDbType.Decimal, ParseDecimal(payload.Latitude)),
                SqlHelper.Param("@Longitude", SqlDbType.Decimal, ParseDecimal(payload.Longitude)),
                SqlHelper.Param("@Altitude", SqlDbType.Decimal, ParseDecimal(payload.Altitude)),
                SqlHelper.Param("@Speed", SqlDbType.Decimal, ParseDecimal(payload.Speed)),
                SqlHelper.Param("@Course", SqlDbType.Decimal, ParseDecimal(payload.Course)),
                SqlHelper.Param("@Odometer", SqlDbType.Decimal, ParseDecimal(odometer)),
                SqlHelper.Param("@Address", SqlDbType.NVarChar, payload.Address, 500),
                SqlHelper.Param("@EventTime", SqlDbType.DateTime, ParseDateTime(payload.Time)),
                SqlHelper.Param("@Message", SqlDbType.VarChar, payload.Message, 500),
                SqlHelper.Param("@RawPayload", SqlDbType.NVarChar, rawJson)
            };

            _db.ExecuteNonQuery(sql, p);
        }

        private static object? ParseDecimal(string? value) =>
            decimal.TryParse(value, NumberStyles.Any, CultureInfo.InvariantCulture, out var d) ? d : null;

        // Accepts either a JSON number or a quoted numeric string (the vendor's own two example
        // payloads used both for the same fields).
        private static object? ParseDecimal(JsonElement? element)
        {
            if (element is not { } e) return null;
            return e.ValueKind switch
            {
                JsonValueKind.Number when e.TryGetDecimal(out var d) => d,
                JsonValueKind.String => ParseDecimal(e.GetString()),
                _ => null
            };
        }

        private static object? ParseDecimal(object? value) => ParseDecimal(value?.ToString());

        // The vendor's "time" field arrives in UTC with no offset marker (confirmed by comparing
        // our stored EventTime against the same event's timestamp on BON Tracker's own portal,
        // which displays Dubai local time - e.g. our "11:08:42" was their "15:08:42", a fixed 4
        // hour gap). +4 converts to Asia/Dubai local time, which the UAE keeps year-round with no
        // DST, so a flat offset is safe rather than needing a timezone-aware conversion.
        private static object? ParseDateTime(string? value) =>
            DateTime.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.None, out var d) ? d.AddHours(4) : null;
    }
}
