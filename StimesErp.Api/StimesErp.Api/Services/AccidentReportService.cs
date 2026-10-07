using System.Data;
using Microsoft.Data.SqlClient;
using StimesErp.Api.Data;
using StimesErp.Api.Models;

namespace StimesErp.Api.Services
{
    public class AccidentReportService
    {
        private readonly SqlHelper _db;
        private readonly WebAuditService _audit;

        public AccidentReportService(SqlHelper db, WebAuditService audit)
        {
            _db = db;
            _audit = audit;
        }

        // Regular users (UCatCode=6) only ever see their own filed reports - same
        // restrictToSupervised convention Daily Site already uses. ADMIN(1)/PU(3) see everything.
        public DataTable GetList(int empCode, bool restrictToOwn)
        {
            var p = new List<SqlParameter>
            {
                SqlHelper.Param("@EmpCode", SqlDbType.Int, empCode),
                SqlHelper.Param("@Restrict", SqlDbType.Bit, restrictToOwn)
            };
            return _db.GetDataTableFromQuery(
                @"select H.Code, H.DocNo, H.DocDateTime, H.DriverEmployeeCode, E.EmpFullName as DriverName,
                         H.VehicleCode, V.RegistrationNo, H.LocationDescription, H.Severity, H.Status,
                         (select COUNT(*) from AccidentReportPhoto P where P.AccidentReportCode = H.Code) as PhotoCount
                  from AccidentReportHdr H
                  left join payrollEmployeeInfo E on E.EmployeeCode = H.DriverEmployeeCode
                  left join AdminVehicleInfo V on V.VehicleCode = H.VehicleCode
                  where (@Restrict = 0 or H.DriverEmployeeCode = @EmpCode)
                  order by H.DocDateTime desc",
                p.ToArray());
        }

        public DataTable GetHeader(int code) => _db.GetDataTableFromQuery(
            @"select H.*, E.EmpFullName as DriverName, V.RegistrationNo
              from AccidentReportHdr H
              left join payrollEmployeeInfo E on E.EmployeeCode = H.DriverEmployeeCode
              left join AdminVehicleInfo V on V.VehicleCode = H.VehicleCode
              where H.Code = @Code",
            new[] { SqlHelper.Param("@Code", SqlDbType.Int, code) });

        public DataTable GetPhotos(int code) => _db.GetDataTableFromQuery(
            "select Code, FilePath, UploadedAt from AccidentReportPhoto where AccidentReportCode = @Code order by Code",
            new[] { SqlHelper.Param("@Code", SqlDbType.Int, code) });

        public DataTable GetDocuments(int code) => _db.GetDataTableFromQuery(
            "select Code, SlNo, Description, FilePath, UploadedAt from AccidentReportDocument where AccidentReportCode = @Code order by SlNo",
            new[] { SqlHelper.Param("@Code", SqlDbType.Int, code) });

        // Same driver pool Trip Sheet's own Driver dropdown uses (CurrentDesigCode 63/159).
        public DataTable GetDrivers() => _db.GetDataTableFromQuery(
            "select EmployeeCode, EmpFullName from payrollEmployeeInfo E " +
            "where E.CurrentDesigCode in (63,159) and E.ActiveYesNo = 'Y' order by EmpFullName");

        public DataTable GetVehicles() => _db.GetDataTableFromQuery(
            "select VehicleCode, RegistrationNo from AdminVehicleInfo where VehicleStatus = 'In Use' order by RegistrationNo");

        // Auto-fill helper for the accident form: the vehicle's own last Ignition Off (not just
        // its latest GPS ping of any kind) - that is where the vehicle was last actually parked,
        // a more meaningful starting default than a mid-trip "ignition_on" reading would be. The
        // driver still edits both the Odometer and Location once they are actually at the scene;
        // this only saves them re-typing a number they would otherwise have to guess anyway. Same
        // VehicleGpsMapping-preferring device match TripSheetService's own GPS lookups use.
        public DataTable GetLastKnownGps(int vehicleCode)
        {
            var mapping = _db.GetDataTableFromQuery(
                "select GpsDeviceId, GpsDeviceName from VehicleGpsMapping where VehicleCode = @VehicleCode",
                new[] { SqlHelper.Param("@VehicleCode", SqlDbType.Int, vehicleCode) });

            if (mapping.Rows.Count > 0 && (mapping.Rows[0]["GpsDeviceId"] != DBNull.Value || !string.IsNullOrWhiteSpace(mapping.Rows[0]["GpsDeviceName"]?.ToString())))
            {
                var deviceId = mapping.Rows[0]["GpsDeviceId"] as int?;
                var deviceName = mapping.Rows[0]["GpsDeviceName"]?.ToString()?.Trim() ?? "";
                return _db.GetDataTableFromQuery(
                    @"select top 1 EventTime, Odometer, Address, Latitude, Longitude
                      from GpsWebhookEvent
                      where AlertType = 'ignition_off'
                        and ((@DeviceId is not null and DeviceId = @DeviceId)
                          or (@DeviceName <> '' and LTRIM(RTRIM(REPLACE(ISNULL(DeviceName,''), ' ', ''))) = LTRIM(RTRIM(REPLACE(@DeviceName, ' ', '')))))
                      order by EventTime desc",
                    new[]
                    {
                        SqlHelper.Param("@DeviceId", SqlDbType.Int, deviceId),
                        SqlHelper.Param("@DeviceName", SqlDbType.VarChar, deviceName, 200)
                    });
            }

            var vehicle = _db.GetDataTableFromQuery(
                "select RegistrationNo from AdminVehicleInfo where VehicleCode = @VehicleCode",
                new[] { SqlHelper.Param("@VehicleCode", SqlDbType.Int, vehicleCode) });
            if (vehicle.Rows.Count == 0) return vehicle.Clone();
            var registrationNo = vehicle.Rows[0]["RegistrationNo"]?.ToString()?.Trim() ?? "";

            return _db.GetDataTableFromQuery(
                @"select top 1 EventTime, Odometer, Address, Latitude, Longitude
                  from GpsWebhookEvent
                  where AlertType = 'ignition_off'
                    and (LTRIM(RTRIM(REPLACE(ISNULL(DeviceName,''), ' ', ''))) = LTRIM(RTRIM(REPLACE(@RegistrationNo, ' ', '')))
                      or LTRIM(RTRIM(REPLACE(ISNULL(PlateNumber,''), ' ', ''))) = LTRIM(RTRIM(REPLACE(@RegistrationNo, ' ', ''))))
                  order by EventTime desc",
                new[] { SqlHelper.Param("@RegistrationNo", SqlDbType.VarChar, registrationNo, 50) });
        }

        public string GenerateDocNo()
        {
            var dt = _db.GetDataTableFromQuery("select 'AR-' + RIGHT('000000' + CAST(ISNULL(MAX(Code),0)+1 AS VARCHAR), 6) as DocNo from AccidentReportHdr");
            return dt.Rows.Count > 0 ? dt.Rows[0]["DocNo"]?.ToString() ?? "" : "";
        }

        // Same shared network-storage convention VehicleServiceRepair's own document upload uses.
        public string GetServerPath(int branchCode)
        {
            var dt = _db.GetDataTableFromQuery(
                "select top 1 ServerPath from payrollSettings where BranchCode = @BranchCode and ServerPath is not null and LEN(ServerPath) > 0",
                new[] { SqlHelper.Param("@BranchCode", SqlDbType.Int, branchCode) });
            if (dt.Rows.Count == 0)
                dt = _db.GetDataTableFromQuery(
                    "select top 1 ServerPath from payrollSettings where ServerPath is not null and LEN(ServerPath) > 0");
            return dt.Rows.Count > 0 ? dt.Rows[0]["ServerPath"] as string ?? "" : "";
        }

        public (string Result, int Code) Save(AccidentReportSaveRequest req, int userCode)
        {
            int code;
            if (req.Code > 0)
            {
                code = req.Code;
                var p = BuildParams(req, userCode, includeCode: true);
                _db.ExecuteNonQuery(
                    @"update AccidentReportHdr set
                        DocDateTime=@DocDateTime, DriverEmployeeCode=@DriverEmployeeCode, VehicleCode=@VehicleCode,
                        OdometerKm=@OdometerKm, Latitude=@Latitude, Longitude=@Longitude, LocationDescription=@LocationDescription,
                        Severity=@Severity, AccidentDescription=@AccidentDescription,
                        OtherVehicleInvolved=@OtherVehicleInvolved, OtherVehiclePlateNo=@OtherVehiclePlateNo,
                        OtherDriverName=@OtherDriverName, OtherDriverContact=@OtherDriverContact,
                        PoliceCalled=@PoliceCalled, PoliceReportNo=@PoliceReportNo,
                        InjuriesReported=@InjuriesReported, InjuryDetails=@InjuryDetails,
                        Status=@Status, SupervisorRemarks=@SupervisorRemarks,
                        UpdatedBy=@UserCode, UpdatedAt=GETDATE()
                      where Code=@Code",
                    p);
            }
            else
            {
                var p = BuildParams(req, userCode, includeCode: false);
                var dt = _db.GetDataTableFromQuery(
                    @"insert into AccidentReportHdr
                        (DocNo, DocDateTime, DriverEmployeeCode, VehicleCode, OdometerKm, Latitude, Longitude, LocationDescription,
                         Severity, AccidentDescription, OtherVehicleInvolved, OtherVehiclePlateNo, OtherDriverName, OtherDriverContact,
                         PoliceCalled, PoliceReportNo,
                         InjuriesReported, InjuryDetails, Status, SupervisorRemarks, CreatedBy)
                      output inserted.Code
                      values
                        (@DocNo, @DocDateTime, @DriverEmployeeCode, @VehicleCode, @OdometerKm, @Latitude, @Longitude, @LocationDescription,
                         @Severity, @AccidentDescription, @OtherVehicleInvolved, @OtherVehiclePlateNo, @OtherDriverName, @OtherDriverContact,
                         @PoliceCalled, @PoliceReportNo,
                         @InjuriesReported, @InjuryDetails, @Status, @SupervisorRemarks, @UserCode)",
                    p);
                code = dt.Rows.Count > 0 ? Convert.ToInt32(dt.Rows[0]["Code"]) : 0;
            }

            // Photos are append-only from the driver's own device (never edited afterwards), so a
            // save only inserts whichever paths in the request aren't already attached - it never
            // deletes an existing photo row, unlike the header's own plain overwrite-on-update.
            foreach (var path in req.PhotoPaths.Where(p => !string.IsNullOrWhiteSpace(p)))
            {
                var exists = _db.GetDataTableFromQuery(
                    "select 1 from AccidentReportPhoto where AccidentReportCode=@Code and FilePath=@Path",
                    new[] { SqlHelper.Param("@Code", SqlDbType.Int, code), SqlHelper.Param("@Path", SqlDbType.VarChar, path) });
                if (exists.Rows.Count == 0)
                {
                    _db.ExecuteNonQuery(
                        "insert into AccidentReportPhoto (AccidentReportCode, FilePath) values (@Code, @Path)",
                        new[] { SqlHelper.Param("@Code", SqlDbType.Int, code), SqlHelper.Param("@Path", SqlDbType.VarChar, path) });
                }
            }

            // Documents (unlike Photos) carry an editable Description, so a save fully replaces
            // the set rather than only appending - simplest way to also let a description be
            // corrected or a document removed on a later edit.
            _db.ExecuteNonQuery(
                "delete from AccidentReportDocument where AccidentReportCode=@Code",
                new[] { SqlHelper.Param("@Code", SqlDbType.Int, code) });
            foreach (var doc in req.Documents.Where(d => !string.IsNullOrWhiteSpace(d.FilePath)))
            {
                _db.ExecuteNonQuery(
                    "insert into AccidentReportDocument (AccidentReportCode, SlNo, Description, FilePath) values (@Code, @SlNo, @Description, @Path)",
                    new[]
                    {
                        SqlHelper.Param("@Code", SqlDbType.Int, code),
                        SqlHelper.Param("@SlNo", SqlDbType.Int, doc.SlNo),
                        SqlHelper.Param("@Description", SqlDbType.VarChar, doc.Description ?? "", 300),
                        SqlHelper.Param("@Path", SqlDbType.VarChar, doc.FilePath, 500)
                    });
            }

            var action = req.Code > 0 ? "Edited" : "Added";
            if (req.Code > 0) _audit.LogEdit("Accident Report", $"{req.DocNo} - Accident Report {action}");
            else _audit.LogAdd("Accident Report", $"{req.DocNo} - Accident Report {action}");

            return ("Saved Successfully", code);
        }

        public void Delete(int code)
        {
            _db.ExecuteNonQuery(
                @"delete from AccidentReportPhoto where AccidentReportCode=@Code;
                  delete from AccidentReportDocument where AccidentReportCode=@Code;
                  delete from AccidentReportHdr where Code=@Code;",
                new[] { SqlHelper.Param("@Code", SqlDbType.Int, code) });
            _audit.LogDelete("Accident Report", $"Accident Report Code {code} deleted");
        }

        private static SqlParameter[] BuildParams(AccidentReportSaveRequest req, int userCode, bool includeCode)
        {
            var list = new List<SqlParameter>
            {
                SqlHelper.Param("@DocNo", SqlDbType.VarChar, req.DocNo ?? "", 20),
                SqlHelper.Param("@DocDateTime", SqlDbType.DateTime, req.DocDateTime),
                SqlHelper.Param("@DriverEmployeeCode", SqlDbType.Int, req.DriverEmployeeCode),
                SqlHelper.Param("@VehicleCode", SqlDbType.Int, req.VehicleCode),
                SqlHelper.Param("@OdometerKm", SqlDbType.Decimal, req.OdometerKm),
                SqlHelper.Param("@Latitude", SqlDbType.Decimal, req.Latitude),
                SqlHelper.Param("@Longitude", SqlDbType.Decimal, req.Longitude),
                SqlHelper.Param("@LocationDescription", SqlDbType.VarChar, req.LocationDescription ?? "", 500),
                SqlHelper.Param("@Severity", SqlDbType.VarChar, req.Severity ?? "Minor", 20),
                SqlHelper.Param("@AccidentDescription", SqlDbType.VarChar, req.AccidentDescription ?? "", 2000),
                SqlHelper.Param("@OtherVehicleInvolved", SqlDbType.Bit, req.OtherVehicleInvolved),
                SqlHelper.Param("@OtherVehiclePlateNo", SqlDbType.VarChar, req.OtherVehiclePlateNo ?? "", 50),
                SqlHelper.Param("@OtherDriverName", SqlDbType.VarChar, req.OtherDriverName ?? "", 200),
                SqlHelper.Param("@OtherDriverContact", SqlDbType.VarChar, req.OtherDriverContact ?? "", 50),
                SqlHelper.Param("@PoliceCalled", SqlDbType.Bit, req.PoliceCalled),
                SqlHelper.Param("@PoliceReportNo", SqlDbType.VarChar, req.PoliceReportNo ?? "", 100),
                SqlHelper.Param("@InjuriesReported", SqlDbType.Bit, req.InjuriesReported),
                SqlHelper.Param("@InjuryDetails", SqlDbType.VarChar, req.InjuryDetails ?? "", 1000),
                SqlHelper.Param("@Status", SqlDbType.VarChar, req.Status ?? "Submitted", 20),
                SqlHelper.Param("@SupervisorRemarks", SqlDbType.VarChar, req.SupervisorRemarks ?? "", 2000),
                SqlHelper.Param("@UserCode", SqlDbType.Int, userCode)
            };
            if (includeCode) list.Add(SqlHelper.Param("@Code", SqlDbType.Int, req.Code));
            return list.ToArray();
        }
    }
}
