namespace StimesErp.Api.Models
{
    // Independent, web-only schema (VehicleHandoverHdr) - no such feature exists on the desktop
    // (the desktop's own "Asset Handover" is for office equipment/SIMs, not vehicles). Captures
    // a vehicle changing hands between two people: a photo of the vehicle's condition, its
    // odometer reading, and who handed it over/received it.
    public class VehicleHandoverSaveRequest
    {
        public int Code { get; set; } // 0 = new
        public string DocNo { get; set; } = string.Empty;
        public DateTime HandoverDate { get; set; }
        public int VehicleCode { get; set; }
        public decimal? OdometerKm { get; set; }
        public string? PhotoPath { get; set; }

        public string HandedOverByName { get; set; } = string.Empty;
        public string? HandedOverByDesignation { get; set; }
        public string? HandedOverByContact { get; set; }

        public string ReceivedByName { get; set; } = string.Empty;
        public string? ReceivedByDesignation { get; set; }
        public string? ReceivedByContact { get; set; }

        public string? Reason { get; set; }
    }
}
