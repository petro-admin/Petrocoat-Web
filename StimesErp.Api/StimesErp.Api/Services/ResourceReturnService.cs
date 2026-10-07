using System.Data;
using System.Linq;
using StimesErp.Api.Data;
using StimesErp.Api.Models;

namespace StimesErp.Api.Services
{
    public class ResourceReturnService
    {
        private readonly SqlHelper _db;
        private readonly WebAuditService _audit;

        public ResourceReturnService(SqlHelper db, WebAuditService audit)
        {
            _db = db;
            _audit = audit;
        }

        public string GetNextDocNo()
        {
            var dt = _db.GetDataTableFromProcedure("getmaterialreturnno");
            return dt.Rows.Count > 0 ? dt.Rows[0][0]?.ToString() ?? "" : "";
        }

        public DataTable GetIssueList(int branchCode, int periodId, int companyCode) =>
            _db.GetDataTableFromProcedure("getmatissuenolistsp", new[]
            {
                SqlHelper.Param("@branchcode", SqlDbType.Int, branchCode),
                SqlHelper.Param("@periodid", SqlDbType.Int, periodId),
                SqlHelper.Param("@companycode", SqlDbType.Int, companyCode)
            });

        // Who the source Resource Issue was issued to, and its free-text Project/Other Details -
        // both auto-filled read-only once a Resource Issue No is picked.
        public DataTable GetIssueInfo(int matIssueCode) => _db.GetDataTableFromQuery(
            @"select ph.OtherDetails, pe.EmpFullName as IssuedToName
              from productionMaterialIssueHdr ph
              left join payrollEmployeeInfo pe on pe.EmployeeCode = ph.MaterialIssuedToCode
              where ph.MatIssueCode = @MatIssueCode",
            new[] { SqlHelper.Param("@MatIssueCode", SqlDbType.Int, matIssueCode) });

        public DataTable GetMaterialsForIssue(int matIssueCode) =>
            _db.GetDataTableFromProcedure("getmaterialreturndetailks", new[] { SqlHelper.Param("@MatIssueCode", SqlDbType.Int, matIssueCode) });

        public DataTable GetConsumablesForIssue(int matIssueCode) =>
            _db.GetDataTableFromProcedure("getconsumablereturndetailks", new[] { SqlHelper.Param("@MatIssueCode", SqlDbType.Int, matIssueCode) });

        public DataTable GetTaeForIssue(int matIssueCode) =>
            _db.GetDataTableFromProcedure("gettoolsequipmentreturndetails", new[] { SqlHelper.Param("@MatIssueCode", SqlDbType.Int, matIssueCode) });

        // New (no desktop equivalent) - mirrors the exact balance-calc pattern the 3 SPs above use,
        // against the new MaterialReturnDtlGeneral/SubContract/TAEHire tables.
        public DataTable GetGeneralForIssue(int matIssueCode) => _db.GetDataTableFromQuery(
            @"select d.SlNo, d.ItemCode, ISNULL(d.StockQty,0) as StockQty, d.Qty, d.UnitCode, d.Rate, d.Amount, d.SupplierCode,
                     ISNULL(d.Remarks,'') as Remarks, d.BalanceQty,
                     ISNULL(d.Qty,0) - ISNULL(prev.ReturnedQty,0) as BalanceReturnedQty, 0.00 as ReturnedQty
              from productionMaterialIssueDtlGeneralServices d
              left join (
                  select dm.ItemCode, ISNULL(SUM(dm.ReturnedQty),0) as ReturnedQty
                  from MaterialReturnHdr h
                  left join MaterialReturnDtlGeneral dm on dm.MatReturnCode = h.MatReturnCode
                  where h.MatIssueCode = @MatIssueCode
                  group by dm.ItemCode
              ) prev on prev.ItemCode = d.ItemCode
              where d.MatIssueCode = @MatIssueCode
              order by d.SlNo",
            new[] { SqlHelper.Param("@MatIssueCode", SqlDbType.Int, matIssueCode) });

        public DataTable GetSubContractForIssue(int matIssueCode) => _db.GetDataTableFromQuery(
            @"select d.SlNo, d.ItemCode, ISNULL(d.StockQty,0) as StockQty, d.Qty, d.UnitCode, d.Rate, d.Amount, d.SupplierCode,
                     ISNULL(d.Remarks,'') as Remarks, d.BalanceQty,
                     ISNULL(d.Qty,0) - ISNULL(prev.ReturnedQty,0) as BalanceReturnedQty, 0.00 as ReturnedQty
              from productionMaterialIssueDtlSubContract d
              left join (
                  select dm.ItemCode, ISNULL(SUM(dm.ReturnedQty),0) as ReturnedQty
                  from MaterialReturnHdr h
                  left join MaterialReturnDtlSubContract dm on dm.MatReturnCode = h.MatReturnCode
                  where h.MatIssueCode = @MatIssueCode
                  group by dm.ItemCode
              ) prev on prev.ItemCode = d.ItemCode
              where d.MatIssueCode = @MatIssueCode
              order by d.SlNo",
            new[] { SqlHelper.Param("@MatIssueCode", SqlDbType.Int, matIssueCode) });

        public DataTable GetTaeHireForIssue(int matIssueCode) => _db.GetDataTableFromQuery(
            @"select d.SlNo, d.ToolsAndEquipmentCode, ISNULL(d.StockQty,0) as StockQty, d.Qty, d.UnitCode, d.NoOfDays,
                     d.IssuedDate, d.ReturnDate, d.Rate, d.Amount, d.SupplierCode, d.Description, d.DocUpload, d.ExpDate, d.BalanceQty,
                     ISNULL(d.Qty,0) - ISNULL(prev.ReturnedQty,0) as BalanceReturnedQty, 0.00 as ReturnedQty
              from productionMaterialIssueDtlTAEHire d
              left join (
                  select dm.ToolsAndEquipmentCode, ISNULL(SUM(dm.ReturnedQty),0) as ReturnedQty
                  from MaterialReturnHdr h
                  left join MaterialReturnDtlTAEHire dm on dm.MatReturnCode = h.MatReturnCode
                  where h.MatIssueCode = @MatIssueCode
                  group by dm.ToolsAndEquipmentCode
              ) prev on prev.ToolsAndEquipmentCode = d.ToolsAndEquipmentCode
              where d.MatIssueCode = @MatIssueCode
              order by d.SlNo",
            new[] { SqlHelper.Param("@MatIssueCode", SqlDbType.Int, matIssueCode) });

        // ---------- Lookups ----------
        public DataTable GetWarehouses(int branchCode, int companyCode) =>
            _db.GetDataTableFromProcedure("usp_production_GetWarehouseMaster", new[]
            {
                SqlHelper.Param("@tnBranchCode", SqlDbType.Int, branchCode),
                SqlHelper.Param("@tnCompanyCode", SqlDbType.Int, companyCode)
            });

        public DataTable GetEmployees() => _db.GetDataTableFromQuery(
            "select EmployeeCode, EmpFullName from payrollEmployeeInfo where ActiveYesNo='Y' order by EmpFullName");

        public DataTable GetCostCenters(int branchCode) => _db.GetDataTableFromQuery(
            "select CostId, CostName from accounts_CostCenter where BranchCode = @BranchCode",
            new[] { SqlHelper.Param("@BranchCode", SqlDbType.Int, branchCode) });

        public DataTable GetConditionOfMachine() => _db.GetDataTableFromQuery("select * from TAEConditionOfMachine");

        public DataTable GetUnits() => _db.GetDataTableFromQuery("select * from ADMINUNITINFO");

        public DataTable GetItems() => _db.GetDataTableFromQuery(
            "select ItemCode, Description as ItemName from AdminItemInfo order by ItemName");

        public DataTable GetConsumables() => _db.GetDataTableFromQuery(
            "select ConsumableCode, Description+' - '+isnull(ConsumableItemCode,'') as Specification from SalesConsumableInfo order by Description");

        public DataTable GetToolsAndEquipment() => _db.GetDataTableFromQuery(
            "select ToolsAndEquipmentCode, Description+' - '+isnull(AssetCode,'') as Specification from SalesToolsAndEquipmentinfo order by Description");

        // ---------- Code -> Name lookups (see GetMaterialsById/GetConsumablesById/GetTaeById) ----------
        private Dictionary<int, string> GetItemNameMap() =>
            _db.GetDataTableFromQuery("select ItemCode, Description from AdminItemInfo")
                .AsEnumerable().ToDictionary(r => Convert.ToInt32(r["ItemCode"]), r => r["Description"]?.ToString() ?? "");

        private Dictionary<int, string> GetConsumableNameMap() =>
            _db.GetDataTableFromQuery("select ConsumableCode, Description+' - '+isnull(ConsumableItemCode,'') as Name from SalesConsumableInfo")
                .AsEnumerable().ToDictionary(r => Convert.ToInt32(r["ConsumableCode"]), r => r["Name"]?.ToString() ?? "");

        private Dictionary<int, string> GetToolNameMap() =>
            _db.GetDataTableFromQuery("select ToolsAndEquipmentCode, Description+' - '+isnull(AssetCode,'') as Name from SalesToolsAndEquipmentinfo")
                .AsEnumerable().ToDictionary(r => Convert.ToInt32(r["ToolsAndEquipmentCode"]), r => r["Name"]?.ToString() ?? "");

        private static void AddNameColumn(DataTable dt, string codeColumn, string nameColumn, Dictionary<int, string> map)
        {
            if (!dt.Columns.Contains(nameColumn)) dt.Columns.Add(nameColumn, typeof(string));
            foreach (DataRow row in dt.Rows)
            {
                if (row[codeColumn] == DBNull.Value) continue;
                row[nameColumn] = map.TryGetValue(Convert.ToInt32(row[codeColumn]), out var name) ? name : "";
            }
        }

        // ---------- List / Edit ----------
        public DataTable GetList(int periodId, int branchCode, int companyCode) =>
            _db.GetDataTableFromProcedure("getmaterialreturndetailshdr", new[]
            {
                SqlHelper.Param("@MatReturnCode", SqlDbType.Int, 0),
                SqlHelper.Param("@tcSearchText", SqlDbType.NVarChar, "", 500),
                SqlHelper.Param("@tcSearchCriteria", SqlDbType.NVarChar, "", 500),
                SqlHelper.Param("@tnPeriodID", SqlDbType.Int, periodId),
                SqlHelper.Param("@tnBranchCode", SqlDbType.Int, branchCode),
                SqlHelper.Param("@tnCompanyCode", SqlDbType.Int, companyCode)
            });

        public DataTable GetHeaderById(int matReturnCode) =>
            _db.GetDataTableFromProcedure("getmaterialreturnheadersp", new[] { SqlHelper.Param("@MatReturnCode", SqlDbType.Int, matReturnCode) });

// getmaterialreturndetailssp/getconsumablereturndetailssp/gettaereturndetailssp (all shared
        // desktop SPs) return only the bare code, no name - backfilled here in C# against the same
        // master tables the pick-lists already use, instead of touching the shared SPs, so print/
        // detail views can show "MOBLIZATION & DEMOBILIZATION" instead of "1398".
        public DataTable GetMaterialsById(int matReturnCode)
        {
            var dt = _db.GetDataTableFromProcedure("getmaterialreturndetailssp", new[] { SqlHelper.Param("@MatRetCode", SqlDbType.Int, matReturnCode) });
            AddNameColumn(dt, "ItemCode", "ItemName", GetItemNameMap());
            return dt;
        }

        public DataTable GetConsumablesById(int matReturnCode)
        {
            var dt = _db.GetDataTableFromProcedure("getconsumablereturndetailssp", new[] { SqlHelper.Param("@MatRetCode", SqlDbType.Int, matReturnCode) });
            AddNameColumn(dt, "ConsumableCode", "ConsumableName", GetConsumableNameMap());
            return dt;
        }

        public DataTable GetTaeById(int matReturnCode)
        {
            var dt = _db.GetDataTableFromProcedure("gettaereturndetailssp", new[] { SqlHelper.Param("@MatRetCode", SqlDbType.Int, matReturnCode) });
            // The SP's own Description column is unreliable (often blank) - always prefer the
            // master name over it rather than only filling gaps, so it's consistent everywhere.
            AddNameColumn(dt, "ToolsAndEquipmentCode", "Description", GetToolNameMap());
            return dt;
        }

        public DataTable GetGeneralById(int matReturnCode) => _db.GetDataTableFromQuery(
            @"select md.SlNo, md.ItemCode, i.Description as ItemName, md.StockQty, md.Qty, md.UnitCode, md.Rate, md.Amount, md.SupplierCode, md.Remarks, md.BalanceQty,
                     md.ReturnedQty as ReturnedQty, (md.Qty - md.ReturnedQty) as BalanceReturnedQty
              from MaterialReturnHdr mh
              inner join MaterialReturnDtlGeneral md on md.MatReturnCode = mh.MatReturnCode
              left join AdminItemInfo i on i.ItemCode = md.ItemCode
              where mh.MatReturnCode = @MatRetCode and md.ReturnedQty > 0",
            new[] { SqlHelper.Param("@MatRetCode", SqlDbType.Int, matReturnCode) });

        public DataTable GetSubContractById(int matReturnCode) => _db.GetDataTableFromQuery(
            @"select md.SlNo, md.ItemCode, i.Description as ItemName, md.StockQty, md.Qty, md.UnitCode, md.Rate, md.Amount, md.SupplierCode, md.Remarks, md.BalanceQty,
                     md.ReturnedQty as ReturnedQty, (md.Qty - md.ReturnedQty) as BalanceReturnedQty
              from MaterialReturnHdr mh
              inner join MaterialReturnDtlSubContract md on md.MatReturnCode = mh.MatReturnCode
              left join AdminItemInfo i on i.ItemCode = md.ItemCode
              where mh.MatReturnCode = @MatRetCode and md.ReturnedQty > 0",
            new[] { SqlHelper.Param("@MatRetCode", SqlDbType.Int, matReturnCode) });

        public DataTable GetTaeHireById(int matReturnCode) => _db.GetDataTableFromQuery(
            @"select md.SlNo, md.ToolsAndEquipmentCode, md.StockQty, md.Qty, md.UnitCode, md.NoOfDays, md.IssuedDate, md.ReturnDate,
                     md.Rate, md.Amount, md.SupplierCode, md.Description, md.DocUpload, md.ExpDate, md.BalanceQty,
                     md.ReturnedQty as ReturnedQty, (md.Qty - md.ReturnedQty) as BalanceReturnedQty
              from MaterialReturnHdr mh
              inner join MaterialReturnDtlTAEHire md on md.MatReturnCode = mh.MatReturnCode
              where mh.MatReturnCode = @MatRetCode and md.ReturnedQty > 0",
            new[] { SqlHelper.Param("@MatRetCode", SqlDbType.Int, matReturnCode) });

        // ---------- Save / Delete ----------
        public (string Result, int Code) Save(ResourceReturnSaveRequest req, int userCode, int branchCode, int companyCode, int periodId)
        {
            var p = new[]
            {
                SqlHelper.Param("@MatReturnCode", SqlDbType.Int, req.MatReturnCode),
                SqlHelper.Param("@MatIssueCode", SqlDbType.Int, req.MatIssueCode),
                SqlHelper.Param("@MatReturnNo", SqlDbType.VarChar, req.MatReturnNo ?? "", 50),
                SqlHelper.Param("@MatReturnDate", SqlDbType.DateTime, req.MatReturnDate),
                SqlHelper.Param("@tnJobCode", SqlDbType.Int, 0),
                // Matches desktop's own (confusing) behaviour: MatReturnedBy is actually the
                // logged-in user's code (desktop passes ddlCreatedBy.SelectedValue here, NOT the
                // "Material Returned By" employee picker's value) - replicated as-is for parity.
                SqlHelper.Param("@MatReturnedBy", SqlDbType.Int, userCode),
                SqlHelper.Param("@ProjectDetails", SqlDbType.VarChar, req.ProjectDetails ?? "", 500),
                SqlHelper.Param("@CostId", SqlDbType.Int, req.CostId),
                SqlHelper.Param("@BranchCode", SqlDbType.Int, branchCode),
                SqlHelper.Param("@CompanyCode", SqlDbType.Int, companyCode),
                SqlHelper.Param("@PeriodID", SqlDbType.Int, periodId),
                SqlHelper.Param("@UserCode", SqlDbType.Int, userCode),
                SqlHelper.TableParam("@dtRetMaterial", "ERPDB_UDT_ResourceReturnMaterial", ToMaterialTable(req.Materials)),
                SqlHelper.TableParam("@dtRetConsumable", "ERPDB_UDT_ResourceReturnConsumable", ToMaterialTable(req.Consumables)),
                SqlHelper.TableParam("@dtRetTAE", "ERPDB_UDT_ResourceReturnNewTAE", ToTaeTable(req.ToolsAndEquipment)),
                SqlHelper.Param("@warehousecode", SqlDbType.Int, req.WarehouseCode),
                SqlHelper.TableParam("@dtRetGeneral", "ERPDB_UDT_ResourceReturnGeneral", ToServiceTable(req.GeneralServices)),
                SqlHelper.TableParam("@dtRetSubContract", "ERPDB_UDT_ResourceReturnSubContract", ToServiceTable(req.SubContract)),
                SqlHelper.TableParam("@dtRetTAEHire", "ERPDB_UDT_ResourceReturnTAEHire", ToTaeHireTable(req.ToolsAndEquipmentHire))
            };

            var dt = _db.GetDataTableFromProcedure("managematerialreturndetails", p);
            if (dt.Rows.Count == 0) return ("", 0);
            var row = dt.Rows[0];

            var action = req.MatReturnCode > 0 ? "Edited" : "Added";
            if (req.MatReturnCode > 0) _audit.LogEdit("Resource Return", $"{req.MatReturnNo} - Resource Return {action}", branchCode);
            else _audit.LogAdd("Resource Return", $"{req.MatReturnNo} - Resource Return {action}", branchCode);

            return (row["QueryStatus"]?.ToString() ?? "", row["MatReturnCode"] == DBNull.Value ? 0 : Convert.ToInt32(row["MatReturnCode"]));
        }

        // No desktop equivalent (Delete's click handler on desktop is an empty stub) - mirrors the
        // save SP's own cleanup logic (header + all 6 detail tables + the stock/status ledger rows
        // it tagged with Mode='RETURN' against this MatReturnCode) without re-inserting anything.
        public void Delete(int matReturnCode, int branchCode, int companyCode)
        {
            _db.ExecuteNonQuery(
                @"delete from InvoiceMaterialStock where BranchCode=@BranchCode and CompanyCode=@CompanyCode and TransactionNo=@MatReturnCode and Mode='RETURN';
                  delete from InvoiceMaterialStockForConsumableAndTAE where BranchCode=@BranchCode and CompanyCode=@CompanyCode and TransactionNo=@MatReturnCode and Mode='RETURN';
                  delete from MachineryStatusHdr where BranchCode=@BranchCode and TransactionCode=@MatReturnCode and Mode='RETURN';
                  delete from MaterialReturnDtlMaterial where MatReturnCode=@MatReturnCode;
                  delete from MaterialReturnDtlConsumable where MatReturnCode=@MatReturnCode;
                  delete from MaterialReturnDtlTAE where MatReturnCode=@MatReturnCode;
                  delete from MaterialReturnDtlGeneral where MatReturnCode=@MatReturnCode;
                  delete from MaterialReturnDtlSubContract where MatReturnCode=@MatReturnCode;
                  delete from MaterialReturnDtlTAEHire where MatReturnCode=@MatReturnCode;
                  delete from MaterialReturnHdr where MatReturnCode=@MatReturnCode and BranchCode=@BranchCode and CompanyCode=@CompanyCode;",
                new[]
                {
                    SqlHelper.Param("@MatReturnCode", SqlDbType.Int, matReturnCode),
                    SqlHelper.Param("@BranchCode", SqlDbType.Int, branchCode),
                    SqlHelper.Param("@CompanyCode", SqlDbType.Int, companyCode)
                });
            _audit.LogDelete("Resource Return", $"Material Return Code {matReturnCode} deleted", branchCode);
        }

        // ---------- TVP builders ----------
        private static DataTable ToMaterialTable(List<ResourceReturnMaterialRow> rows)
        {
            var dt = new DataTable();
            dt.Columns.Add("SlNo", typeof(int));
            dt.Columns.Add("Code", typeof(int));
            dt.Columns.Add("StockQty", typeof(decimal));
            dt.Columns.Add("EstQty", typeof(decimal));
            dt.Columns.Add("AvailableQty", typeof(decimal));
            dt.Columns.Add("OrderedQty", typeof(decimal));
            dt.Columns.Add("IssuedQty", typeof(decimal));
            dt.Columns.Add("ReturnedQty", typeof(decimal));
            dt.Columns.Add("BalanceRequiredQty", typeof(decimal));
            dt.Columns.Add("UnitCode", typeof(int));
            dt.Columns.Add("Rate", typeof(decimal));
            dt.Columns.Add("Amount", typeof(decimal));
            dt.Columns.Add("SupplierCode", typeof(int));
            dt.Columns.Add("BalanceQty", typeof(decimal));
            dt.Columns.Add("ExpiryDate", typeof(DateTime));

            foreach (var r in rows)
            {
                if (r.ReturnedQty <= 0) continue;
                dt.Rows.Add(r.SlNo, r.Code, r.StockQty, r.EstQty, r.AvailableQty, r.OrderedQty, r.IssuedQty, r.ReturnedQty,
                    r.BalanceRequiredQty, r.UnitCode, r.Rate, r.Amount, r.SupplierCode, r.BalanceQty, (object?)r.ExpiryDate ?? DBNull.Value);
            }
            return dt;
        }

        private static DataTable ToTaeTable(List<ResourceReturnTaeRow> rows)
        {
            var dt = new DataTable();
            dt.Columns.Add("SlNo", typeof(int));
            dt.Columns.Add("ToolsAndEquipmentCode", typeof(int));
            dt.Columns.Add("StockQty", typeof(decimal));
            dt.Columns.Add("Qty", typeof(decimal));
            dt.Columns.Add("UnitCode", typeof(int));
            dt.Columns.Add("NoOfDays", typeof(decimal));
            dt.Columns.Add("IssuedDate", typeof(DateTime));
            dt.Columns.Add("ReturnDate", typeof(DateTime));
            dt.Columns.Add("ConditionOfMachine", typeof(int));
            dt.Columns.Add("Description", typeof(string));
            dt.Columns.Add("DocUpload", typeof(string));
            dt.Columns.Add("ExpDate", typeof(DateTime));
            dt.Columns.Add("BalanceQty", typeof(decimal));
            dt.Columns.Add("ReturnedQty", typeof(decimal));

            foreach (var r in rows)
            {
                if (r.ReturnedQty <= 0) continue;
                dt.Rows.Add(r.SlNo, r.ToolsAndEquipmentCode, r.StockQty, r.Qty, r.UnitCode, r.NoOfDays,
                    (object?)r.IssuedDate ?? DBNull.Value, (object?)r.ReturnDate ?? DBNull.Value, r.ConditionOfMachine,
                    r.Description ?? "", (object?)r.DocUpload ?? DBNull.Value, (object?)r.ExpDate ?? DBNull.Value, r.BalanceQty, r.ReturnedQty);
            }
            return dt;
        }

        private static DataTable ToServiceTable(List<ResourceReturnServiceRow> rows)
        {
            var dt = new DataTable();
            dt.Columns.Add("SlNo", typeof(int));
            dt.Columns.Add("Code", typeof(int));
            dt.Columns.Add("StockQty", typeof(decimal));
            dt.Columns.Add("Qty", typeof(decimal));
            dt.Columns.Add("ReturnedQty", typeof(decimal));
            dt.Columns.Add("UnitCode", typeof(int));
            dt.Columns.Add("Rate", typeof(decimal));
            dt.Columns.Add("Amount", typeof(decimal));
            dt.Columns.Add("SupplierCode", typeof(int));
            dt.Columns.Add("Remarks", typeof(string));
            dt.Columns.Add("BalanceQty", typeof(decimal));

            foreach (var r in rows)
            {
                if (r.ReturnedQty <= 0) continue;
                dt.Rows.Add(r.SlNo, r.Code, r.StockQty, r.Qty, r.ReturnedQty, r.UnitCode, r.Rate, r.Amount, r.SupplierCode, r.Remarks ?? "", r.BalanceQty);
            }
            return dt;
        }

        private static DataTable ToTaeHireTable(List<ResourceReturnTaeHireRow> rows)
        {
            var dt = new DataTable();
            dt.Columns.Add("SlNo", typeof(int));
            dt.Columns.Add("ToolsAndEquipmentCode", typeof(int));
            dt.Columns.Add("StockQty", typeof(decimal));
            dt.Columns.Add("Qty", typeof(decimal));
            dt.Columns.Add("ReturnedQty", typeof(decimal));
            dt.Columns.Add("UnitCode", typeof(int));
            dt.Columns.Add("NoOfDays", typeof(decimal));
            dt.Columns.Add("IssuedDate", typeof(DateTime));
            dt.Columns.Add("ReturnDate", typeof(DateTime));
            dt.Columns.Add("Rate", typeof(decimal));
            dt.Columns.Add("Amount", typeof(decimal));
            dt.Columns.Add("SupplierCode", typeof(int));
            dt.Columns.Add("Description", typeof(string));
            dt.Columns.Add("DocUpload", typeof(string));
            dt.Columns.Add("ExpDate", typeof(DateTime));
            dt.Columns.Add("BalanceQty", typeof(decimal));

            foreach (var r in rows)
            {
                if (r.ReturnedQty <= 0) continue;
                dt.Rows.Add(r.SlNo, r.ToolsAndEquipmentCode, r.StockQty, r.Qty, r.ReturnedQty, r.UnitCode, r.NoOfDays,
                    (object?)r.IssuedDate ?? DBNull.Value, (object?)r.ReturnDate ?? DBNull.Value, r.Rate, r.Amount, r.SupplierCode,
                    r.Description ?? "", (object?)r.DocUpload ?? DBNull.Value, (object?)r.ExpDate ?? DBNull.Value, r.BalanceQty);
            }
            return dt;
        }

        // Same shared network-share convention as VSR/Leave Application document uploads.
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
    }
}
