using System.Data;
using StimesErp.Api.Data;
using StimesErp.Api.Models;

namespace StimesErp.Api.Services
{
    public class VehicleServiceRepairService
    {
        private readonly SqlHelper _db;
        private readonly WebAuditService _audit;

        public VehicleServiceRepairService(SqlHelper db, WebAuditService audit)
        {
            _db = db;
            _audit = audit;
        }

        public DataTable GetList() =>
            _db.GetDataTableFromProcedure("usp_GetVehicleServiceRepairList", new[] { SqlHelper.Param("@Code", SqlDbType.Int, 0) });

        public DataTable GetHeader(int code) =>
            _db.GetDataTableFromProcedure("usp_GetVehicleServiceRepairList", new[] { SqlHelper.Param("@Code", SqlDbType.Int, code) });

        public DataTable GetItems(int code) =>
            _db.GetDataTableFromProcedure("usp_GetVehicleServiceRepairDtl", new[] { SqlHelper.Param("@Code", SqlDbType.Int, code) });

        public DataTable GetDocuments(int code) =>
            _db.GetDataTableFromProcedure("usp_GetVehicleServiceRepairDocuments", new[] { SqlHelper.Param("@Code", SqlDbType.Int, code) });

        // Same shared network-share convention the desktop app uses for every document/photo
        // upload (PurchaseDocumentStorage.xaml.cs, VehicleRepair.xaml.cs, EmpPhoto, etc.) - a
        // UNC root read from payrollSettings.ServerPath per branch, e.g. \\erpsrv\stimes\uploaded\ -
        // instead of a folder next to the API's own deployed files (which a redeploy can wipe).
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

        // Read-only pull from the desktop's own Vehicle Inspection module (VehicleInspection /
        // VehicleInspectionDtl, via the desktop's existing usp_GetVehicleInspectionDtlForMachineryRepair,
        // same source MachineryRepairOrBreakDownRegister.xaml.cs reads on desktop) - used to
        // auto-fill the Repair/Service Items grid when a vehicle is picked. Nothing is ever
        // written back into the desktop's own tables.
        public DataTable GetLatestVehicleInspectionChecklist(int vehicleCode)
        {
            var codeDt = _db.GetDataTableFromQuery(
                "select top 1 VehicleInspectionCode from VehicleInspection where VehicleCode=@VehicleCode order by DocDate desc, VehicleInspectionCode desc",
                new[] { SqlHelper.Param("@VehicleCode", SqlDbType.Int, vehicleCode) });
            if (codeDt.Rows.Count == 0) return new DataTable();

            var inspectionCode = Convert.ToInt32(codeDt.Rows[0]["VehicleInspectionCode"]);
            return _db.GetDataTableFromProcedure("usp_GetVehicleInspectionDtlForMachineryRepair",
                new[] { SqlHelper.Param("@Code", SqlDbType.Int, inspectionCode) });
        }

        // Vehicle picker - only master table shared with the rest of the ERP. Only vehicles
        // currently In Use are selectable (excludes retired/Dispired vehicles), and only those
        // whose BranchCode resolves to a real, valid branch and whose VehMfCode resolves to a
        // real manufacturer (excludes orphaned/misconfigured vehicle records).
        public DataTable GetVehicles() => _db.GetDataTableFromQuery(
            @"select V.VehicleCode, V.RegistrationNo, V.VehicleModel
              from AdminVehicleInfo V
              inner join AdminBranchInfo br on br.BranchCode = V.BranchCode
              inner join payrollVehicleManufacturer vm on vm.MFCode = V.VehMfCode
              where V.VehicleStatus = 'In Use'
              order by V.RegistrationNo");

        // Driver picker - active employees under the Driver designation codes, plus anyone in the
        // Driver/Transport employee categories (9,10,11) so drivers outside those two designations
        // still show up.
        public DataTable GetDrivers() => _db.GetDataTableFromQuery(
            "select EmployeeCode, EmpFullName from payrollEmployeeInfo E " +
            "where (E.CurrentDesigCode in (63,159) or ISNULL(E.CategoryCode,0) in (9,10,11)) and E.ActiveYesNo = 'Y' " +
            "order by E.EmpFullName");

        // Preview only - the actual DocNo is finalized against the real IDENTITY value inside
        // usp_ManageVehicleServiceRepair at save time, same MAX()+1 race as every other doc-no
        // preview in this app (acceptable - a genuine collision just means the save silently uses
        // the real next number instead of the previewed one).
        public string GenerateDocNo()
        {
            var dt = _db.GetDataTableFromQuery("select 'VSR-' + RIGHT('000000' + CAST(ISNULL(MAX(Code),0)+1 AS VARCHAR), 6) as DocNo from VehicleServiceRepairHdr");
            return dt.Rows.Count > 0 ? dt.Rows[0]["DocNo"]?.ToString() ?? "" : "";
        }

        public (string Result, int Code) Save(VehicleServiceRepairSaveRequest req, int periodId, int userCode, int mode, int moduleCode)
        {
            var dtItems = ToItemsTable(req.Items);
            var dtDocuments = ToDocumentsTable(req.Documents);

            var p = new[]
            {
                SqlHelper.Param("@Code", SqlDbType.Int, req.Code),
                SqlHelper.Param("@DocNo", SqlDbType.VarChar, req.DocNo ?? "", 50),
                SqlHelper.Param("@DocDate", SqlDbType.DateTime, req.DocDate),
                SqlHelper.Param("@VehicleCode", SqlDbType.Int, req.VehicleCode),
                SqlHelper.Param("@BranchCode", SqlDbType.Int, req.BranchCode),
                SqlHelper.Param("@DriverCode", SqlDbType.Int, req.DriverCode == 0 ? null : req.DriverCode),
                SqlHelper.Param("@ServiceType", SqlDbType.VarChar, req.ServiceType ?? "REPAIR", 20),
                SqlHelper.Param("@CurrentKM", SqlDbType.Decimal, req.CurrentKM),
                SqlHelper.Param("@NextServiceKM", SqlDbType.Decimal, req.NextServiceKM),
                SqlHelper.Param("@ServiceDate", SqlDbType.DateTime, req.ServiceDate),
                SqlHelper.Param("@NextServiceDueDate", SqlDbType.DateTime, req.NextServiceDueDate),
                SqlHelper.Param("@Remarks", SqlDbType.VarChar, req.Remarks ?? "", 8000),
                SqlHelper.Param("@Active", SqlDbType.Char, req.Active ? "Y" : "N", 1),
                SqlHelper.Param("@StatusCode", SqlDbType.Int, req.StatusCode == 0 ? 1 : req.StatusCode),
                SqlHelper.Param("@CompletedDate", SqlDbType.DateTime, req.CompletedDate),
                SqlHelper.Param("@PeriodId", SqlDbType.Int, periodId),
                SqlHelper.Param("@UserCode", SqlDbType.Int, userCode),
                SqlHelper.Param("@ModuleCode", SqlDbType.Int, moduleCode),
                SqlHelper.TableParam("@dtDtl", "UDT_VehicleServiceRepairDtl", dtItems),
                SqlHelper.TableParam("@dtDocuments", "UDT_VehicleServiceRepairDocuments", dtDocuments),
                SqlHelper.Param("@Mode", SqlDbType.Int, mode),
                SqlHelper.Param("@VatPercent", SqlDbType.Decimal, req.VatPercent),
                SqlHelper.Param("@VatAmount", SqlDbType.Decimal, req.VatAmount),
                SqlHelper.Param("@TotalAmount", SqlDbType.Decimal, req.TotalAmount),
                SqlHelper.Param("@DiscountAmount", SqlDbType.Decimal, req.DiscountAmount),
                SqlHelper.Param("@NetAmount", SqlDbType.Decimal, req.NetAmount)
            };

            var dt = _db.GetDataTableFromProcedure("usp_ManageVehicleServiceRepair", p);
            if (dt.Rows.Count == 0) return ("", 0);

            var row = dt.Rows[0];
            var result = row["Result"]?.ToString() ?? "";
            var code = row["Code"] == DBNull.Value ? 0 : Convert.ToInt32(row["Code"]);

            if (mode == 0) _audit.LogAdd("Vehicle Service/Repair", $"{req.DocNo} - Vehicle Service/Repair Added", req.BranchCode);
            else if (mode == 2) _audit.LogDelete("Vehicle Service/Repair", $"{req.DocNo} - Vehicle Service/Repair Deleted", req.BranchCode);
            else _audit.LogEdit("Vehicle Service/Repair", $"{req.DocNo} - Vehicle Service/Repair Edited", req.BranchCode);

            return (result, code);
        }

        private static DataTable ToItemsTable(List<VehicleServiceRepairDtlRow> rows)
        {
            var dt = new DataTable();
            dt.Columns.Add("SlNo", typeof(int));
            dt.Columns.Add("Description", typeof(string));
            dt.Columns.Add("Qty", typeof(decimal));
            dt.Columns.Add("Rate", typeof(decimal));
            dt.Columns.Add("Amount", typeof(decimal));
            dt.Columns.Add("VatPercent", typeof(decimal));
            dt.Columns.Add("VatAmount", typeof(decimal));
            dt.Columns.Add("StatusCode", typeof(int));
            dt.Columns.Add("Remarks", typeof(string));
            dt.Columns.Add("Parts", typeof(string));

            foreach (var row in rows)
            {
                // Mirrors the frontend's own save filter - a row counts as real data if it has a
                // Description OR a Rate OR Remarks, not just Description alone (a row with Rate
                // typed in but Description still blank used to be silently dropped here).
                if (string.IsNullOrWhiteSpace(row.Description) && row.Rate == 0 && string.IsNullOrWhiteSpace(row.Remarks)) continue;
                var dr = dt.NewRow();
                dr["SlNo"] = row.SlNo;
                dr["Description"] = row.Description ?? "";
                dr["Qty"] = row.Qty;
                dr["Rate"] = row.Rate;
                dr["Amount"] = row.Amount;
                dr["VatPercent"] = row.VatPercent;
                dr["VatAmount"] = row.VatAmount;
                dr["StatusCode"] = row.StatusCode;
                dr["Remarks"] = row.Remarks ?? "";
                dr["Parts"] = (object?)row.Parts ?? DBNull.Value;
                dt.Rows.Add(dr);
            }
            return dt;
        }

        private static DataTable ToDocumentsTable(List<VehicleServiceRepairDocumentRow> rows)
        {
            var dt = new DataTable();
            dt.Columns.Add("SlNo", typeof(int));
            dt.Columns.Add("Description", typeof(string));
            dt.Columns.Add("Remarks", typeof(string));
            dt.Columns.Add("DocUpload", typeof(string));

            foreach (var row in rows)
            {
                if (string.IsNullOrWhiteSpace(row.Description)) continue;
                var dr = dt.NewRow();
                dr["SlNo"] = row.SlNo;
                dr["Description"] = row.Description ?? "";
                dr["Remarks"] = row.Remarks ?? "";
                dr["DocUpload"] = (object?)row.DocUpload ?? DBNull.Value;
                dt.Rows.Add(dr);
            }
            return dt;
        }
    }
}
