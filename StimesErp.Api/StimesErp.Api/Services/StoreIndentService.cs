using System.Data;
using StimesErp.Api.Data;
using StimesErp.Api.Models;

namespace StimesErp.Api.Services
{
    /// <summary>
    /// Web equivalent of Stimes.Erp.Library.POPPrchsRequisition's StoreIndent-related methods -
    /// calls the exact same stored procedures the desktop app's StoreIndent.xaml.cs calls.
    /// </summary>
    public class StoreIndentService
    {
        private readonly SqlHelper _db;

        public StoreIndentService(SqlHelper db)
        {
            _db = db;
        }

        // POPPrchsRequisition.GetStoreIndent - list grid (PReqnCode=0) and single-record header
        // load (PReqnCode>0). PurchaseReqCodes/SystemName are always left blank by the desktop
        // caller (no filtering applied), so they aren't exposed here.
        public DataTable GetList(int branchCode, int monthCode, int periodId, int yearCode)
        {
            var p = new[]
            {
                SqlHelper.Param("@PReqnCode", SqlDbType.Int, 0),
                SqlHelper.Param("@tcPurchaseReqCodes", SqlDbType.VarChar, "", 2000),
                SqlHelper.Param("@tcSystemName", SqlDbType.VarChar, "", 2000),
                SqlHelper.Param("@BranchCode", SqlDbType.Int, branchCode),
                SqlHelper.Param("@MonthCode", SqlDbType.Int, monthCode),
                SqlHelper.Param("@PeriodId", SqlDbType.Int, periodId),
                SqlHelper.Param("@YearCode", SqlDbType.Int, yearCode)
            };
            return _db.GetDataTableFromProcedure("GetStoreIndent", p);
        }

        public DataTable GetHeader(int pReqnCode, int branchCode)
        {
            var p = new[]
            {
                SqlHelper.Param("@PReqnCode", SqlDbType.Int, pReqnCode),
                SqlHelper.Param("@tcPurchaseReqCodes", SqlDbType.VarChar, "", 2000),
                SqlHelper.Param("@tcSystemName", SqlDbType.VarChar, "", 2000),
                SqlHelper.Param("@BranchCode", SqlDbType.Int, branchCode),
                SqlHelper.Param("@MonthCode", SqlDbType.Int, 0),
                SqlHelper.Param("@PeriodId", SqlDbType.Int, 0),
                SqlHelper.Param("@YearCode", SqlDbType.Int, 0)
            };
            return _db.GetDataTableFromProcedure("GetStoreIndent", p);
        }

        public DataTable GetGeneral(int pReqnCode)
        {
            var p = new[] { SqlHelper.Param("@PReqnCode", SqlDbType.Int, pReqnCode) };
            return _db.GetDataTableFromProcedure("usp_GetStoreIndentDtlsGeneral", p);
        }

        public DataTable GetMaterial(int pReqnCode)
        {
            var p = new[] { SqlHelper.Param("@PReqnCode", SqlDbType.Int, pReqnCode) };
            return _db.GetDataTableFromProcedure("[usp_Purchase_GetStoreIndentDtlsMaterial]", p);
        }

        public DataTable GetConsumable(int pReqnCode)
        {
            var p = new[] { SqlHelper.Param("@PReqnCode", SqlDbType.Int, pReqnCode) };
            return _db.GetDataTableFromProcedure("usp_Purchase_GetStoreIndentDtlsConsumable", p);
        }

        public DataTable GetTAE(int pReqnCode)
        {
            var p = new[] { SqlHelper.Param("@PReqnCode", SqlDbType.Int, pReqnCode) };
            return _db.GetDataTableFromProcedure("usp_Purchase_GetStoreIndentDtlsTAE", p);
        }

        // Project-mode SO-linked pulls - GetSalesOrderMaterialDetailsForStoreIndent /
        // GetEstimationConsumableDetailsForStoreIndent / GetEstimationTAEDetailsForStoreIndent.
        public DataTable GetSalesOrderMaterial(int soCode, int periodId)
        {
            var p = new[]
            {
                SqlHelper.Param("@SOCode", SqlDbType.Int, soCode),
                SqlHelper.Param("@PeriodId", SqlDbType.Int, periodId)
            };
            return _db.GetDataTableFromProcedure("usp_GetSalesOrderMaterialDetailsForStoreIndent", p);
        }

        public DataTable GetEstimationConsumable(int soCode, int periodId)
        {
            var p = new[]
            {
                SqlHelper.Param("@SOCode", SqlDbType.Int, soCode),
                SqlHelper.Param("@PeriodId", SqlDbType.Int, periodId)
            };
            return _db.GetDataTableFromProcedure("usp_GetEstimationConsumableDetailsForStoreIndent", p);
        }

        public DataTable GetEstimationTAE(int soCode, int periodId, int taeType)
        {
            var p = new[]
            {
                SqlHelper.Param("@SOCode", SqlDbType.Int, soCode),
                SqlHelper.Param("@PeriodId", SqlDbType.Int, periodId),
                SqlHelper.Param("@TAEType", SqlDbType.Int, taeType)
            };
            return _db.GetDataTableFromProcedure("usp_GetEstimationTAEDetailsForStoreIndent", p);
        }

        // SetPReqNo() -> GetRRequisition_No("", PeriodId)
        public string GenerateRequisitionNo(int periodId)
        {
            var p = new[]
            {
                SqlHelper.Param("@tcPurOrMat", SqlDbType.VarChar, "", 20),
                SqlHelper.Param("@PeriodId", SqlDbType.Int, periodId)
            };
            return _db.DataTransactionsByProcedure("usp_purchase_GetRRequisition_No", p);
        }

        // subPositionsComboDesc_SelectionChanged_1 - Item/Consumable/TAE lookup fed into the
        // General grid's Type-driven combobox column.
        public DataTable GetGeneralItemLookup(int typeCode) => typeCode switch
        {
            1 => _db.GetDataTableFromQuery("select ItemCode as ItemCode,isnull(Description,'')+'-'+Convert(varchar,isnull(ItemItemCode,'')) as Description from AdminItemInfo"),
            2 => _db.GetDataTableFromQuery("select ConsumableCode as ItemCode,Description+'-'+Convert(varchar,isnull(ConsumableItemCode,'')) as Description from SalesConsumableInfo"),
            3 => _db.GetDataTableFromQuery("select ToolsAndEquipmentCode as ItemCode,Description+'-'+Convert(varchar,isnull(TANDEItemCode,'')) as Description from SalesToolsAndEquipmentinfo"),
            _ => new DataTable()
        };

        // gvGeneral_CellEditEnded's item-selected lookup (Status = Exist) ->
        // Usp_getItemWithCategoryMakeForPurchase, for UnitCode/StockQty.
        public DataTable GetItemSpecificationForPurchase(int itemCode, int typeCode, int periodId)
        {
            var p = new[]
            {
                SqlHelper.Param("@ItemCode", SqlDbType.Int, itemCode),
                SqlHelper.Param("@ItemCategoryCode", SqlDbType.Int, 0),
                SqlHelper.Param("@MakeId", SqlDbType.Int, 0),
                SqlHelper.Param("@Mode", SqlDbType.VarChar, typeCode.ToString(), 2000),
                SqlHelper.Param("@PeriodId", SqlDbType.Int, periodId),
                SqlHelper.Param("@LineTypeCode", SqlDbType.Int, typeCode)
            };
            return _db.GetDataTableFromProcedure("Usp_getItemWithCategoryMakeForPurchase", p);
        }

        public DataTable GetCostCenters(int branchCode) => _db.GetDataTableFromQuery(
            "select CostId,CostName from accounts_CostCenter where BranchCode=@BranchCode",
            new[] { SqlHelper.Param("@BranchCode", SqlDbType.Int, branchCode) });

        public DataTable GetUnits() => _db.GetDataTableFromQuery("select * from ADMINUNITINFO");

        // FillEmployee - Inhouse subtype's Employee autocomplete.
        public DataTable GetEmployees() => _db.GetDataTableFromQuery(
            "Select Pe.DepartmentCode,pe.EmpID,pe.EmpFullName,pe.EmployeeCode from PayrollEmployeeInfo Pe " +
            "left join AdminDepartmentInfo Ad on Ad.DepartmentCode=Pe.DepartmentCode where Pe.ActiveYesNo='Y'");

        // FillResourceRequestedStatus - Inhouse subtype's Requested Status dropdown.
        public DataTable GetResourceRequestedStatuses() => _db.GetDataTableFromQuery("select * from ResourceRequestedStatus");

        // txtEmployee_SelectionChanged - resolves an employee's current designation.
        public string GetEmployeeDesignation(int employeeCode)
        {
            var dt = _db.GetDataTableFromQuery(
                "select DesigName from payrollEmployeeInfo p left join payrollDesignationInfo d on d.DesignationCode=p.CurrentDesigCode where p.EmployeeCode=@EmployeeCode",
                new[] { SqlHelper.Param("@EmployeeCode", SqlDbType.Int, employeeCode) });
            return dt.Rows.Count > 0 ? dt.Rows[0]["DesigName"]?.ToString() ?? "" : "";
        }

        // FillJobList - Sales Order dropdown for txtJobDet (Project mode job/SO selector).
        public DataTable GetSalesOrders(int branchCode) => _db.GetDataTableFromQuery(
            "select SOCode,SONo+' - '+Q.QuotationNo+ case when SC.CustomerName is null then '' else ' - '+SC.CustomerName end as SONo, S.ProjectOrLocation " +
            "from SalesOrderNew S left join sopCustomerInfo SC on SC.CustomerCode=S.CustomerCode left join salesQuotationHdr Q on Q.QuotationCode=S.QuotationCode " +
            "where S.BranchCode=@BranchCode",
            new[] { SqlHelper.Param("@BranchCode", SqlDbType.Int, branchCode) });

        // FillUser / Fillcheked / FillApprvdUser - User.GetUserOfSelectedBranch(), same SP for
        // Created By / Checked By / Approved By.
        public DataTable GetUsersOfBranch(int branchCode)
        {
            var p = new[]
            {
                SqlHelper.Param("@tnUserCode", SqlDbType.Int, 0),
                SqlHelper.Param("@tcUserID", SqlDbType.VarChar, "", 100),
                SqlHelper.Param("@tcSearchText", SqlDbType.VarChar, "", 1000),
                SqlHelper.Param("@tcSearchCriteria", SqlDbType.VarChar, "", 1000),
                SqlHelper.Param("@BranchCode", SqlDbType.Int, branchCode)
            };
            return _db.GetDataTableFromProcedure("usp_GetUserOfBranch", p);
        }

        /// <summary>
        /// Web equivalent of SavePRequisition() -> POPPrchsRequisition.ManageStoreIndent.
        /// Employee/Designation/RqnType/Supplier/OtherDetails/RequestedStatus/CustomerCode/
        /// documents are all permanently hidden/unused in the live desktop form, so they are
        /// sent with the same default values the desktop sends (blank/0/"vendor").
        /// </summary>
        public string Save(StoreIndentSaveRequest req, int companyCode, int branchCode, int periodId, int userCode, int moduleCode)
        {
            var dtGeneral = ToGeneralTable(req.General);
            var dtMaterial = ToItemTable(req.Material, "ItemCode");
            var dtConsumable = ToItemTable(req.Consumable, "ItemCode");
            var dtTAE = ToItemTable(req.TAE, "ItemCode");

            // Desktop's ManageStoreIndent call always passes dtDocuments as literal null (the
            // document-upload UI for this param is unused/hidden) - the older System.Data.SqlClient
            // driver tolerates a null TVP as "no rows", but Microsoft.Data.SqlClient throws
            // ("Table-valued parameters cannot be DBNull"), so an always-empty table with the UDT's
            // real schema (confirmed via sys.table_types: slNo/Description/ExpiryDate/DocUpload) is
            // used here instead - same net effect (zero document rows), valid for this driver.
            var dtDocuments = new DataTable();
            dtDocuments.Columns.Add("slNo", typeof(int));
            dtDocuments.Columns.Add("Description", typeof(string));
            dtDocuments.Columns.Add("ExpiryDate", typeof(DateTime));
            dtDocuments.Columns.Add("DocUpload", typeof(string));

            var p = new[]
            {
                SqlHelper.Param("@PReqnCode", SqlDbType.Int, req.PReqnCode),
                SqlHelper.Param("@PurReqnNo", SqlDbType.VarChar, req.RequisitionNo ?? "", 20),
                SqlHelper.Param("@PurReqnDetails", SqlDbType.VarChar, req.RequisitionDetails ?? "", 50),
                SqlHelper.Param("@PReqnDate", SqlDbType.DateTime, req.RequisitionDate),
                SqlHelper.Param("@PReqnRefNo", SqlDbType.VarChar, req.RefNo ?? "", 20),
                SqlHelper.Param("@PReqnType", SqlDbType.VarChar, "vendor", 20),
                SqlHelper.Param("@SupplierCode", SqlDbType.Int, req.SupplierCode),
                SqlHelper.Param("@JobCode", SqlDbType.Int, req.JobCode),
                SqlHelper.Param("@ActiveYesNo", SqlDbType.VarChar, req.Active ? "Y" : "N", 1),
                SqlHelper.Param("@OtherDetails", SqlDbType.VarChar, "", 300),
                SqlHelper.Param("@CreatedByECode", SqlDbType.Int, req.CreatedByECode),
                SqlHelper.Param("@ApprovedByECode", SqlDbType.Int, req.ApprovedByECode),
                SqlHelper.Param("@CompanyCode", SqlDbType.Int, companyCode),
                SqlHelper.Param("@BranchCode", SqlDbType.Int, branchCode),
                SqlHelper.Param("@PeriodId", SqlDbType.Int, periodId),
                SqlHelper.Param("@POYesNo", SqlDbType.VarChar, "", 1),
                SqlHelper.TableParam("@tblPRequisition", "ERPDB_UDT_StoreIndentGeneral", dtGeneral),
                SqlHelper.Param("@tcPrdOrderOrJob", SqlDbType.VarChar, "JOB", 3),
                SqlHelper.Param("@tcPurOrMat", SqlDbType.VarChar, "MAT", 10),
                SqlHelper.Param("@productCodes", SqlDbType.VarChar, "", 800),
                SqlHelper.Param("@NotSelectedProductCodes", SqlDbType.VarChar, "", 800),
                SqlHelper.Param("@TermDel", SqlDbType.Int, 0),
                SqlHelper.Param("@AllocatedBudget", SqlDbType.Decimal, 0m),
                SqlHelper.TableParam("@dtDocuments", "StimesERP_UDT_PurchaseReqnDocuments", dtDocuments),
                SqlHelper.Param("@ModuleCode", SqlDbType.Int, moduleCode),
                SqlHelper.Param("@CurrentUserCode", SqlDbType.Int, userCode),
                SqlHelper.Param("@ExpDays", SqlDbType.Int, 0),
                SqlHelper.Param("@expectedDate", SqlDbType.DateTime, req.RequisitionDate),
                SqlHelper.Param("@JobCategoryCode", SqlDbType.Int, 0),
                SqlHelper.Param("@PaymentTerms", SqlDbType.VarChar, "", 8000),
                SqlHelper.Param("@CustomerCode", SqlDbType.Int, 0),
                SqlHelper.Param("@CloseYN", SqlDbType.VarChar, "", 20),
                SqlHelper.Param("@MatReqnCode", SqlDbType.Int, 0),
                SqlHelper.Param("@type", SqlDbType.VarChar, "", 10),
                SqlHelper.Param("@Other", SqlDbType.VarChar, "", 10),
                SqlHelper.Param("@EmployeeCode", SqlDbType.Int, req.EmployeeCode),
                SqlHelper.Param("@Designation", SqlDbType.VarChar, req.Designation ?? "", 8000),
                SqlHelper.Param("@RequestedStatus", SqlDbType.Int, req.RequestedStatus),
                SqlHelper.Param("@RequestedType", SqlDbType.VarChar, req.RequisitionType ?? "GEN", 10),
                SqlHelper.Param("@RequestedSubType", SqlDbType.VarChar, req.RequisitionSubType ?? "OTH", 10),
                SqlHelper.Param("@TAEType", SqlDbType.VarChar, "INH", 10),
                SqlHelper.TableParam("@dtGeneral", "ERPDB_UDT_StoreIndentGeneral", dtGeneral),
                SqlHelper.TableParam("@dtMaterial", "ERPDB_UDT_StoreIndentMaterial", dtMaterial),
                SqlHelper.TableParam("@dtConsumable", "ERPDB_UDT_StoreIndentConsumable", dtConsumable),
                SqlHelper.TableParam("@dtTAE", "ERPDB_UDT_StoreIndentTAE", dtTAE),
                SqlHelper.Param("@CostId", SqlDbType.Int, req.CostId),
                SqlHelper.Param("@CheckedByECode", SqlDbType.Int, req.CheckedByECode)
            };

            return _db.DataTransactionsByProcedure("usp_purchase_ManageStoreIndent", p);
        }

        public string Delete(int pReqnCode, int moduleCode, int userCode)
        {
            var p = new[]
            {
                SqlHelper.Param("@PReqnCode", SqlDbType.Int, pReqnCode),
                SqlHelper.Param("@ModuleCode", SqlDbType.Int, moduleCode),
                SqlHelper.Param("@CurrentUserCode", SqlDbType.Int, userCode)
            };
            return _db.DataTransactionsByProcedure("usp_purchase_DeleteStoreIndent", p);
        }

        private static DataTable ToGeneralTable(List<StoreIndentGeneralRow> rows)
        {
            var dt = new DataTable();
            dt.Columns.Add("SlNo", typeof(int));
            dt.Columns.Add("TypeCode", typeof(int));
            dt.Columns.Add("ItemCode", typeof(int));
            dt.Columns.Add("UnitCode", typeof(int));
            dt.Columns.Add("StockQty", typeof(decimal));
            dt.Columns.Add("RequestedQty", typeof(decimal));
            dt.Columns.Add("IssuedQty", typeof(decimal));
            dt.Columns.Add("Remarks", typeof(string));
            dt.Columns.Add("Description", typeof(string));
            dt.Columns.Add("DescriptionNew", typeof(string));
            dt.Columns.Add("StatusCode", typeof(int));

            foreach (var row in rows)
            {
                if (row.TypeCode <= 0) continue; // matches desktop: rows without a chosen Type are dropped

                var dr = dt.NewRow();
                dr["SlNo"] = row.SlNo;
                dr["TypeCode"] = row.TypeCode;
                dr["ItemCode"] = row.ItemCode;
                dr["UnitCode"] = row.UnitCode;
                dr["StockQty"] = row.StockQty;
                dr["RequestedQty"] = row.RequestedQty;
                dr["IssuedQty"] = row.IssuedQty;
                dr["Remarks"] = row.Remarks ?? "";
                dr["Description"] = row.Description ?? "";
                dr["DescriptionNew"] = row.DescriptionNew ?? "";
                dr["StatusCode"] = row.StatusCode;
                dt.Rows.Add(dr);
            }
            return dt;
        }

        private static DataTable ToItemTable(List<StoreIndentItemRow> rows, string itemCodeColumn)
        {
            var dt = new DataTable();
            dt.Columns.Add("SlNo", typeof(int));
            dt.Columns.Add(itemCodeColumn, typeof(int));
            dt.Columns.Add("UnitCode", typeof(int));
            dt.Columns.Add("StockQty", typeof(decimal));
            dt.Columns.Add("RequestedQty", typeof(decimal));
            dt.Columns.Add("IssuedQty", typeof(decimal));
            dt.Columns.Add("Remarks", typeof(string));

            foreach (var row in rows)
            {
                if (row.ItemCode <= 0) continue;

                var dr = dt.NewRow();
                dr["SlNo"] = row.SlNo;
                dr[itemCodeColumn] = row.ItemCode;
                dr["UnitCode"] = row.UnitCode;
                dr["StockQty"] = row.StockQty;
                dr["RequestedQty"] = row.RequestedQty;
                dr["IssuedQty"] = row.IssuedQty;
                dr["Remarks"] = row.Remarks ?? "";
                dt.Rows.Add(dr);
            }
            return dt;
        }
    }
}
