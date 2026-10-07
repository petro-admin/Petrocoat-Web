namespace StimesErp.Api.Models
{
    // Independent, web-only schema (AccidentReportHdr/AccidentReportPhoto) - not a port of the
    // desktop's own registered-but-unbuilt "AccidentRegistration" module slot. Built for a driver
    // filling this in on their phone at the accident scene: GPS captured automatically, photos
    // taken with the device camera, then reviewed by a supervisor/admin afterwards.
    public class AccidentReportSaveRequest
    {
        public int Code { get; set; } // 0 = new
        public string DocNo { get; set; } = string.Empty;
        public DateTime DocDateTime { get; set; }
        public int DriverEmployeeCode { get; set; }
        public int VehicleCode { get; set; }
        public decimal? OdometerKm { get; set; }
        public decimal? Latitude { get; set; }
        public decimal? Longitude { get; set; }
        public string? LocationDescription { get; set; }

        /// <summary>"Minor", "Major", "Injury", or "Fatal".</summary>
        public string Severity { get; set; } = "Minor";
        public string? AccidentDescription { get; set; }

        public bool OtherVehicleInvolved { get; set; }
        public string? OtherVehiclePlateNo { get; set; }
        public string? OtherDriverName { get; set; }
        public string? OtherDriverContact { get; set; }

        public bool PoliceCalled { get; set; }
        public string? PoliceReportNo { get; set; }

        public bool InjuriesReported { get; set; }
        public string? InjuryDetails { get; set; }

        /// <summary>"Submitted", "Under Review", or "Closed" - only ever changed from the admin
        /// review screen, never by the driver's own submit.</summary>
        public string Status { get; set; } = "Submitted";
        public string? SupervisorRemarks { get; set; }

        public List<string> PhotoPaths { get; set; } = new();

        /// <summary>General-purpose attachments (police report, insurance papers, other party's
        /// documents, anything else) - each with its own description, not tied to a single
        /// toggle. Full list sent on every save and replaces whatever was there before, unlike
        /// Photos which only ever appends.</summary>
        public List<AccidentReportDocumentRow> Documents { get; set; } = new();
    }

    public class AccidentReportDocumentRow
    {
        public int SlNo { get; set; }
        public string? Description { get; set; }
        public string FilePath { get; set; } = string.Empty;
    }
}
