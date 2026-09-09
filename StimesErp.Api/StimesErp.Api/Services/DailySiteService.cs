using System.Data;
using Microsoft.Data.SqlClient;
using StimesErp.Api.Data;
using StimesErp.Api.Models;

namespace StimesErp.Api.Services
{
    /// <summary>
    /// Web equivalent of Stimes.Erp.Library.ClsDailySite - calls the exact same stored procedures.
    /// </summary>
    public class DailySiteService
    {
        private readonly SqlHelper _db;

        public DailySiteService(SqlHelper db)
        {
            _db = db;
        }

        // Grid list: WPF calls GetDailySiteHdr(0, Month, Year)
        public DataTable GetList(int month, int year)
        {
            int yearCode = year > 99 ? year % 100 : year; // SP expects 2-digit year, e.g. 2026 -> 26

            var p = new[]
            {
                SqlHelper.Param("@DailySiteCode", SqlDbType.Int, 0),
                SqlHelper.Param("@MonthCode", SqlDbType.Int, month),
                SqlHelper.Param("@YearCode", SqlDbType.Int, yearCode)
            };
            return _db.GetDataTableFromProcedure("usp_GetDailySiteHdr", p);
        }

        // Detail header: WPF calls GetDailySiteHdr(DailySiteCode, 0, 0)
        public DataTable GetById(int dailySiteCode)
        {
            var p = new[]
            {
                SqlHelper.Param("@DailySiteCode", SqlDbType.Int, dailySiteCode),
                SqlHelper.Param("@MonthCode", SqlDbType.Int, 0),
                SqlHelper.Param("@YearCode", SqlDbType.Int, 0)
            };
            return _db.GetDataTableFromProcedure("usp_GetDailySiteHdr", p);
        }

        public DataTable GetScopeOfWork(int dailySiteCode)
        {
            var p = new[] { SqlHelper.Param("@DailySiteCode", SqlDbType.Int, dailySiteCode) };
            return _db.GetDataTableFromProcedure("usp_GetDailySiteScopeOfWork", p);
        }

        public DataTable GetMaterial(int dailySiteCode)
        {
            var p = new[] { SqlHelper.Param("@DailySiteCode", SqlDbType.Int, dailySiteCode) };
            return _db.GetDataTableFromProcedure("usp_GetDailySiteMaterial", p);
        }

        public DataTable GetConsumablesOrMachineries(int dailySiteCode)
        {
            var p = new[] { SqlHelper.Param("@DailySiteCode", SqlDbType.Int, dailySiteCode) };
            return _db.GetDataTableFromProcedure("usp_GetDailySiteConsumablesOrMachineries", p);
        }

        public DataTable GetConsumables(int dailySiteCode)
        {
            var p = new[] { SqlHelper.Param("@DailySiteCode", SqlDbType.Int, dailySiteCode) };
            return _db.GetDataTableFromProcedure("usp_GetDailySiteConsumables", p);
        }

        // Direct == 1 rows - manually added via "+Add Row" (not derived from the job's
        // estimation), matching desktop's separate gvConsumbalesdirect grid / @dtConsumablesDR TVP.
        public DataTable GetConsumablesDR(int dailySiteCode)
        {
            var p = new[] { SqlHelper.Param("@DailySiteCode", SqlDbType.Int, dailySiteCode) };
            return _db.GetDataTableFromProcedure("usp_GetDailySiteConsumablesDR", p);
        }

        public DataTable GetMachineries(int dailySiteCode)
        {
            var p = new[] { SqlHelper.Param("@DailySiteCode", SqlDbType.Int, dailySiteCode) };
            return _db.GetDataTableFromProcedure("usp_GetDailySiteMachineries", p);
        }

        public DataTable GetBranchHrs(int dailySiteCode)
        {
            var p = new[] { SqlHelper.Param("@DailySiteCode", SqlDbType.Int, dailySiteCode) };
            return _db.GetDataTableFromProcedure("usp_GetDailySiteBranchHrs", p);
        }

        public string GenerateDocNo(DateTime docDate)
        {
            var p = new[] { SqlHelper.Param("@DocDate", SqlDbType.DateTime, docDate) };
            return _db.DataTransactionsByProcedure("usp_GenerateDailySiteNo", p);
        }

        public DataTable GetRevisionNo(string jobNo)
        {
            var p = new[] { SqlHelper.Param("@JobNo", SqlDbType.VarChar, jobNo, 8000) };
            return _db.GetDataTableFromProcedure("usp_GetDailySiteRevisionNo", p);
        }

        public DataSet GetSalesOrderDetails(int soCode, decimal basic, int dailySiteCode, int itemCode, DateTime docDate)
        {
            var p = new[]
            {
                SqlHelper.Param("@SOCode", SqlDbType.Int, soCode),
                SqlHelper.Param("@Basic", SqlDbType.Decimal, basic),
                SqlHelper.Param("@DailySiteCode", SqlDbType.Int, dailySiteCode),
                SqlHelper.Param("@ItemCode", SqlDbType.Int, itemCode),
                SqlHelper.Param("@DocDate", SqlDbType.DateTime, docDate)
            };
            return _db.GetDataSetFromProcedure("usp_GetDailySiteSOWise", p);
        }

        public DataTable GetSalesOrders()
        {
            return _db.GetDataTableFromProcedure("usp_GetDailySiteSalesOrderNo");
        }

        public DataTable GetScopePreparations() => _db.GetDataTableFromQuery(
            "select SurfacePreparationCode,SurfacePreparationName from SalesSurfacePreparationInfo");

        public DataTable GetUnits() => _db.GetDataTableFromQuery(
            "select UnitCode as Uom,UnitCode,UnitDesc from AdminUnitInfo order by UnitDesc");

        public DataTable GetMaterials() => _db.GetDataTableFromQuery(
            "select ItemCode as MaterialCode,Description as MaterialName from AdminItemInfo order by ItemName");

        public DataTable GetEmployees() => _db.GetDataTableFromQuery(
            "select EmployeeCode,EmpFullName from payrollEmployeeInfo where ActiveYesNo='Y' and (isnull(CategoryCode,0)=9 or isnull(CategoryCode,0)=10 or isnull(CategoryCode,0)=11)");

        // WPF DailySite.xaml.cs FillGrid() sources gvConsumbalesAndMachineries' employee column from
        // categories 12/13/14 (labour) - a different list than the 9/10/11 Supervisor/Engineer/PreparedBy roles above.
        public DataTable GetLabourers() => _db.GetDataTableFromQuery(
            "select EmployeeCode,EmpFullName from payrollEmployeeInfo where ActiveYesNo='Y' and (isnull(CategoryCode,0)=12 or isnull(CategoryCode,0)=13 or isnull(CategoryCode,0)=14)");

        /// <summary>
        /// Web equivalent of gvConsumbalesAndMachineries_CellEditEnded's lookups in DailySite.xaml.cs:
        /// employee's NormalHoursPerDay/BranchCode/CurrentDesigCode, Ramadan hours for the branch/period,
        /// whether the doc date is a holiday, and whether the employee already has hours logged
        /// elsewhere the same day (usp_GetEmployeeAlReadyExistInDailySite).
        /// </summary>
        public EmployeeHourContext GetEmployeeHourContext(int employeeCode, DateTime docDate, int dailySiteCode, int loginBranchCode, int periodId)
        {
            var ctx = new EmployeeHourContext();

            var dtEmp = _db.GetDataTableFromQuery(
                "select NormalHoursPerDay, BranchCode, CurrentDesigCode from payrollEmployeeInfo where EmployeeCode=@EmployeeCode",
                new[] { SqlHelper.Param("@EmployeeCode", SqlDbType.Int, employeeCode) });

            if (dtEmp.Rows.Count > 0)
            {
                ctx.EmployeeFound = true;
                ctx.BranchCode = (int)DecimalOrDefault(dtEmp.Rows[0], "BranchCode");
                ctx.CurrentDesigCode = (int)DecimalOrDefault(dtEmp.Rows[0], "CurrentDesigCode");
                ctx.NormalHoursPerDay = DecimalOrDefault(dtEmp.Rows[0], "NormalHoursPerDay");
            }

            var dtRamadan = _db.GetDataTableFromQuery(
                "select RamadanHrs from payrollSettings where IsRamadan=1 and CurrentPeriodID=@PeriodId and BranchCode=@BranchCode",
                new[]
                {
                    SqlHelper.Param("@PeriodId", SqlDbType.Int, periodId),
                    SqlHelper.Param("@BranchCode", SqlDbType.Int, loginBranchCode)
                });
            if (dtRamadan.Rows.Count > 0)
            {
                ctx.IsRamadan = true;
                var ramadanHrs = DecimalOrDefault(dtRamadan.Rows[0], "RamadanHrs");
                ctx.RamadanHrs = ramadanHrs == 0 ? 6 : ramadanHrs;
            }

            var dtHoliday = _db.GetDataTableFromQuery(
                "select * from payrollHolidayInfo where HolidayDate=@HolidayDate",
                new[] { SqlHelper.Param("@HolidayDate", SqlDbType.DateTime, docDate.Date) });
            ctx.IsHoliday = dtHoliday.Rows.Count > 0;

            var pExist = new[]
            {
                SqlHelper.Param("@EmployeeCode", SqlDbType.Int, employeeCode),
                SqlHelper.Param("@AttDate", SqlDbType.DateTime, docDate),
                SqlHelper.Param("@DailySiteCode", SqlDbType.Int, dailySiteCode)
            };
            var dtExist = _db.GetDataTableFromProcedure("usp_GetEmployeeAlReadyExistInDailySite", pExist);
            if (dtExist.Rows.Count > 0)
            {
                ctx.AlreadyExistsElsewhere = true;
                ctx.ExistingHrs = DecimalOrDefault(dtExist.Rows[0], "Hrs");
                ctx.ExistingNormalHrs = DecimalOrDefault(dtExist.Rows[0], "NormalHrs");
                ctx.ExistingDailySiteNo = StringOrDefault(dtExist.Rows[0], "DailySiteNo");
            }

            return ctx;
        }

        private static decimal DecimalOrDefault(DataRow row, string column)
        {
            if (!row.Table.Columns.Contains(column) || row[column] == DBNull.Value) return 0;
            return Convert.ToDecimal(row[column]);
        }

        private static string StringOrDefault(DataRow row, params string[] columns)
        {
            foreach (var column in columns)
            {
                if (row.Table.Columns.Contains(column) && row[column] != DBNull.Value)
                    return row[column].ToString() ?? "";
            }
            return "";
        }

        /// <summary>
        /// Web equivalent of gvScopeOfWork_CellEditEnded in DailySite.xaml.cs: calls
        /// usp_GetDailySiteSOWiseScopeOfWork to get cross-site totals for the same
        /// Job/SurfacePreparation/SpecialRequirement combination.
        /// </summary>
        public ScopeOfWorkContext GetScopeOfWorkContext(int soCode, int surfacePreparationCode, int dailySiteCode, decimal scopeOfWorkAsPerJobCard, int slNo, string specialRequirement)
        {
            var p = new[]
            {
                SqlHelper.Param("@SOCode", SqlDbType.Int, soCode),
                SqlHelper.Param("@SurfacePreparationCode", SqlDbType.Int, surfacePreparationCode),
                SqlHelper.Param("@DailySiteCodes", SqlDbType.Int, dailySiteCode),
                SqlHelper.Param("@ScopeOfWorkAsPerJobCard", SqlDbType.Decimal, scopeOfWorkAsPerJobCard),
                SqlHelper.Param("@SlNo", SqlDbType.Decimal, slNo),
                SqlHelper.Param("@SpecialRequirement", SqlDbType.VarChar, specialRequirement ?? "", 8000)
            };
            var dt = _db.GetDataTableFromProcedure("usp_GetDailySiteSOWiseScopeOfWork", p);

            var ctx = new ScopeOfWorkContext();
            if (dt.Rows.Count > 0)
            {
                ctx.TotalAreaCompleted = DecimalOrDefault(dt.Rows[0], "TotalAreaCompleted");
                ctx.AchievedRateForEachActivity = DecimalOrDefault(dt.Rows[0], "AchievedRateForEachActivity");
                ctx.BalanceToComplete = DecimalOrDefault(dt.Rows[0], "BalanceToComplete");
                ctx.Cnt = (int)DecimalOrDefault(dt.Rows[0], "Cnt") + 1;
            }
            return ctx;
        }

        /// <summary>
        /// Lightweight replacement for GetMaterialPreviousContext's TodayMaterialsUsed figure - calls the new,
        /// much simpler usp_GetDailySiteMaterialPrevTotalUsed (plain sum of TodayConsumed across every other
        /// DailySiteCode on the same CommonSOCode/material, with the same BaseUnitCode/PackSize divide rule
        /// applied per historical row) instead of the old, heavier usp_GetDailySiteSOWisePreviousMaterialDtl.
        /// </summary>
        public decimal GetMaterialPrevTotalUsed(int soCode, int dailySiteCode, int itemCode)
        {
            var p = new[]
            {
                SqlHelper.Param("@SOCode", SqlDbType.Int, soCode),
                SqlHelper.Param("@DailySiteCode", SqlDbType.Int, dailySiteCode),
                SqlHelper.Param("@ItemCode", SqlDbType.Int, itemCode)
            };
            var dt = _db.GetDataTableFromProcedure("usp_GetDailySiteMaterialPrevTotalUsed", p);
            return dt.Rows.Count > 0 ? DecimalOrDefault(dt.Rows[0], "TotalUsed") : 0;
        }

        /// <summary>
        /// Web equivalent of gvMaterial_CellEditEnded's usp_GetDailySiteSOWisePreviousMaterialDtl call -
        /// summed across every returned row, same as the desktop's dsSideGrid.AsEnumerable().Sum(...).
        /// </summary>
        public MaterialPreviousContext GetMaterialPreviousContext(int soCode, int dailySiteCode, int itemCode)
        {
            var p = new[]
            {
                SqlHelper.Param("@SOCode", SqlDbType.Int, soCode),
                SqlHelper.Param("@DailySiteCode", SqlDbType.Int, dailySiteCode),
                SqlHelper.Param("@ItemCode", SqlDbType.Int, itemCode)
            };
            var dt = _db.GetDataTableFromProcedure("usp_GetDailySiteSOWisePreviousMaterialDtl", p);

            var ctx = new MaterialPreviousContext();
            if (dt.Rows.Count > 0)
            {
                decimal balanceMaterials = 0, estRateOfUsage = 0, todayMaterialsUsed = 0, materialReceivedTodayAtSite = 0;
                foreach (DataRow row in dt.Rows)
                {
                    balanceMaterials += DecimalOrDefault(row, "BalanceMaterials");
                    estRateOfUsage += DecimalOrDefault(row, "EstRateOfUsage");
                    // usp_GetDailySiteSOWisePreviousMaterialDtl's main branch selects "TodayMaterialsUsed" twice
                    // (once from sum(TodayConsumed), once from the real sum(TodayMaterialsUsed)) - DataTable.Load
                    // auto-renames the second occurrence to "TodayMaterialsUsed1", which is the one we actually want.
                    // The fallback branch (no prior daily site data) only ever returns the single un-suffixed column.
                    todayMaterialsUsed += row.Table.Columns.Contains("TodayMaterialsUsed1")
                        ? DecimalOrDefault(row, "TodayMaterialsUsed1")
                        : DecimalOrDefault(row, "TodayMaterialsUsed");
                    materialReceivedTodayAtSite += DecimalOrDefault(row, "MaterialReceivedTodayAtSite");
                }
                ctx.BalanceMaterialsPrev = balanceMaterials;
                ctx.EstRateOfUsage = estRateOfUsage;
                ctx.TotalMaterialsUsedPrev = todayMaterialsUsed;
                ctx.MaterialReceivedTodayAtSitePrev = materialReceivedTodayAtSite;
            }
            return ctx;
        }

        /// <summary>
        /// Web equivalent of gvConsumbales_CellEditEnded's usp_GetDailySiteSOWisePreviousConsumableDtl call -
        /// only the first returned row is used, matching the desktop's dt.Rows[0] access.
        /// </summary>
        public ConsumablePreviousContext GetConsumablePreviousContext(int soCode, int dailySiteCode, int consumableCode)
        {
            var p = new[]
            {
                SqlHelper.Param("@SOCode", SqlDbType.Int, soCode),
                SqlHelper.Param("@DailySiteCode", SqlDbType.Int, dailySiteCode),
                SqlHelper.Param("@ConsumableCode", SqlDbType.Int, consumableCode)
            };
            var dt = _db.GetDataTableFromProcedure("usp_GetDailySiteSOWisePreviousConsumableDtl", p);

            var ctx = new ConsumablePreviousContext();
            if (dt.Rows.Count > 0)
            {
                ctx.TotalConsumablesUsedPrev = DecimalOrDefault(dt.Rows[0], "TotalConsumablesUsedPrev");
                ctx.TotalQty = DecimalOrDefault(dt.Rows[0], "TotalQty");
            }
            return ctx;
        }

        public DataTable GetConsumables() => _db.GetDataTableFromQuery(
            "select * from SalesConsumableInfo where isnull(Description,'')!=''");

        // Current on-hand stock per consumable item (ItemCode == ConsumableCode) - used to
        // auto-fill Quantity (read-only) when a Direct/manually-added consumable row is picked.
        public DataTable GetConsumableStock() => _db.GetDataTableFromQuery(
            "select sum(stockqty) as Qty, ItemCode from InvoiceMaterialStockForConsumableAndTAE where type = 1 group by ItemCode");

        public DataTable GetMachineries() => _db.GetDataTableFromQuery(
            "select ToolsAndEquipmentCode,Description + ' - ' + AssetCode as Description from SalesToolsAndEquipmentinfo where isnull(Description,'')!=''");

        public DataTable GetMachineryStatuses() => _db.GetDataTableFromQuery(
            "select 1 as StatusCode,'Hire' as StatusName union all select 2 as StatusCode,'Inhouse' as StatusName");

        public DataTable GetCustomers()
        {
            var p = new[]
            {
                SqlHelper.Param("@SearchText", SqlDbType.VarChar, "", 500),
                SqlHelper.Param("@SearchCriteria", SqlDbType.VarChar, "", 500)
            };
            return _db.GetDataTableFromProcedure("usp_Sales_GetCustomers", p);
        }

        public DataTable GetExistingSalesOrders(int soCode)
        {
            const string sql = "select * from SalesOrderNew where SoNo like '%' + (select LTRIM(RTRIM(CASE WHEN SONo LIKE '%REV%' THEN LEFT(SONo, PATINDEX('%[ -]REV%', SONo) - 1) ELSE SONo END)) from SalesOrderNew where SoCode=@SoCode) + '%' and SoCode != @SoCode and SoCode in (select JobCode from DailySiteHdr)";
            return _db.GetDataTableFromQuery(sql, new[] { SqlHelper.Param("@SoCode", SqlDbType.Int, soCode) });
        }

        /// <summary>
        /// Calls usp_ManageDailySite - same SP used for insert (Mode 0), update (Mode 1) and delete (Mode 2)
        /// by the desktop app. Table-valued rows must match the exact columns of the SQL Server
        /// user-defined table types (ERP_UDT_DailySiteScopeOfWork etc.) - see the TODO in DailySiteModels.cs.
        /// </summary>
        public string Save(DailySiteSaveRequest req, int branchCode, int periodId, int userCode)
        {
            try
            {
                // ============================================================
                // 1. Convert request collections to DataTables
                // ============================================================

                DataTable dtScopeOfWork =
                    ToScopeOfWorkTable(req.ScopeOfWork, req.DailySiteCode);

                DataTable dtMaterial =
                    ToMaterialTable(req.Material, req.DailySiteCode);

                DataTable dtConsumablesAndMachineries =
                    ToEmployeeHourTable(
                        req.ConsumablesAndMachineries,
                        req.DailySiteCode);

                DataTable dtConsumables =
                    ToConsumableTable(
                        req.Consumables,
                        req.DailySiteCode);

                DataTable dtMachineries =
                    ToMachineryTable(
                        req.Machineries,
                        req.DailySiteCode);

                DataTable dtBranchHrs =
                    ToBranchHrsTable(req.BranchHrs);

                DataTable dtConsumablesDR =
                    ToConsumableTable(
                        req.ConsumablesDR,
                        req.DailySiteCode);


                // ============================================================
                // 2. Remove columns which are only UI/display columns
                //    Same idea as desktop code
                // ============================================================

                RemoveColumnIfExists(dtScopeOfWork, "SurfacePreparationName");
                RemoveColumnIfExists(dtScopeOfWork, "UnitDesc");

                RemoveColumnIfExists(dtMaterial, "Description");
                RemoveColumnIfExists(dtMaterial, "Units");
                RemoveColumnIfExists(dtMaterial, "Units1");

                RemoveColumnIfExists(
                    dtConsumablesAndMachineries,
                    "ChkYesNo");

                RemoveColumnIfExists(
                    dtConsumablesAndMachineries,
                    "BranchCode");

                RemoveColumnIfExists(
                    dtConsumablesAndMachineries,
                    "EmpFullName");

                RemoveColumnIfExists(
                    dtConsumables,
                    "TotalConsumablesUsedPrev");

                RemoveColumnIfExists(
                    dtConsumables,
                    "Direct");

                RemoveColumnIfExists(
                    dtConsumables,
                    "ConsumableName");

                RemoveColumnIfExists(
                    dtMachineries,
                    "AvailableToolsOrMachineryAtSitePrev");

                RemoveColumnIfExists(
                    dtMachineries,
                    "ToolsAndEquipmentName");

                RemoveColumnIfExists(
                    dtConsumablesDR,
                    "TotalConsumablesUsedPrev");

                RemoveColumnIfExists(
                    dtConsumablesDR,
                    "Direct");

                // Desktop removes DailySiteCode from Branch Hours
                RemoveColumnIfExists(dtBranchHrs, "DailySiteCode");


                // ============================================================
                // 3. Remove empty rows
                // ============================================================

                RemoveEmptyRows(
                    dtScopeOfWork,
                    "SurfacePreparationCode");

                RemoveEmptyRows(
                    dtMaterial,
                    "MaterialCode");

                RemoveEmptyRows(
                    dtConsumablesAndMachineries,
                    "EmployeeCode");

                RemoveEmptyRows(
                    dtConsumables,
                    "ConsumableCode");

                RemoveEmptyRows(
                    dtMachineries,
                    "ToolsAndEquipmentCode");

                RemoveEmptyRows(
                    dtConsumablesDR,
                    "ConsumableCode");


                // ============================================================
                // 4. Build SQL parameters
                // ============================================================

                var p = new[]
                {
            SqlHelper.Param(
                "@DailySiteCode",
                SqlDbType.Int,
                req.DailySiteCode),

            SqlHelper.Param(
                "@DocNo",
                SqlDbType.VarChar,
                req.DocNo ?? "",
                8000),

            SqlHelper.Param(
                "@DocNoRev",
                SqlDbType.VarChar,
                req.DocNoRev ?? "",
                8000),

            SqlHelper.Param(
                "@DocDate",
                SqlDbType.DateTime,
                req.DocDate),

            SqlHelper.Param(
                "@ClientCode",
                SqlDbType.Int,
                req.ClientCode),

            SqlHelper.Param(
                "@JobCode",
                SqlDbType.Int,
                req.JobCode),

            SqlHelper.Param(
                "@StartDate",
                SqlDbType.DateTime,
                req.StartDate),

            SqlHelper.Param(
                "@FinishDate",
                SqlDbType.DateTime,
                req.FinishDate),

            SqlHelper.Param(
                "@Location",
                SqlDbType.VarChar,
                req.Location ?? "",
                8000),

            SqlHelper.Param(
                "@Project",
                SqlDbType.VarChar,
                req.Project ?? "",
                8000),

            SqlHelper.Param(
                "@StartTime",
                SqlDbType.DateTime,
                req.StartTime),

            SqlHelper.Param(
                "@CloseTime",
                SqlDbType.DateTime,
                req.CloseTime),

            SqlHelper.Param(
                "@Supervisor",
                SqlDbType.Int,
                req.Supervisor),

            SqlHelper.Param(
                "@PreparedBy",
                SqlDbType.Int,
                req.PreparedBy),

            SqlHelper.Param(
                "@Engineer",
                SqlDbType.Int,
                req.Engineer),

            SqlHelper.Param(
                "@ScopeOfWorkCode",
                SqlDbType.VarChar,
                req.ScopeOfWorkCode ?? "",
                8000),

            SqlHelper.TableParam(
                "@dtScopeOfWork",
                "ERP_UDT_DailySiteScopeOfWork",
                dtScopeOfWork),

            SqlHelper.TableParam(
                "@dtMaterial",
                "ERP_UDT_DailySiteMaterial",
                dtMaterial),

            SqlHelper.TableParam(
                "@dtConsumablesAndMachineries",
                "ERP_UDT_DailySiteConsumablesAndMachineriesNew",
                dtConsumablesAndMachineries),

            SqlHelper.Param(
                "@ScopeManhours",
                SqlDbType.Decimal,
                req.ScopeManhours),

            SqlHelper.Param(
                "@TodayManhours",
                SqlDbType.Decimal,
                req.TodayManhours),

            SqlHelper.Param(
                "@PreviousManhours",
                SqlDbType.Decimal,
                req.PreviousManhours),

            SqlHelper.Param(
                "@GrandTotalManhours",
                SqlDbType.Decimal,
                req.GrandTotalManhours),

            SqlHelper.Param(
                "@BalanceManhours",
                SqlDbType.Decimal,
                req.BalanceManhours),

            SqlHelper.Param(
                "@BranchCode",
                SqlDbType.Int,
                branchCode),

            SqlHelper.Param(
                "@PeriodId",
                SqlDbType.Int,
                periodId),

            SqlHelper.Param(
                "@UserCode",
                SqlDbType.Int,
                userCode),

            SqlHelper.Param(
                "@Mode",
                SqlDbType.Int,
                req.Mode),

            SqlHelper.Param(
                "@Excess",
                SqlDbType.VarChar,
                req.Excess ?? "",
                8000),

            SqlHelper.Param(
                "@Remarks",
                SqlDbType.VarChar,
                req.Remarks ?? "",
                8000),

            SqlHelper.Param(
                "@MinHrs",
                SqlDbType.VarChar,
                req.MinHrs ?? "",
                8000),

            SqlHelper.TableParam(
                "@dtConsumables",
                "ERP_UDT_DailySiteConsumables",
                dtConsumables),

            SqlHelper.TableParam(
                "@dtMachineries",
                "ERP_UDT_DailySiteMachineries",
                dtMachineries),

            SqlHelper.TableParam(
                "@dtBranchHrs",
                "ERP_UDT_DailySiteBranchHrs",
                dtBranchHrs),

            SqlHelper.Param(
                "@TodayManhoursPerc",
                SqlDbType.Decimal,
                req.TodayManhoursPerc),

            SqlHelper.Param(
                "@PreviousManhoursPerc",
                SqlDbType.Decimal,
                req.PreviousManhoursPerc),

            SqlHelper.Param(
                "@GrandTotalManhoursPerc",
                SqlDbType.Decimal,
                req.GrandTotalManhoursPerc),

            SqlHelper.Param(
                "@BalanceManhoursPerc",
                SqlDbType.Decimal,
                req.BalanceManhoursPerc),

            SqlHelper.Param(
                "@ExcessPerc",
                SqlDbType.Decimal,
                req.ExcessPerc),

            SqlHelper.Param(
                "@WithoutMaterial",
                SqlDbType.VarChar,
                req.WithoutMaterial ?? "N",
                8000),

            SqlHelper.TableParam(
                "@dtConsumablesDR",
                "ERP_UDT_DailySiteConsumables",
                dtConsumablesDR),

            SqlHelper.Param(
                "@ExsistSoCode",
                SqlDbType.Int,
                req.ExsistSoCode)
        };

                return _db.DataTransactionsByProcedure(
                    "usp_ManageDailySite",
                    p);
            }
            catch (Exception ex)
            {
                throw new Exception(
                    "Error while saving Daily Site: " + ex.Message,
                    ex);
            }
        }

        private static DataTable NewTable(params (string Name, Type Type)[] columns)
        {
            var dt = new DataTable();
            foreach (var col in columns)
                dt.Columns.Add(col.Name, col.Type);
            return dt;
        }
        private void RemoveColumnIfExists(DataTable dt, string columnName)
        {
            if (dt == null)
                return;

            if (dt.Columns.Contains(columnName))
                dt.Columns.Remove(columnName);
        }
        private void RemoveEmptyRows(DataTable dt, string keyColumn)
        {
            if (dt == null || dt.Rows.Count == 0)
                return;

            if (!dt.Columns.Contains(keyColumn))
                return;

            for (int i = dt.Rows.Count - 1; i >= 0; i--)
            {
                object value = dt.Rows[i][keyColumn];

                if (value == null ||
                    value == DBNull.Value ||
                    string.IsNullOrWhiteSpace(value.ToString()))
                {
                    dt.Rows.RemoveAt(i);
                }
            }

            dt.AcceptChanges();
        }
        private static DataTable ToScopeOfWorkTable(
      List<ScopeOfWorkRow> rows,
      int dailySiteCode)
        {
            var dt = NewTable(
                ("DailySiteCode", typeof(int)),
                ("SlNo", typeof(int)),
                ("SurfacePreparationCode", typeof(int)),
                ("UnitCode", typeof(int)),
                ("AreaCompleted", typeof(decimal)),
                ("ManhourEngaged", typeof(decimal)),
                ("AchievedRate", typeof(decimal)),
                ("AchievedRateForEachActivity", typeof(decimal)),
                ("ScopeOfWorkAsPerJobCard", typeof(decimal)),
                ("TotalAreaCompleted", typeof(decimal)),
                ("BalanceToComplete", typeof(decimal)),
                ("Scope", typeof(string)),
                ("EstimationCode", typeof(int)),       // ADDED
                ("EstSlNo", typeof(int)),             // ADDED
                ("SpecialRequirement", typeof(string)),
                ("Division", typeof(int))
            );

            if (rows == null)
                return dt;

            foreach (var row in rows)
            {
                // Skip an empty/new grid row - but "empty" depends on Division: Division 1 rows
                // never get a SurfacePreparationCode at all (they only use SpecialRequirement),
                // so a row is only truly blank when BOTH are unset. Filtering on
                // SurfacePreparationCode alone silently dropped every Division 1 row.
                if (row.SurfacePreparationCode <= 0 && string.IsNullOrWhiteSpace(row.SpecialRequirement))
                    continue;

                var dr = dt.NewRow();

                dr["DailySiteCode"] =
                    dailySiteCode;

                dr["SlNo"] =
                    row.SlNo;

                dr["SurfacePreparationCode"] =
                    row.SurfacePreparationCode;

                dr["UnitCode"] =
                    row.UnitCode;

                dr["AreaCompleted"] =
                    row.AreaCompleted;

                dr["ManhourEngaged"] =
                    row.ManhourEngaged;

                dr["AchievedRate"] =
                    row.AchievedRate;

                dr["AchievedRateForEachActivity"] =
                    row.AchievedRateForEachActivity;

                dr["ScopeOfWorkAsPerJobCard"] =
                    row.ScopeOfWorkAsPerJobCard;

                dr["TotalAreaCompleted"] =
                    row.TotalAreaCompleted;

                dr["BalanceToComplete"] =
                    row.BalanceToComplete;

                dr["Scope"] =
                    row.Scope ?? "";

                dr["EstimationCode"] =
                    row.EstimationCode;

                dr["EstSlNo"] =
                    row.EstSlNo;

                dr["SpecialRequirement"] =
                    row.SpecialRequirement ?? "";

                dr["Division"] =
                    row.Division;

                dt.Rows.Add(dr);
            }

            dt.AcceptChanges();

            return dt;
        }

        private static DataTable ToMaterialTable(List<MaterialRow> rows, int dailySiteCode)
        {
            var dt = NewTable(
                ("DailySiteCode", typeof(int)),
                ("SlNo", typeof(int)),
                ("MaterialCode", typeof(int)),
                ("PackSize", typeof(decimal)),
                ("Unit", typeof(string)),
                ("TotalMaterialEstimatedQty", typeof(decimal)),
                ("MaterialReceivedTodayAtSite", typeof(decimal)),
                ("TodayConsumed", typeof(decimal)),
                ("BalanceAtSite", typeof(decimal)),
                ("Area", typeof(decimal)),
                ("RateOfApplication", typeof(decimal)),
                ("AreaSupposedToCover", typeof(decimal)),
                ("TodayMaterialsUsed", typeof(decimal)),
                ("BalanceMaterials", typeof(decimal)),
                ("Remarks", typeof(string)),
                ("BgColor", typeof(string)),
                ("BaseUnitCode", typeof(int)),
                ("ReceivedQty", typeof(decimal)));

            foreach (var row in rows)
            {
                var dr = dt.NewRow();
                dr["DailySiteCode"] = dailySiteCode;
                dr["SlNo"] = row.SlNo;
                dr["MaterialCode"] = row.MaterialCode;
                dr["PackSize"] = decimal.TryParse(row.PackSize, out var pack) ? pack : 0m;
                dr["Unit"] = row.Unit ?? "";
                dr["TotalMaterialEstimatedQty"] = row.TotalMaterialEstimatedQty;
                dr["MaterialReceivedTodayAtSite"] = row.MaterialReceivedTodayAtSite;
                dr["TodayConsumed"] = row.TodayConsumed;
                dr["BalanceAtSite"] = row.BalanceAtSite;
                dr["Area"] = row.Area;
                dr["RateOfApplication"] = row.RateOfApplication;
                dr["AreaSupposedToCover"] = row.AreaSupposedToCover;
                dr["TodayMaterialsUsed"] = row.TodayMaterialsUsed;
                dr["BalanceMaterials"] = row.BalanceMaterials;
                dr["Remarks"] = row.Remarks ?? "";
                dr["BgColor"] = row.BgColor ?? "";
                dr["BaseUnitCode"] = row.BaseUnitCode ?? 0;
                dr["ReceivedQty"] = row.ReceivedQty;
                dt.Rows.Add(dr);
            }
            return dt;
        }

        private static DataTable ToEmployeeHourTable(List<EmployeeHourRow> rows, int dailySiteCode)
        {
            var dt = NewTable(
                ("DailySiteCode", typeof(int)),
                ("SlNo", typeof(int)),
                ("EmployeeCode", typeof(int)),
                ("Hrs", typeof(decimal)),
                ("Idle", typeof(decimal)),
                ("Transport", typeof(decimal)),
                ("Basic", typeof(decimal)),
                ("OT1", typeof(decimal)),
                ("OT2", typeof(decimal)),
                ("TotalHrs", typeof(decimal)),
                ("NormalHrs", typeof(decimal)),
                ("BranchCode", typeof(int)));

            foreach (var row in rows)
            {
                var dr = dt.NewRow();
                dr["DailySiteCode"] = dailySiteCode;
                dr["SlNo"] = row.SlNo;
                dr["EmployeeCode"] = row.EmployeeCode;
                dr["Hrs"] = row.Hrs;
                dr["Idle"] = row.Idle;
                dr["Transport"] = row.Transport;
                dr["Basic"] = row.Basic;
                dr["OT1"] = row.OT1;
                dr["OT2"] = row.OT2;
                dr["TotalHrs"] = row.TotalHrs;
                dr["NormalHrs"] = row.NormalHrs;
                dr["BranchCode"] = row.BranchCode;
                dt.Rows.Add(dr);
            }
            return dt;
        }

        private static DataTable ToConsumableTable(List<ConsumableRow> rows, int dailySiteCode)
        {
            var dt = NewTable(
                ("DailySiteCode", typeof(int)),
                ("SlNo", typeof(int)),
                ("ConsumableCode", typeof(int)),
                ("Quantity", typeof(decimal)),
                ("UsedToday", typeof(decimal)),
                ("TotalConsumablesUsed", typeof(decimal)),
                ("BgColor", typeof(string)),
                ("BaseUnitCode", typeof(int)));

            foreach (var row in rows)
            {
                var dr = dt.NewRow();
                dr["DailySiteCode"] = dailySiteCode;
                dr["SlNo"] = row.SlNo;
                dr["ConsumableCode"] = row.ConsumableCode;
                dr["Quantity"] = row.Quantity;
                dr["UsedToday"] = row.UsedToday;
                dr["TotalConsumablesUsed"] = row.TotalConsumablesUsed;
                dr["BgColor"] = row.BgColor ?? "";
                dr["BaseUnitCode"] = row.BaseUnitCode ?? 0;
                dt.Rows.Add(dr);
            }
            return dt;
        }

        private static DataTable ToMachineryTable(List<MachineryRow> rows, int dailySiteCode)
        {
            var dt = NewTable(
                ("DailySiteCode", typeof(int)),
                ("SlNo", typeof(int)),
                ("ToolsAndEquipmentCode", typeof(int)),
                ("EstimatedQuantity", typeof(decimal)),
                ("AvailableToolsOrMachineryAtSite", typeof(decimal)),
                ("NoOfMachineUsedAtSite", typeof(decimal)),
                ("NoOfDaysUsedAtSite", typeof(decimal)),
                ("NoOfMachineryIdleAtSite", typeof(decimal)),
                ("StatusCode", typeof(int)),
                ("BgColor", typeof(string)));


            foreach (var row in rows)
            {
                var dr = dt.NewRow();
                dr["DailySiteCode"] = dailySiteCode;
                dr["SlNo"] = row.SlNo;
                dr["ToolsAndEquipmentCode"] = row.ToolsAndEquipmentCode;
                dr["EstimatedQuantity"] = row.EstimatedQuantity;
                dr["AvailableToolsOrMachineryAtSite"] = row.AvailableToolsOrMachineryAtSite;
                dr["NoOfMachineUsedAtSite"] = row.NoOfMachineUsedAtSite;
                dr["NoOfDaysUsedAtSite"] = row.NoOfDaysUsedAtSite;
                dr["NoOfMachineryIdleAtSite"] = row.NoOfMachineryIdleAtSite;
                dr["StatusCode"] = row.StatusCode;
                dr["BgColor"] = row.BgColor ?? "";
                dt.Rows.Add(dr);
            }
            return dt;
        }

        private static DataTable ToBranchHrsTable(List<BranchHrsRow> rows)
        {
            var dt = NewTable(
                ("SlNo", typeof(int)),
                ("BranchCode", typeof(int)),
                ("TotalHrs", typeof(decimal)));

            foreach (var row in rows)
            {
                var dr = dt.NewRow();
                dr["SlNo"] = row.SlNo;
                dr["BranchCode"] = row.BranchCode;
                dr["TotalHrs"] = row.TotalHrs;
                dt.Rows.Add(dr);
            }
            return dt;
        }

        // ---------- Print report (PrintButton_Click / Report_DailySiteReport.rdlc) ----------
        // Distinct SPs from the detail-form ones above (note the "Report" suffix) - these feed
        // the desktop's RDLC report's 4 DataSets exactly.

        public DataTable GetHdrReport(int dailySiteCode)
        {
            var p = new[] { SqlHelper.Param("@DailySiteCode", SqlDbType.Int, dailySiteCode) };
            return _db.GetDataTableFromProcedure("usp_GetDailySiteHdrReport", p);
        }

        public DataTable GetScopeOfWorkReport(int dailySiteCode)
        {
            var p = new[] { SqlHelper.Param("@DailySiteCode", SqlDbType.Int, dailySiteCode) };
            return _db.GetDataTableFromProcedure("usp_GetDailySiteScopeOfWorkReport", p);
        }

        public DataTable GetMaterialReport(int dailySiteCode)
        {
            var p = new[] { SqlHelper.Param("@DailySiteCode", SqlDbType.Int, dailySiteCode) };
            return _db.GetDataTableFromProcedure("usp_GetDailySiteMaterialReport", p);
        }

        public DataTable GetConsumablesOrMachineriesReport(int dailySiteCode)
        {
            var p = new[] { SqlHelper.Param("@DailySiteCode", SqlDbType.Int, dailySiteCode) };
            return _db.GetDataTableFromProcedure("usp_GetDailySiteConsumablesOrMachineriesReport", p);
        }

        // ---------- Demo print (PrintButton_Click1 / Report_DailySiteReportDemo.rdlc) ----------
        // The desktop "Demo" preview pulls Materials fresh from the Sales Order's estimated
        // requirement (not the on-screen "material received today" grid) and Scope hrs from
        // Project Costing - both literal inline queries in the desktop code, ported verbatim
        // (parameterized here instead of the desktop's string concatenation).
        public DataTable GetDemoMaterial(int jobCode)
        {
            var p = new[] { SqlHelper.Param("@SOCode", SqlDbType.Int, jobCode) };
            return _db.GetDataTableFromQuery(
                "SELECT Description,UnitDesc as Units,PackSize as Units1, ReqPack AS Received " +
                "FROM UDT_SalesOrderMaterial D " +
                "LEFT JOIN AdminUnitInfo U ON U.UnitCode = D.UnitCode " +
                "WHERE SOCode = @SOCode", p);
        }

        public string GetDemoScopeHrs(int jobCode)
        {
            var p = new[] { SqlHelper.Param("@SalesOrderCode", SqlDbType.Int, jobCode) };
            var dt = _db.GetDataTableFromQuery(
                "select ManHoursAndDays from ProjectCostingHdr d " +
                "left join ProjectCostingDtlLabour u on u.PCCode = D.PCCode " +
                "where SlNo = 4 and SalesOrderCode = @SalesOrderCode", p);
            return dt.Rows.Count > 0 ? dt.Rows[0]["ManHoursAndDays"]?.ToString() ?? "" : "";
        }
    }
}
