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
        private readonly WebAuditService _audit;

        public DailySiteService(SqlHelper db, WebAuditService audit)
        {
            _db = db;
            _audit = audit;
        }

        // Grid list: WPF calls GetDailySiteHdr(0, Month, Year)
        public DataTable GetList(int month, int year, int empCode, bool restrictToSupervised)
        {
            int yearCode = year > 99 ? year % 100 : year; // SP expects 2-digit year, e.g. 2026 -> 26

            var p = new[]
            {
                SqlHelper.Param("@DailySiteCode", SqlDbType.Int, 0),
                SqlHelper.Param("@MonthCode", SqlDbType.Int, month),
                SqlHelper.Param("@YearCode", SqlDbType.Int, yearCode)
            };
            var dt = _db.GetDataTableFromProcedure("usp_GetDailySiteHdr", p);
            if (!restrictToSupervised) return dt;

            // Regular (UCatCode=6) users only see rows whose own JobCode+DocDate has a
            // ManpowerScheduleDtl entry naming them as SupervisorCode - checked per row, since a
            // supervisor's assignment can differ day to day (a job with two different supervisors
            // scheduled on the same date shows to both, each independently). Only while those jobs
            // are still Ongoing - Completed jobs drop off the list entirely once finished. ADMIN(1)/
            // PU(3) are unaffected (restrictToSupervised is only ever true for UCatCode=6).
            var scheduledPairs = GetScheduledJobDatePairs(empCode, month, year);
            var rowJobCodes = dt.AsEnumerable().Where(r => r["JobCode"] != DBNull.Value).Select(r => Convert.ToInt32(r["JobCode"]));
            var latestSoCodeByJobCode = ResolveLatestSoCodes(rowJobCodes);
            var supervised = dt.Clone();
            foreach (DataRow row in dt.Rows)
            {
                if (row["JobCode"] == DBNull.Value || row["DocDate"] == DBNull.Value) continue;
                var jobCode = Convert.ToInt32(row["JobCode"]);
                var docDate = Convert.ToDateTime(row["DocDate"]).Date;
                var latestSoCode = latestSoCodeByJobCode.GetValueOrDefault(jobCode, jobCode);
                if (scheduledPairs.Contains((latestSoCode, docDate)))
                    supervised.ImportRow(row);
            }

            var ongoing = supervised.Clone();
            foreach (DataRow row in supervised.Rows)
            {
                if (!string.Equals(row["PStatus"] as string, "Completed", StringComparison.OrdinalIgnoreCase))
                    ongoing.ImportRow(row);
            }
            return ongoing;
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

        // AdminUserCategoryInfo: 6 = USR (regular user). A regular user only sees Sales Orders/Daily
        // Site records for jobs where ManpowerSchedule/ManpowerScheduleDtl names them as
        // SupervisorCode for that exact JobCode+DocDate - replaces the old, date-blind check
        // against SalesOrderNew's own SupervisorOrForeman field. A job with two different
        // supervisors scheduled on the same date naturally shows to both, since each one's own
        // login only ever matches rows where THEY are the SupervisorCode. ADMIN(1) and PU(3) users
        // see everything, unrestricted. New, web-only filter - applied in C# after the existing
        // shared stored procedures return their full result, rather than touching
        // usp_GetDailySiteSalesOrderNo/usp_GetDailySiteHdr themselves (both still used as-is by
        // the desktop app).
        //
        // The NOT EXISTS check is a "once entered, stop offering it" rule: once a Daily Site
        // already exists for that exact JobCode+DocDate, the schedule slot is fulfilled and drops
        // out of the dropdown/list again automatically - covers both an ordinary ongoing job and a
        // Completed one reopened for a scheduled SNAG date.
        // A Sales Order's SOCode changes every time it's revised (REV01, REV02...) - SOCode stays
        // grouped under one stable CommonSOCode across all of its revisions, and
        // usp_GetDailySiteSalesOrderNo only ever shows the latest SOCode per CommonSOCode group. A
        // ManpowerScheduleDtl.JobCode was stamped with whatever SOCode was current when that
        // schedule line was created, which goes stale the moment the Sales Order is revised again -
        // comparing it directly against the (always-latest) candidate list then silently stops
        // matching. Resolving through CommonSOCode here keeps a supervisor's assignment matching
        // the Sales Order's current revision even after it's been revised since.
        private HashSet<int> GetScheduledSoCodes(int empCode, DateTime docDate)
        {
            var dt = _db.GetDataTableFromQuery(
                @"select distinct Latest.SOCode
                  from ManpowerScheduleDtl MD
                  inner join ManpowerSchedule MS on MS.Code = MD.Code
                  inner join SalesOrderNew Orig on Orig.SOCode = MD.JobCode
                  inner join (select max(SOCode) as SOCode, CommonSOCode from SalesOrderNew group by CommonSOCode) Latest
                      on Latest.CommonSOCode = Orig.CommonSOCode
                  where MD.SupervisorCode = @EmpCode
                    and CAST(MS.DocDate as date) = @DocDate
                    and not exists (
                        select 1 from DailySiteHdr D
                        where D.JobCode = Latest.SOCode and CAST(D.DocDate as date) = @DocDate
                    )",
                new[]
                {
                    SqlHelper.Param("@EmpCode", SqlDbType.Int, empCode),
                    SqlHelper.Param("@DocDate", SqlDbType.Date, docDate.Date)
                });
            return dt.AsEnumerable().Select(r => Convert.ToInt32(r["SOCode"])).ToHashSet();
        }

        // Same schedule source and same latest-revision resolution as GetScheduledSoCodes, but for
        // the List grid: every (latest SOCode, DocDate) pair scheduled to this supervisor across the
        // given month/year in one query, checked per row below instead of per a single date - a List
        // row keeps its own historical DocDate, so each row's visibility depends on who was
        // scheduled for ITS date, not today's.
        private HashSet<(int SoCode, DateTime DocDate)> GetScheduledJobDatePairs(int empCode, int month, int year)
        {
            var dt = _db.GetDataTableFromQuery(
                @"select distinct Latest.SOCode, CAST(MS.DocDate as date) as DocDate
                  from ManpowerScheduleDtl MD
                  inner join ManpowerSchedule MS on MS.Code = MD.Code
                  inner join SalesOrderNew Orig on Orig.SOCode = MD.JobCode
                  inner join (select max(SOCode) as SOCode, CommonSOCode from SalesOrderNew group by CommonSOCode) Latest
                      on Latest.CommonSOCode = Orig.CommonSOCode
                  where MD.SupervisorCode = @EmpCode
                    and MONTH(MS.DocDate) = @Month and YEAR(MS.DocDate) = @Year",
                new[]
                {
                    SqlHelper.Param("@EmpCode", SqlDbType.Int, empCode),
                    SqlHelper.Param("@Month", SqlDbType.Int, month),
                    SqlHelper.Param("@Year", SqlDbType.Int, year)
                });
            return dt.AsEnumerable()
                .Select(r => (Convert.ToInt32(r["SOCode"]), Convert.ToDateTime(r["DocDate"]).Date))
                .ToHashSet();
        }

        // Resolves each (possibly stale, pre-revision) SOCode to its Sales Order's current latest
        // revision - same CommonSOCode grouping GetScheduledSoCodes/GetScheduledJobDatePairs use, so
        // an existing DailySiteHdr row's own JobCode compares correctly against them even if that
        // row was created against an older revision than exists today.
        private Dictionary<int, int> ResolveLatestSoCodes(IEnumerable<int> soCodes)
        {
            var distinctCodes = soCodes.Distinct().ToList();
            var map = new Dictionary<int, int>();
            if (distinctCodes.Count == 0) return map;

            var dt = _db.GetDataTableFromQuery(
                @"select Orig.SOCode, Latest.SOCode as LatestSOCode
                  from SalesOrderNew Orig
                  inner join (select max(SOCode) as SOCode, CommonSOCode from SalesOrderNew group by CommonSOCode) Latest
                      on Latest.CommonSOCode = Orig.CommonSOCode
                  where Orig.SOCode in (" + string.Join(",", distinctCodes) + ")");
            foreach (DataRow row in dt.Rows)
                map[Convert.ToInt32(row["SOCode"])] = Convert.ToInt32(row["LatestSOCode"]);
            return map;
        }

        // docDate is optional - only known once the user is on the detail form and has a Doc Date
        // chosen (the initial page-load call from the list has none yet). Without it, scheduled
        // jobs can't be resolved (supervision is now date-specific), so the dropdown simply stays
        // empty until a date is available.
        public DataTable GetSalesOrders(int empCode, bool restrictToSupervised, DateTime? docDate)
        {
            var dt = _db.GetDataTableFromProcedure("usp_GetDailySiteSalesOrderNo");
            if (!restrictToSupervised) return dt;
            if (!docDate.HasValue) return dt.Clone();

            var scheduledSoCodes = GetScheduledSoCodes(empCode, docDate.Value);
            var filtered = dt.Clone();
            foreach (DataRow row in dt.Rows)
            {
                if (row["SOCode"] == DBNull.Value) continue;
                var soCode = Convert.ToInt32(row["SOCode"]);
                if (scheduledSoCodes.Contains(soCode)) filtered.ImportRow(row);
            }
            return filtered;
        }

        /// <summary>New (no desktop equivalent) - warns before creating a second Daily Site record
        /// for the same Sales Order on the same date. ExcludeCode lets an in-progress edit of an
        /// existing record skip matching against itself.</summary>
        public JobDateExistCheck CheckExistingForJobAndDate(int jobCode, DateTime docDate, int excludeCode)
        {
            var p = new[]
            {
                SqlHelper.Param("@JobCode", SqlDbType.Int, jobCode),
                SqlHelper.Param("@DocDate", SqlDbType.DateTime, docDate),
                SqlHelper.Param("@ExcludeCode", SqlDbType.Int, excludeCode)
            };
            var dt = _db.GetDataTableFromQuery(
                @"SELECT TOP 1 DailySiteCode, DocNo FROM DailySiteHdr
                  WHERE JobCode = @JobCode AND CAST(DocDate AS DATE) = CAST(@DocDate AS DATE) AND DailySiteCode <> @ExcludeCode",
                p);

            if (dt.Rows.Count == 0) return new JobDateExistCheck { Exists = false };
            return new JobDateExistCheck
            {
                Exists = true,
                Code = Convert.ToInt32(dt.Rows[0]["DailySiteCode"]),
                DocNo = dt.Rows[0]["DocNo"]?.ToString() ?? string.Empty
            };
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
        public EmployeeHourContext GetEmployeeHourContext(int employeeCode, DateTime docDate, int dailySiteCode, int loginBranchCode, int periodId, int jobCode = 0)
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

            if (jobCode > 0)
            {
                var dtAttendance = _db.GetDataTableFromQuery(
                    @"select top 1 CheckInTime, CheckOutTime from LabourAttendance
                      where EmployeeCode = @EmployeeCode and DocDate = @DocDate and JobCode = @JobCode
                      order by Code desc",
                    new[]
                    {
                        SqlHelper.Param("@EmployeeCode", SqlDbType.Int, employeeCode),
                        SqlHelper.Param("@DocDate", SqlDbType.Date, docDate.Date),
                        SqlHelper.Param("@JobCode", SqlDbType.Int, jobCode)
                    });

                if (dtAttendance.Rows.Count > 0)
                {
                    var checkIn = dtAttendance.Rows[0]["CheckInTime"] as DateTime?;
                    var checkOut = dtAttendance.Rows[0]["CheckOutTime"] as DateTime?;
                    ctx.AttendanceCheckIn = checkIn;
                    ctx.AttendanceCheckOut = checkOut;
                    if (checkIn.HasValue && checkOut.HasValue)
                        ctx.AttendanceHrs = Math.Round((decimal)(checkOut.Value - checkIn.Value).TotalHours, 2);
                }
            }

            return ctx;
        }

        // Every employee who has a Check In recorded (Labour Attendance / face recognition) for
        // this exact Job (Sales Order) and date - lets the Employee Hrs grid auto-add rows for
        // whoever actually attended, instead of only the SO's default employee template.
        public DataTable GetAttendanceEmployeesForJob(int jobCode, DateTime docDate) => _db.GetDataTableFromQuery(
            @"select distinct A.EmployeeCode, E.EmpFullName
              from LabourAttendance A
              left join payrollEmployeeInfo E on E.EmployeeCode = A.EmployeeCode
              where A.JobCode = @JobCode and A.DocDate = @DocDate and A.CheckInTime is not null",
            new[]
            {
                SqlHelper.Param("@JobCode", SqlDbType.Int, jobCode),
                SqlHelper.Param("@DocDate", SqlDbType.Date, docDate.Date)
            });

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
        /// Lightweight replacement for GetMaterialPreviousContext's TodayMaterialsUsed figure - calls
        /// usp_GetDailySiteMaterialPrevTotalUsed (plain sum of TodayConsumed across every other DailySiteCode
        /// on the same CommonSOCode/material, with the same BaseUnitCode/PackSize divide rule applied per
        /// historical row) instead of the old, heavier usp_GetDailySiteSOWisePreviousMaterialDtl. Also returns
        /// the cumulative Scope of Work Area Completed for the material's Surface Preparation Code (matched
        /// via the estimation behind this Sales Order) - the source for the Material table's Area/No/Mtr column.
        /// </summary>
        public MaterialPrevTotalUsedResult GetMaterialPrevTotalUsed(int soCode, int dailySiteCode, int itemCode)
        {
            var p = new[]
            {
                SqlHelper.Param("@SOCode", SqlDbType.Int, soCode),
                SqlHelper.Param("@DailySiteCode", SqlDbType.Int, dailySiteCode),
                SqlHelper.Param("@ItemCode", SqlDbType.Int, itemCode)
            };
            var dt = _db.GetDataTableFromProcedure("usp_GetDailySiteMaterialPrevTotalUsed", p);
            if (dt.Rows.Count == 0) return new MaterialPrevTotalUsedResult();

            var row = dt.Rows[0];
            return new MaterialPrevTotalUsedResult
            {
                TotalUsed = DecimalOrDefault(row, "TotalUsed"),
                Area = DecimalOrDefault(row, "Area"),
                RateOfApplication = DecimalOrDefault(row, "RateofApplication"),
                SurfacePreparationCode = (int)DecimalOrDefault(row, "SurfacePreparationCode")
            };
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
        // AdminUserCategoryInfo: 1 = ADMIN. Normal users (any other UCatCode, including Power
        // User) can only Update/Delete a Daily Site within 24 hours of its own DocDate - once
        // that window closes the record is locked from further changes by anyone except an
        // ADMIN-category user, who is always exempt.
        private const int ExemptUCatCode = 1;

        private string? CheckEditWindow(int dailySiteCode, int mode, int uCatCode)
        {
            if (mode == 0 || uCatCode == ExemptUCatCode) return null;

            var hdr = GetById(dailySiteCode);
            if (hdr.Rows.Count == 0) return null;

            var docDate = hdr.Rows[0]["DocDate"] as DateTime?;
            if (docDate == null) return null;

            if (DateTime.Now - docDate.Value > TimeSpan.FromHours(24))
                return "This record is more than 24 hours old and can no longer be updated or deleted.";

            return null;
        }

        public string Save(DailySiteSaveRequest req, int branchCode, int periodId, int userCode, int uCatCode)
        {
            var blockMessage = CheckEditWindow(req.DailySiteCode, req.Mode, uCatCode);
            if (blockMessage != null) return blockMessage;

            try
            {
                // ============================================================
                // 1. Convert request collections to DataTables
                // ============================================================

                DataTable dtScopeOfWork =
                    ToScopeOfWorkTable(req.ScopeOfWork, req.DailySiteCode);

                DataTable dtMaterial =
                    ToMaterialTable(req.Material, req.DailySiteCode);

                var attendanceHrsMap = GetAttendanceHrsMap(req.JobCode, req.DocDate);
                DataTable dtConsumablesAndMachineries =
                    ToEmployeeHourTable(
                        req.ConsumablesAndMachineries,
                        req.DailySiteCode,
                        attendanceHrsMap);

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

                var result = _db.DataTransactionsByProcedure(
                    "usp_ManageDailySite",
                    p);

                var narration = $"{req.DocNo} - Daily Site";
                switch (req.Mode)
                {
                    case 0: _audit.LogAdd("Daily Site", $"{narration} Added", branchCode); break;
                    case 2: _audit.LogDelete("Daily Site", $"{narration} Deleted", branchCode); break;
                    default: _audit.LogEdit("Daily Site", $"{narration} Edited", branchCode); break;
                }

                return result;
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
                ("Division", typeof(int)),
                ("Remarks", typeof(string))
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

                dr["Remarks"] =
                    row.Remarks ?? "";

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

        /// <summary>AttendanceHrs is deliberately computed fresh here from LabourAttendance at
        /// save time - keyed by EmployeeCode, one lookup per employee/job/date, latest attendance
        /// row wins (matches GetEmployeeHourContext's own "top 1 ... order by Code desc"
        /// convention) - rather than trusting a value the frontend might send, since the frontend
        /// only ever displays a live preview and never actually submits this field itself.
        /// WHEN CheckOutTime/CheckInTime IS NULL (an incomplete scan) THEN 8.00, exactly matching
        /// the formula requested, instead of leaving it blank.</summary>
        private Dictionary<int, decimal> GetAttendanceHrsMap(int jobCode, DateTime docDate)
        {
            var map = new Dictionary<int, decimal>();
            if (jobCode <= 0) return map;

            var dt = _db.GetDataTableFromQuery(
                @"SELECT EmployeeCode, CONVERT(decimal(18,2),
                    CASE
                        WHEN CheckOutTime IS NULL THEN 8.00
                        WHEN CheckInTime IS NULL THEN 8.00
                        ELSE DATEDIFF(SECOND, CheckInTime, CheckOutTime) / 3600.0
                    END) AS AttendanceHrs
                  FROM (
                    SELECT EmployeeCode, CheckInTime, CheckOutTime,
                           ROW_NUMBER() OVER (PARTITION BY EmployeeCode ORDER BY Code DESC) AS rn
                    FROM LabourAttendance
                    WHERE JobCode = @JobCode AND DocDate = @DocDate
                  ) d WHERE rn = 1",
                new[]
                {
                    SqlHelper.Param("@JobCode", SqlDbType.Int, jobCode),
                    SqlHelper.Param("@DocDate", SqlDbType.Date, docDate.Date)
                });

            foreach (DataRow row in dt.Rows)
                map[Convert.ToInt32(row["EmployeeCode"])] = Convert.ToDecimal(row["AttendanceHrs"]);
            return map;
        }

        private static DataTable ToEmployeeHourTable(List<EmployeeHourRow> rows, int dailySiteCode, Dictionary<int, decimal> attendanceHrsMap)
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
                ("AttendanceHrs", typeof(decimal)),
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
                dr["AttendanceHrs"] = attendanceHrsMap.TryGetValue(row.EmployeeCode, out var ah) ? (object)ah : DBNull.Value;
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
                ("BaseUnitCode", typeof(int)),
                ("PackSize", typeof(decimal)));

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
                dr["PackSize"] = row.PackSize;
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
