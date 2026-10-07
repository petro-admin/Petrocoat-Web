using System.Data;
using Microsoft.Data.SqlClient;
using StimesErp.Api.Data;
using StimesErp.Api.Models;

namespace StimesErp.Api.Services
{
    public class TripSheetService
    {
        private readonly SqlHelper _db;
        private readonly WebAuditService _audit;

        public TripSheetService(SqlHelper db, WebAuditService audit)
        {
            _db = db;
            _audit = audit;
        }

        public DataTable GetList() => _db.GetDataTableFromQuery(
            @"select T.Code, T.DocNo, T.DocDate, T.DriverCode, E.EmpFullName as DriverName,
                     T.VehicleCode, V.RegistrationNo, T.StartTime, T.EndTime, T.StatusCode
              from TripSheetHdr T
              left join payrollEmployeeInfo E on E.EmployeeCode = T.DriverCode
              left join AdminVehicleInfo V on V.VehicleCode = T.VehicleCode
              order by T.Code desc");

        public DataTable GetById(int code) => _db.GetDataTableFromQuery(
            "select * from TripSheetHdr where Code = @Code",
            new[] { SqlHelper.Param("@Code", SqlDbType.Int, code) });

        public DataTable GetLegs(int code) => _db.GetDataTableFromQuery(
            "select SlNo, LegTime, JobNo, Location, StartKm, EndKm, Remarks from TripSheetLeg where TripSheetCode = @Code order by SlNo",
            new[] { SqlHelper.Param("@Code", SqlDbType.Int, code) });

        public string GenerateDocNo()
        {
            var dt = _db.GetDataTableFromQuery("select 'TS-' + RIGHT('000000' + CAST(ISNULL(MAX(Code),0)+1 AS VARCHAR), 6) as DocNo from TripSheetHdr");
            return dt.Rows.Count > 0 ? dt.Rows[0]["DocNo"]?.ToString() ?? "" : "";
        }

        // Same driver-eligibility rule VSR's Driver dropdown already uses.
        // Drivers only (CurrentDesigCode 63/159) - deliberately excludes office/technical staff
        // (CategoryCode 9/10/11, the same categories Staff Attendance covers) so the Trip Sheet
        // Driver dropdown doesn't mix the two.
        public DataTable GetDriverLookup() => _db.GetDataTableFromQuery(
            "select EmployeeCode, EmpFullName from payrollEmployeeInfo E " +
            "where E.CurrentDesigCode in (63,159) and E.ActiveYesNo = 'Y' " +
            "order by EmpFullName");

        // GetDriverLookup's own list (CurrentDesigCode 63/159) plus whichever employees are set as
        // a vehicle's Fixed Driver (VehicleGpsMapping.FixedDriverEmployeeCode) - staff who drive a
        // vehicle without ever filling in a Trip Sheet. Their name already resolves correctly in
        // the GPS Trip Sheet Report's own rows (GetGpsTripReport falls back to FixedDriverEmployeeCode),
        // but they weren't selectable in that report's Driver filter since it reused the plain
        // driver-only list. Kept as its own lookup rather than widening GetDriverLookup itself, so
        // the manual Trip Sheet's own Driver field stays drivers-only as already set up.
        public DataTable GetGpsReportDriverLookup() => _db.GetDataTableFromQuery(
            @"select EmployeeCode, EmpFullName from payrollEmployeeInfo E
              where E.CurrentDesigCode in (63,159) and E.ActiveYesNo = 'Y'
              union
              select E.EmployeeCode, E.EmpFullName
              from VehicleGpsMapping M
              inner join payrollEmployeeInfo E on E.EmployeeCode = M.FixedDriverEmployeeCode
              where E.ActiveYesNo = 'Y'
              order by EmpFullName");

        public DataTable GetVehicleLookup() => _db.GetDataTableFromQuery(
            @"select V.VehicleCode, V.RegistrationNo, V.VehicleModel
              from AdminVehicleInfo V
              inner join AdminBranchInfo br on br.BranchCode = V.BranchCode
              inner join payrollVehicleManufacturer vm on vm.MFCode = V.VehMfCode
              where V.VehicleStatus = 'In Use'
              order by V.RegistrationNo");

        public DataTable GetGpsMapping(int vehicleCode) => _db.GetDataTableFromQuery(
            "select VehicleCode, GpsDeviceId, GpsDeviceName from VehicleGpsMapping where VehicleCode = @VehicleCode",
            new[] { SqlHelper.Param("@VehicleCode", SqlDbType.Int, vehicleCode) });

        // One-time-per-vehicle link between an ERP vehicle and BON Tracker's own object - set by
        // an admin who reads the exact Device ID/Name off the BON Tracker "Objects" panel, since
        // BON Tracker's object names (e.g. "Z-46731") are internal asset codes, not the vehicle's
        // license plate, so they can't be relied on to auto-match against RegistrationNo.
        public void SaveGpsMapping(int vehicleCode, int? gpsDeviceId, string? gpsDeviceName)
        {
            var p = new[]
            {
                SqlHelper.Param("@VehicleCode", SqlDbType.Int, vehicleCode),
                SqlHelper.Param("@GpsDeviceId", SqlDbType.Int, gpsDeviceId),
                SqlHelper.Param("@GpsDeviceName", SqlDbType.VarChar, gpsDeviceName ?? "", 200)
            };
            _db.ExecuteNonQuery(
                @"merge VehicleGpsMapping as target
                  using (select @VehicleCode as VehicleCode) as src on target.VehicleCode = src.VehicleCode
                  when matched then update set GpsDeviceId = @GpsDeviceId, GpsDeviceName = @GpsDeviceName, UpdatedAt = GETDATE()
                  when not matched then insert (VehicleCode, GpsDeviceId, GpsDeviceName) values (@VehicleCode, @GpsDeviceId, @GpsDeviceName);",
                p);
        }

        // Prefers the explicit VehicleGpsMapping (set once by an admin) - matches by the stable
        // numeric DeviceId first, then by the mapped Device Name. Falls back to comparing
        // RegistrationNo against whatever BON Tracker happened to send as DeviceName/PlateNumber
        // only when no mapping has been configured yet for this vehicle.
        public VehicleGpsSnapshot GetLatestGpsSnapshot(int vehicleCode)
        {
            var mapping = GetGpsMapping(vehicleCode);
            DataTable dt;

            if (mapping.Rows.Count > 0 && (mapping.Rows[0]["GpsDeviceId"] != DBNull.Value || !string.IsNullOrWhiteSpace(mapping.Rows[0]["GpsDeviceName"]?.ToString())))
            {
                var deviceId = mapping.Rows[0]["GpsDeviceId"] as int?;
                var deviceName = mapping.Rows[0]["GpsDeviceName"]?.ToString()?.Trim() ?? "";
                dt = _db.GetDataTableFromQuery(
                    @"select top 1 EventTime, Odometer, Address, Latitude, Longitude, DriverName
                      from GpsWebhookEvent
                      where (@DeviceId is not null and DeviceId = @DeviceId)
                         or (@DeviceName <> '' and LTRIM(RTRIM(REPLACE(ISNULL(DeviceName,''), ' ', ''))) = LTRIM(RTRIM(REPLACE(@DeviceName, ' ', ''))))
                      order by EventTime desc",
                    new[]
                    {
                        SqlHelper.Param("@DeviceId", SqlDbType.Int, deviceId),
                        SqlHelper.Param("@DeviceName", SqlDbType.VarChar, deviceName, 200)
                    });
            }
            else
            {
                var vehicle = _db.GetDataTableFromQuery(
                    "select RegistrationNo from AdminVehicleInfo where VehicleCode = @VehicleCode",
                    new[] { SqlHelper.Param("@VehicleCode", SqlDbType.Int, vehicleCode) });

                if (vehicle.Rows.Count == 0) return new VehicleGpsSnapshot { Found = false };
                var registrationNo = vehicle.Rows[0]["RegistrationNo"]?.ToString()?.Trim() ?? "";
                if (registrationNo.Length == 0) return new VehicleGpsSnapshot { Found = false };

                dt = _db.GetDataTableFromQuery(
                    @"select top 1 EventTime, Odometer, Address, Latitude, Longitude, DriverName
                      from GpsWebhookEvent
                      where LTRIM(RTRIM(REPLACE(ISNULL(DeviceName,''), ' ', ''))) = LTRIM(RTRIM(REPLACE(@RegistrationNo, ' ', '')))
                         or LTRIM(RTRIM(REPLACE(ISNULL(PlateNumber,''), ' ', ''))) = LTRIM(RTRIM(REPLACE(@RegistrationNo, ' ', '')))
                      order by EventTime desc",
                    new[] { SqlHelper.Param("@RegistrationNo", SqlDbType.VarChar, registrationNo, 50) });
            }

            if (dt.Rows.Count == 0) return new VehicleGpsSnapshot { Found = false };

            var row = dt.Rows[0];
            return new VehicleGpsSnapshot
            {
                Found = true,
                EventTime = row["EventTime"] as DateTime?,
                Odometer = row["Odometer"] as decimal?,
                Address = row["Address"] as string,
                Latitude = row["Latitude"] as decimal?,
                Longitude = row["Longitude"] as decimal?,
                DriverName = row["DriverName"] as string
            };
        }

        public string Save(TripSheetSaveRequest req, int userCode)
        {
            if (req.Mode == 2)
            {
                _db.ExecuteNonQuery("delete from TripSheetLeg where TripSheetCode = @Code",
                    new[] { SqlHelper.Param("@Code", SqlDbType.Int, req.Code) });
                _db.ExecuteNonQuery("delete from TripSheetHdr where Code = @Code",
                    new[] { SqlHelper.Param("@Code", SqlDbType.Int, req.Code) });
                _audit.LogDelete("Trip Sheet", $"Trip Sheet Code {req.Code} deleted");
                return "deleted successfully";
            }

            var distanceKm = (req.EndOdometer.HasValue && req.StartOdometer.HasValue)
                ? req.EndOdometer.Value - req.StartOdometer.Value
                : (decimal?)null;

            int code;
            if (req.Mode == 0)
            {
                var docNo = string.IsNullOrWhiteSpace(req.DocNo) ? GenerateDocNo() : req.DocNo;
                _db.ExecuteNonQuery(
                    @"insert into TripSheetHdr
                        (DocNo, DocDate, DriverCode, VehicleCode, StartTime, StartOdometer, StartLocation,
                         EndTime, EndOdometer, EndLocation, DistanceKm, FuelConsumption, Remarks, StatusCode, CreatedBy)
                      values
                        (@DocNo, @DocDate, @DriverCode, @VehicleCode, @StartTime, @StartOdometer, @StartLocation,
                         @EndTime, @EndOdometer, @EndLocation, @DistanceKm, @FuelConsumption, @Remarks, @StatusCode, @CreatedBy)",
                    BuildParams(req, docNo, distanceKm, userCode));

                var dt = _db.GetDataTableFromQuery("select ISNULL(MAX(Code),0) as Code from TripSheetHdr");
                code = Convert.ToInt32(dt.Rows[0]["Code"]);
            }
            else
            {
                code = req.Code;
                _db.ExecuteNonQuery(
                    @"update TripSheetHdr set
                        DocDate = @DocDate, DriverCode = @DriverCode, VehicleCode = @VehicleCode,
                        StartTime = @StartTime, StartOdometer = @StartOdometer, StartLocation = @StartLocation,
                        EndTime = @EndTime, EndOdometer = @EndOdometer, EndLocation = @EndLocation,
                        DistanceKm = @DistanceKm, FuelConsumption = @FuelConsumption, Remarks = @Remarks, StatusCode = @StatusCode
                      where Code = @Code",
                    BuildParams(req, req.DocNo, distanceKm, userCode, includeCode: true));
            }

            SaveLegs(code, req.Legs);

            if (req.Mode == 0) _audit.LogAdd("Trip Sheet", $"{req.DocNo} - Trip Sheet Added");
            else _audit.LogEdit("Trip Sheet", $"{req.DocNo} - Trip Sheet Edited");

            return req.Mode == 0 ? "saved successfully" : "updated successfully";
        }

        private void SaveLegs(int tripSheetCode, List<TripSheetLegRow> legs)
        {
            _db.ExecuteNonQuery("delete from TripSheetLeg where TripSheetCode = @Code",
                new[] { SqlHelper.Param("@Code", SqlDbType.Int, tripSheetCode) });

            foreach (var leg in legs ?? new List<TripSheetLegRow>())
            {
                if (leg.SlNo <= 0 && string.IsNullOrWhiteSpace(leg.Location))
                    continue;

                _db.ExecuteNonQuery(
                    @"insert into TripSheetLeg (TripSheetCode, SlNo, LegTime, JobNo, Location, StartKm, EndKm, Remarks)
                      values (@TripSheetCode, @SlNo, @LegTime, @JobNo, @Location, @StartKm, @EndKm, @Remarks)",
                    new[]
                    {
                        SqlHelper.Param("@TripSheetCode", SqlDbType.Int, tripSheetCode),
                        SqlHelper.Param("@SlNo", SqlDbType.Int, leg.SlNo),
                        SqlHelper.Param("@LegTime", SqlDbType.DateTime, leg.LegTime),
                        SqlHelper.Param("@JobNo", SqlDbType.VarChar, leg.JobNo ?? "", 100),
                        SqlHelper.Param("@Location", SqlDbType.VarChar, leg.Location ?? "", 300),
                        SqlHelper.Param("@StartKm", SqlDbType.Decimal, leg.StartKm),
                        SqlHelper.Param("@EndKm", SqlDbType.Decimal, leg.EndKm),
                        SqlHelper.Param("@Remarks", SqlDbType.VarChar, leg.Remarks ?? "", 500)
                    });
            }
        }

        // Grouped-by-date report matching the driver's paper Daily Trip Sheet / the existing Excel
        // summary - SL NO resets per day (computed here, not stored). First Site/Last Site and
        // their times are derived from this trip's legs: First Site = first leg's destination,
        // Last Site = the last leg's starting point (i.e. the site departed from on the way back
        // to camp), using each leg's own logged time as the closest available proxy for reach/start time.
        public List<TripSheetReportRow> GetReport(DateTime fromDate, DateTime toDate)
        {
            var dt = _db.GetDataTableFromQuery(
                @"select T.DocDate, T.Code, V.RegistrationNo, T.DistanceKm, T.FuelConsumption,
                         E.EmpFullName as DriverName, T.StartTime, T.EndTime,
                         FirstLeg.Location as FirstSiteNo, FirstLeg.LegTime as FirstSiteReachTime,
                         LastLeg.Location as LastSiteNo, LastLeg.LegTime as LastSiteStartTime,
                         ROW_NUMBER() over (partition by CAST(T.DocDate as date) order by T.Code) as SlNo
                  from TripSheetHdr T
                  left join payrollEmployeeInfo E on E.EmployeeCode = T.DriverCode
                  left join AdminVehicleInfo V on V.VehicleCode = T.VehicleCode
                  outer apply (select top 1 Location, LegTime from TripSheetLeg where TripSheetCode = T.Code order by SlNo asc) FirstLeg
                  outer apply (select top 1 Location, LegTime from TripSheetLeg where TripSheetCode = T.Code order by SlNo desc) LastLeg
                  where T.DocDate >= @FromDate and T.DocDate < @ToDatePlusOne
                  order by T.DocDate, T.Code",
                new[]
                {
                    SqlHelper.Param("@FromDate", SqlDbType.DateTime, fromDate.Date),
                    SqlHelper.Param("@ToDatePlusOne", SqlDbType.DateTime, toDate.Date.AddDays(1))
                });

            var rows = new List<TripSheetReportRow>();
            foreach (DataRow r in dt.Rows)
            {
                rows.Add(new TripSheetReportRow
                {
                    DocDate = (DateTime)r["DocDate"],
                    SlNo = Convert.ToInt32(r["SlNo"]),
                    RegistrationNo = r["RegistrationNo"] as string ?? "",
                    Km = r["DistanceKm"] as decimal?,
                    FuelConsumption = r["FuelConsumption"] as decimal?,
                    DriverName = r["DriverName"] as string ?? "",
                    RouteStartTime = r["StartTime"] as DateTime?,
                    FirstSiteNo = r["FirstSiteNo"] as string,
                    FirstSiteReachTime = r["FirstSiteReachTime"] as DateTime?,
                    LastSiteNo = r["LastSiteNo"] as string,
                    LastSiteStartTime = r["LastSiteStartTime"] as DateTime?,
                    CampReachTime = r["EndTime"] as DateTime?
                });
            }
            return rows;
        }

        // Trip Sheet GPS Report - entirely derived from GpsWebhookEvent (first/last event per
        // Vehicle/Date), independent of any manually-entered Trip Sheet. Resolves each vehicle's
        // GPS device the same way GetLatestGpsSnapshot does: prefer VehicleGpsMapping, fall back
        // to matching RegistrationNo against DeviceName/PlateNumber text. One row per actual
        // Ignition On -> Ignition Off cycle (not one row summarizing the whole day) - a vehicle
        // started/stopped multiple times in a day gets one row per trip leg, each with its own
        // Distance, matching the ignition alert data exactly instead of collapsing it. DriverName
        // resolves the same way as before: a Trip Sheet whose window contains this leg's start,
        // else the vehicle's Fixed Driver (VehicleGpsMapping), else blank - never guessed.
        // driverCodes/vehicleCodes are folded into the query text as literal IN(...) lists rather
        // than SQL parameters - there is no clean parameterized way to pass a variable-length list
        // without a table-valued parameter, and it is safe here because both are List<int> (bound
        // by ASP.NET's model binder, which only ever accepts integers - anything else fails binding
        // before this method is even called, so there is no string/injection surface).
        public List<GpsTripReportRow> GetGpsTripReport(DateTime fromDate, DateTime toDate, List<int>? driverCodes, List<int>? vehicleCodes)
        {
            var vehicleFilter = (vehicleCodes == null || vehicleCodes.Count == 0)
                ? "1=1" : $"V.VehicleCode in ({string.Join(",", vehicleCodes)})";
            var driverFilter = (driverCodes == null || driverCodes.Count == 0)
                ? "1=1" : $"ISNULL(T.DriverCode, L.FixedDriverEmployeeCode) in ({string.Join(",", driverCodes)})";

            var dt = _db.GetDataTableFromQuery(
                $@";with VehicleDevice as (
                    select V.VehicleCode, V.RegistrationNo,
                           M.GpsDeviceId,
                           LTRIM(RTRIM(REPLACE(ISNULL(M.GpsDeviceName,''), ' ', ''))) as MappedDeviceName,
                           LTRIM(RTRIM(REPLACE(ISNULL(V.RegistrationNo,''), ' ', ''))) as NormalizedRegNo,
                           M.FixedDriverEmployeeCode
                    from AdminVehicleInfo V
                    left join VehicleGpsMapping M on M.VehicleCode = V.VehicleCode
                    where ({vehicleFilter})
                  ),
                  MatchedEvents as (
                    select G.EventTime, G.AlertType, G.Address, G.Odometer, G.Latitude, G.Longitude,
                           VD.VehicleCode, VD.RegistrationNo, VD.FixedDriverEmployeeCode
                    from GpsWebhookEvent G
                    inner join VehicleDevice VD
                      on (VD.GpsDeviceId is not null and G.DeviceId = VD.GpsDeviceId)
                      or (VD.MappedDeviceName <> '' and LTRIM(RTRIM(REPLACE(ISNULL(G.DeviceName,''), ' ', ''))) = VD.MappedDeviceName)
                      or (VD.GpsDeviceId is null and VD.MappedDeviceName = '' and VD.NormalizedRegNo <> ''
                          and (LTRIM(RTRIM(REPLACE(ISNULL(G.DeviceName,''), ' ', ''))) = VD.NormalizedRegNo
                               or LTRIM(RTRIM(REPLACE(ISNULL(G.PlateNumber,''), ' ', ''))) = VD.NormalizedRegNo))
                    where CAST(G.EventTime as date) >= @FromDate and CAST(G.EventTime as date) <= @ToDate
                      and G.AlertType in ('ignition_on', 'ignition_off')
                  ),
                  -- Each Ignition On is paired with the NEXT Ignition Off after it - but only if
                  -- that Off happens no later than this vehicle's NEXT On, so a missed event never
                  -- pairs an On with an Off that actually belongs to a later cycle. Off and the
                  -- following On commonly share the exact same EventTime (an instant restart, both
                  -- delivered in the same beat) - the bound has to allow equal, not just earlier,
                  -- or that legitimate Off gets excluded and a perfectly good leg looks unfinished.
                  -- No matching Off at all (forgot to switch off, or a real vendor delivery gap)
                  -- leaves the leg open - RouteEnd/EndOdometer/EndLocation stay null rather than
                  -- dropping the row.
                  Legs as (
                    select O.VehicleCode, O.RegistrationNo, O.FixedDriverEmployeeCode,
                           CAST(O.EventTime as date) as TripDate,
                           O.EventTime as RouteStart, O.Address as StartLocation, O.Odometer as StartOdometer,
                           O.Latitude as StartLatitude, O.Longitude as StartLongitude,
                           OffEvt.EventTime as RouteEnd, OffEvt.Address as EndLocation, OffEvt.Odometer as EndOdometer,
                           OffEvt.Latitude as EndLatitude, OffEvt.Longitude as EndLongitude,
                           -- The device sometimes never delivers a leg's ignition_off webhook at
                           -- all (a vendor-side gap, same class of issue as the idle_duration
                           -- alerts that never arrive) - a later ignition_on for the same vehicle
                           -- proves this leg actually ended even though we never got the Off, so
                           -- only a leg with nothing after it at all counts as genuinely still
                           -- running right now.
                           case when OffEvt.EventTime is null
                                 and not exists (select 1 from MatchedEvents M4 where M4.VehicleCode = O.VehicleCode and M4.EventTime > O.EventTime)
                                then 1 else 0 end as IsOngoing
                    from MatchedEvents O
                    outer apply (
                      select top 1 M2.EventTime, M2.Address, M2.Odometer, M2.Latitude, M2.Longitude
                      from MatchedEvents M2
                      where M2.VehicleCode = O.VehicleCode and M2.AlertType = 'ignition_off' and M2.EventTime > O.EventTime
                        and M2.EventTime <= ISNULL(
                              (select top 1 M3.EventTime from MatchedEvents M3
                               where M3.VehicleCode = O.VehicleCode and M3.AlertType = 'ignition_on' and M3.EventTime > O.EventTime
                               order by M3.EventTime asc),
                              '9999-12-31')
                      order by M2.EventTime asc
                    ) OffEvt
                    where O.AlertType = 'ignition_on'
                  )
                  select L.VehicleCode, L.RegistrationNo, L.TripDate,
                         L.RouteStart, L.StartLocation, L.StartOdometer, L.StartLatitude, L.StartLongitude,
                         L.RouteEnd, L.EndLocation, L.EndOdometer, L.EndLatitude, L.EndLongitude, L.IsOngoing,
                         ISNULL(T.DriverCode, L.FixedDriverEmployeeCode) as DriverCode,
                         E.EmpFullName as DriverName
                  from Legs L
                  -- When two Trip Sheets for the same vehicle/date are both still Open (Camp Reach
                  -- Time not filled in yet), each looks unbounded - covering everything from its
                  -- own StartTime onward - so a leg can satisfy more than one at once. Picking the
                  -- one with the LATEST StartTime that is still <= this leg start (the most
                  -- recently clocked-in driver) resolves the tie correctly instead of an arbitrary
                  -- creation-order pick, which used to attribute a later driver leg to whoever
                  -- happened to save their Trip Sheet first.
                  outer apply (
                    select top 1 T2.DriverCode
                    from TripSheetHdr T2
                    where T2.VehicleCode = L.VehicleCode and CAST(T2.DocDate as date) = L.TripDate
                      and (T2.StartTime is null or T2.StartTime <= L.RouteStart)
                      and (T2.EndTime is null or T2.EndTime >= ISNULL(L.RouteEnd, L.RouteStart))
                    order by T2.StartTime desc, T2.Code desc
                  ) T
                  left join payrollEmployeeInfo E on E.EmployeeCode = ISNULL(T.DriverCode, L.FixedDriverEmployeeCode)
                  where ({driverFilter})
                  order by L.RegistrationNo, L.RouteStart",
                new[]
                {
                    SqlHelper.Param("@FromDate", SqlDbType.Date, fromDate.Date),
                    SqlHelper.Param("@ToDate", SqlDbType.Date, toDate.Date)
                });

            var rows = new List<GpsTripReportRow>();
            foreach (DataRow r in dt.Rows)
            {
                var startOdo = r["StartOdometer"] as decimal?;
                var endOdo = r["EndOdometer"] as decimal?;
                rows.Add(new GpsTripReportRow
                {
                    VehicleCode = Convert.ToInt32(r["VehicleCode"]),
                    RegistrationNo = r["RegistrationNo"] as string ?? "",
                    TripDate = (DateTime)r["TripDate"],
                    RouteStart = r["RouteStart"] as DateTime?,
                    StartLocation = r["StartLocation"] as string,
                    StartOdometer = startOdo,
                    StartLatitude = r["StartLatitude"] as decimal?,
                    StartLongitude = r["StartLongitude"] as decimal?,
                    RouteEnd = r["RouteEnd"] as DateTime?,
                    EndLocation = r["EndLocation"] as string,
                    EndOdometer = endOdo,
                    EndLatitude = r["EndLatitude"] as decimal?,
                    EndLongitude = r["EndLongitude"] as decimal?,
                    DistanceKm = (startOdo.HasValue && endOdo.HasValue) ? endOdo - startOdo : null,
                    IsOngoing = Convert.ToInt32(r["IsOngoing"]) == 1,
                    DriverCode = r["DriverCode"] as int?,
                    DriverName = r["DriverName"] as string
                });
            }
            return rows;
        }

        private static SqlParameter[] BuildParams(TripSheetSaveRequest req, string docNo, decimal? distanceKm, int userCode, bool includeCode = false)
        {
            var list = new List<SqlParameter>
            {
                SqlHelper.Param("@DocNo", SqlDbType.VarChar, docNo, 50),
                SqlHelper.Param("@DocDate", SqlDbType.DateTime, req.DocDate),
                SqlHelper.Param("@DriverCode", SqlDbType.Int, req.DriverCode),
                SqlHelper.Param("@VehicleCode", SqlDbType.Int, req.VehicleCode),
                SqlHelper.Param("@StartTime", SqlDbType.DateTime, req.StartTime),
                SqlHelper.Param("@StartOdometer", SqlDbType.Decimal, req.StartOdometer),
                SqlHelper.Param("@StartLocation", SqlDbType.VarChar, req.StartLocation ?? "", 500),
                SqlHelper.Param("@EndTime", SqlDbType.DateTime, req.EndTime),
                SqlHelper.Param("@EndOdometer", SqlDbType.Decimal, req.EndOdometer),
                SqlHelper.Param("@EndLocation", SqlDbType.VarChar, req.EndLocation ?? "", 500),
                SqlHelper.Param("@DistanceKm", SqlDbType.Decimal, distanceKm),
                SqlHelper.Param("@FuelConsumption", SqlDbType.Decimal, req.FuelConsumption),
                SqlHelper.Param("@Remarks", SqlDbType.VarChar, req.Remarks ?? "", 4000),
                SqlHelper.Param("@StatusCode", SqlDbType.Int, req.StatusCode),
                SqlHelper.Param("@CreatedBy", SqlDbType.Int, userCode)
            };
            if (includeCode) list.Add(SqlHelper.Param("@Code", SqlDbType.Int, req.Code));
            return list.ToArray();
        }
    }
}
