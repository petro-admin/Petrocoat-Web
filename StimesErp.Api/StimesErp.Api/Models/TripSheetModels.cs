namespace StimesErp.Api.Models
{
    public class TripSheetSaveRequest
    {
        public int Code { get; set; }          // 0 = new
        public string DocNo { get; set; } = string.Empty;
        public DateTime DocDate { get; set; }
        public int DriverCode { get; set; }
        public int VehicleCode { get; set; }
        public DateTime? StartTime { get; set; }
        public decimal? StartOdometer { get; set; }
        public string? StartLocation { get; set; }
        public DateTime? EndTime { get; set; }
        public decimal? EndOdometer { get; set; }
        public string? EndLocation { get; set; }
        public decimal? FuelConsumption { get; set; }
        public string? Remarks { get; set; }
        public int StatusCode { get; set; }     // 0 = Open, 1 = Completed
        public int Mode { get; set; }           // 0 = insert, 1 = update, 2 = delete
        public List<TripSheetLegRow> Legs { get; set; } = new();
    }

    // Matches one row of the driver's paper "Daily Trip Sheet" exactly - a single Location
    // column (not a From/To journey-leg pair), with the odometer reading at the start and end
    // of that stop, same shape as the physical form drivers already fill in by hand.
    public class TripSheetLegRow
    {
        public int SlNo { get; set; }
        public DateTime? LegTime { get; set; }
        public string? JobNo { get; set; }
        public string? Location { get; set; }
        public decimal? StartKm { get; set; }
        public decimal? EndKm { get; set; }
        public string? Remarks { get; set; }
    }

    // One row of the daily Fleet Trip Sheet report, grouped by DocDate - matches the columns of
    // the existing Excel process (SL NO resets per day, Route Start Time = ignition ON via GPS,
    // Camp Reach Time = ignition OFF via GPS where available, First/Last Site are manual for now).
    public class TripSheetReportRow
    {
        public DateTime DocDate { get; set; }
        public int SlNo { get; set; }
        public string RegistrationNo { get; set; } = string.Empty;
        public decimal? Km { get; set; }
        public decimal? FuelConsumption { get; set; }
        public string DriverName { get; set; } = string.Empty;
        public DateTime? RouteStartTime { get; set; }
        public string? FirstSiteNo { get; set; }
        public DateTime? FirstSiteReachTime { get; set; }
        public string? LastSiteNo { get; set; }
        public DateTime? LastSiteStartTime { get; set; }
        public DateTime? CampReachTime { get; set; }
    }

    public class SaveGpsMappingRequest
    {
        public int VehicleCode { get; set; }
        public int? GpsDeviceId { get; set; }
        public string? GpsDeviceName { get; set; }
    }

    // Result of matching a Vehicle's RegistrationNo against the most recent GpsWebhookEvent
    // rows for that plate - null fields simply mean no GPS data has arrived for that vehicle yet
    // (expected until the webhook is configured on BON Tracker's side and has received events).
    public class VehicleGpsSnapshot
    {
        public bool Found { get; set; }
        public DateTime? EventTime { get; set; }
        public decimal? Odometer { get; set; }
        public string? Address { get; set; }
        public decimal? Latitude { get; set; }
        public decimal? Longitude { get; set; }
        public string? DriverName { get; set; }
    }

    // One row of the "Trip Sheet GPS Report" - one Vehicle/Date combination, built entirely from
    // GpsWebhookEvent (first and last event of that day for the matched device) rather than any
    // manually-entered Trip Sheet data. Distance is derived from the Odometer difference between
    // the day's first and last event, not a full driven-route calculation. DriverName is only
    // populated when an actual Trip Sheet record exists for that Vehicle/Date (see TripSheetHdr) -
    // this report never assigns/guesses a driver on its own.
    public class GpsTripReportRow
    {
        public int VehicleCode { get; set; }
        public string RegistrationNo { get; set; } = string.Empty;
        public DateTime TripDate { get; set; }
        public DateTime? RouteStart { get; set; }
        public string? StartLocation { get; set; }
        public decimal? StartOdometer { get; set; }
        public decimal? StartLatitude { get; set; }
        public decimal? StartLongitude { get; set; }
        public DateTime? RouteEnd { get; set; }
        public string? EndLocation { get; set; }
        public decimal? EndOdometer { get; set; }
        public decimal? EndLatitude { get; set; }
        public decimal? EndLongitude { get; set; }
        public decimal? DistanceKm { get; set; }
        public int? DriverCode { get; set; }
        public string? DriverName { get; set; }

        // True only for a leg with no recorded Ignition Off that is also this vehicle's last GPS
        // event in the query range - meaning it may genuinely still be running right now. An
        // earlier open leg that has later events after it (another ignition_on with nothing in
        // between) isn't "ongoing" - the vehicle plainly turned off since; the device/vendor just
        // never delivered that particular ignition_off webhook, so its real end time is unknown.
        public bool IsOngoing { get; set; }
    }
}
