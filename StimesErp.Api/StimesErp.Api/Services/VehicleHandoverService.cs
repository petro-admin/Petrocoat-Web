using System.Data;
using Microsoft.Data.SqlClient;
using StimesErp.Api.Data;
using StimesErp.Api.Models;

namespace StimesErp.Api.Services
{
    public class VehicleHandoverService
    {
        private readonly SqlHelper _db;
        private readonly WebAuditService _audit;

        public VehicleHandoverService(SqlHelper db, WebAuditService audit)
        {
            _db = db;
            _audit = audit;
        }

        public DataTable GetList(int branchCode) => _db.GetDataTableFromQuery(
            @"select H.Code, H.DocNo, H.HandoverDate, H.VehicleCode, V.RegistrationNo,
                     H.OdometerKm, H.HandedOverByName, H.ReceivedByName, H.Reason,
                     case when H.PhotoPath is not null and LEN(H.PhotoPath) > 0 then 1 else 0 end as HasPhoto
              from VehicleHandoverHdr H
              left join AdminVehicleInfo V on V.VehicleCode = H.VehicleCode
              where H.BranchCode = @BranchCode
              order by H.HandoverDate desc",
            new[] { SqlHelper.Param("@BranchCode", SqlDbType.Int, branchCode) });

        public DataTable GetHeader(int code) => _db.GetDataTableFromQuery(
            @"select H.*, V.RegistrationNo
              from VehicleHandoverHdr H
              left join AdminVehicleInfo V on V.VehicleCode = H.VehicleCode
              where H.Code = @Code",
            new[] { SqlHelper.Param("@Code", SqlDbType.Int, code) });

        // Same "In Use" filter AccidentReport's own Vehicle dropdown uses.
        public DataTable GetVehicles() => _db.GetDataTableFromQuery(
            "select VehicleCode, RegistrationNo from AdminVehicleInfo where VehicleStatus = 'In Use' order by RegistrationNo");

        // Staff (CategoryCode 9/10/11) + Labour/Driver (12/13/14) only - same category split
        // DailySiteService's GetEmployees()/GetLabourers() use, just combined into one list here
        // since "Handed over by" / "Received by" can be either. DesigName comes from the same
        // payrollDesignationInfo join every other module uses for CurrentDesigCode. There's no
        // dedicated "employee contact number" column anywhere in the schema, so LCDTelNo (Local
        // Contact Details Tel No) is the closest available field - the web form still lets the
        // user edit Contact Number by hand after autofill, since this won't always be populated.
        public DataTable GetEmployeesForHandover() => _db.GetDataTableFromQuery(
            @"select pe.EmployeeCode, pe.EmpFullName, pd.DesigName, pe.LCDTelNo as ContactNo
              from payrollEmployeeInfo pe
              left join payrollDesignationInfo pd on pd.DesignationCode = pe.CurrentDesigCode
              where pe.ActiveYesNo = 'Y' and isnull(pe.CategoryCode, 0) in (9, 10, 11, 12, 13, 14)
              order by pe.EmpFullName");

        public string GenerateDocNo() => _db.GetDataTableFromQuery(
            "select 'VH-' + RIGHT('000000' + CAST(ISNULL(MAX(Code),0)+1 AS VARCHAR), 6) as DocNo from VehicleHandoverHdr")
            .Rows[0]["DocNo"]?.ToString() ?? "";

        // Same shared UNC storage convention every other module's document/photo upload uses.
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

        public (string Result, int Code) Save(VehicleHandoverSaveRequest req, int userCode, int branchCode)
        {
            int code;
            if (req.Code > 0)
            {
                code = req.Code;
                var p = BuildParams(req, userCode, includeCode: true);
                _db.ExecuteNonQuery(
                    @"update VehicleHandoverHdr set
                        HandoverDate=@HandoverDate, VehicleCode=@VehicleCode, OdometerKm=@OdometerKm, PhotoPath=@PhotoPath,
                        HandedOverByName=@HandedOverByName, HandedOverByDesignation=@HandedOverByDesignation, HandedOverByContact=@HandedOverByContact,
                        ReceivedByName=@ReceivedByName, ReceivedByDesignation=@ReceivedByDesignation, ReceivedByContact=@ReceivedByContact,
                        Reason=@Reason, UpdatedBy=@UserCode, UpdatedAt=GETDATE()
                      where Code=@Code",
                    p);
            }
            else
            {
                var p = BuildParams(req, userCode, includeCode: false);
                var branchParam = SqlHelper.Param("@BranchCode", SqlDbType.Int, branchCode);
                var dt = _db.GetDataTableFromQuery(
                    @"insert into VehicleHandoverHdr
                        (DocNo, HandoverDate, VehicleCode, OdometerKm, PhotoPath,
                         HandedOverByName, HandedOverByDesignation, HandedOverByContact,
                         ReceivedByName, ReceivedByDesignation, ReceivedByContact,
                         Reason, BranchCode, CreatedBy)
                      output inserted.Code
                      values
                        (@DocNo, @HandoverDate, @VehicleCode, @OdometerKm, @PhotoPath,
                         @HandedOverByName, @HandedOverByDesignation, @HandedOverByContact,
                         @ReceivedByName, @ReceivedByDesignation, @ReceivedByContact,
                         @Reason, @BranchCode, @UserCode)",
                    p.Append(branchParam).ToArray());
                code = dt.Rows.Count > 0 ? Convert.ToInt32(dt.Rows[0]["Code"]) : 0;
            }

            var action = req.Code > 0 ? "Edited" : "Added";
            if (req.Code > 0) _audit.LogEdit("Vehicle Handover", $"{req.DocNo} - Vehicle Handover {action}", branchCode);
            else _audit.LogAdd("Vehicle Handover", $"{req.DocNo} - Vehicle Handover {action}", branchCode);

            return ("Saved Successfully", code);
        }

        public void Delete(int code)
        {
            _db.ExecuteNonQuery(
                "delete from VehicleHandoverHdr where Code=@Code",
                new[] { SqlHelper.Param("@Code", SqlDbType.Int, code) });
            _audit.LogDelete("Vehicle Handover", $"Vehicle Handover Code {code} deleted");
        }

        private static SqlParameter[] BuildParams(VehicleHandoverSaveRequest req, int userCode, bool includeCode)
        {
            var list = new List<SqlParameter>
            {
                SqlHelper.Param("@DocNo", SqlDbType.VarChar, req.DocNo ?? "", 20),
                SqlHelper.Param("@HandoverDate", SqlDbType.DateTime, req.HandoverDate),
                SqlHelper.Param("@VehicleCode", SqlDbType.Int, req.VehicleCode),
                SqlHelper.Param("@OdometerKm", SqlDbType.Decimal, req.OdometerKm),
                SqlHelper.Param("@PhotoPath", SqlDbType.VarChar, req.PhotoPath ?? "", 500),
                SqlHelper.Param("@HandedOverByName", SqlDbType.VarChar, req.HandedOverByName ?? "", 150),
                SqlHelper.Param("@HandedOverByDesignation", SqlDbType.VarChar, req.HandedOverByDesignation ?? "", 100),
                SqlHelper.Param("@HandedOverByContact", SqlDbType.VarChar, req.HandedOverByContact ?? "", 50),
                SqlHelper.Param("@ReceivedByName", SqlDbType.VarChar, req.ReceivedByName ?? "", 150),
                SqlHelper.Param("@ReceivedByDesignation", SqlDbType.VarChar, req.ReceivedByDesignation ?? "", 100),
                SqlHelper.Param("@ReceivedByContact", SqlDbType.VarChar, req.ReceivedByContact ?? "", 50),
                SqlHelper.Param("@Reason", SqlDbType.VarChar, req.Reason ?? "", 500),
                SqlHelper.Param("@UserCode", SqlDbType.Int, userCode)
            };
            if (includeCode) list.Add(SqlHelper.Param("@Code", SqlDbType.Int, req.Code));
            return list.ToArray();
        }
    }
}
