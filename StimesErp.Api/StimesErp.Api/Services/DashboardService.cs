using System.Data;
using System.Linq;
using StimesErp.Api.Data;

namespace StimesErp.Api.Services
{
    /// <summary>
    /// Backs the admin KPI dashboard. Calls usp_dashboard_GetKPIs (7 result sets:
    /// sales invoice, purchase invoice, stock value, sales followup, attendance
    /// snapshot, attendance %, 6-month sales/purchase trend) and shapes it into a
    /// single JSON-friendly object.
    /// </summary>
    public class DashboardService
    {
        private readonly SqlHelper _db;

        public DashboardService(SqlHelper db)
        {
            _db = db;
        }

        // Same rule the desktop dashboard uses: branch 6 (RETROSYS BHARATH LLP) posts in INR,
        // every other branch posts in AED. Mixing the two in one selection makes a summed
        // total meaningless, so the frontend shows a warning instead of a blended number.
        private const int RetrosysBranchCode = 6;

        public object GetBranches()
        {
            var dt = _db.GetDataTableFromQuery("SELECT BranchCode, BranchName FROM AdminBranchInfo ORDER BY BranchName");
            return dt.Rows.Cast<DataRow>().Select(r => new
            {
                branchCode = Convert.ToInt32(r["BranchCode"]),
                branchName = r["BranchName"].ToString()
            }).ToList();
        }

        public object GetDepartments()
        {
            var dt = _db.GetDataTableFromProcedure("usp_dashboard_GetDepartments");
            return dt.Rows.Cast<DataRow>().Select(r => new
            {
                departmentCode = Convert.ToInt32(r["DepartmentCode"]),
                departmentName = r["DeptName"].ToString()
            }).ToList();
        }

        private static string GetCurrencyStatus(string? branchCode)
        {
            if (string.IsNullOrWhiteSpace(branchCode))
            {
                // "All branches" always includes Retrosys (INR) alongside the AED branches.
                return "MIXED";
            }

            var codes = branchCode.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                .Select(int.Parse).ToList();

            bool hasRetrosys = codes.Contains(RetrosysBranchCode);
            bool hasOthers = codes.Any(c => c != RetrosysBranchCode);

            if (hasRetrosys && hasOthers) return "MIXED";
            if (hasRetrosys) return "INR";
            return "AED";
        }

        public object GetKpis(DateTime fromDate, DateTime toDate, string? branchCode, int? departmentCode)
        {
            var p = new[]
            {
                SqlHelper.Param("@FromDate", SqlDbType.Date, fromDate),
                SqlHelper.Param("@ToDate", SqlDbType.Date, toDate),
                SqlHelper.Param("@BranchCode", SqlDbType.VarChar, string.IsNullOrWhiteSpace(branchCode) ? null : branchCode, 200),
                SqlHelper.Param("@DepartmentCode", SqlDbType.Int, departmentCode)
            };

            var ds = _db.GetDataSetFromProcedure("usp_dashboard_GetKPIs", p);

            DataRow? Row(int i) => ds.Tables.Count > i && ds.Tables[i].Rows.Count > 0 ? ds.Tables[i].Rows[0] : null;

            decimal Dec(DataRow? r, string col) => r != null && r[col] != DBNull.Value ? Convert.ToDecimal(r[col]) : 0m;
            int Int(DataRow? r, string col) => r != null && r[col] != DBNull.Value ? Convert.ToInt32(r[col]) : 0;

            var salesRow = Row(0);
            var purchaseRow = Row(1);
            var stockRow = Row(2);
            var followupRow = Row(3);
            var attendanceRow = Row(4);
            var attendancePctRow = Row(5);
            var activityRow = Row(7);

            var trend = new List<object>();
            if (ds.Tables.Count > 6)
            {
                foreach (DataRow r in ds.Tables[6].Rows)
                {
                    trend.Add(new
                    {
                        monthLabel = r["MonthLabel"].ToString(),
                        salesValue = Dec(r, "SalesValue"),
                        purchaseValue = Dec(r, "PurchaseValue")
                    });
                }
            }

            int Category(string name) => ds.Tables.Count > 8
                ? ds.Tables[8].Rows.Cast<DataRow>()
                    .Where(r => r["Category"].ToString() == name)
                    .Select(r => Convert.ToInt32(r["EmployeeCount"]))
                    .FirstOrDefault()
                : 0;

            var staffCount = Category("Staff");
            var driverCount = Category("Driver");
            var labourCount = Category("Labour");
            var subContractCount = Category("SubContract");

            var currencyStatus = GetCurrencyStatus(branchCode);

            return new
            {
                currencyCode = currencyStatus,
                currencyWarning = currencyStatus == "MIXED"
                    ? "Selected branches mix currencies (AED and INR) - the totals below are a blended sum, not directly comparable. Pick a single-currency branch selection for accurate totals."
                    : null,
                salesInvoice = new { totalValue = Dec(salesRow, "TotalSalesInvoiceValue"), count = Int(salesRow, "InvoiceCount") },
                purchaseInvoice = new { totalValue = Dec(purchaseRow, "TotalPurchaseInvoiceValue"), count = Int(purchaseRow, "InvoiceCount") },
                stockValue = new { totalValue = Dec(stockRow, "TotalStockValue"), itemCount = Int(stockRow, "ItemCount") },
                salesFollowup = new { bookedCount = Int(followupRow, "BookedFollowupCount"), bookedAmount = Dec(followupRow, "BookedFollowupAmount") },
                attendance = new
                {
                    asOfDate = attendanceRow != null && attendanceRow["AttendanceAsOfDate"] != DBNull.Value
                        ? Convert.ToDateTime(attendanceRow["AttendanceAsOfDate"]).ToString("yyyy-MM-dd")
                        : null,
                    presentCount = Int(attendanceRow, "PresentCount"),
                    absentCount = Int(attendanceRow, "AbsentCount"),
                    onLeaveCount = Int(attendanceRow, "OnLeaveCount"),
                    totalMarked = Int(attendanceRow, "TotalMarked"),
                    attendancePercent = attendancePctRow != null && attendancePctRow["AttendancePercent"] != DBNull.Value
                        ? Convert.ToDecimal(attendancePctRow["AttendancePercent"])
                        : 0m
                },
                salesActivity = new
                {
                    enquiryCount = Int(activityRow, "EnquiryCount"),
                    siteVisitCount = Int(activityRow, "SiteVisitCount")
                },
                workforce = new
                {
                    staffCount,
                    driverCount,
                    labourCount,
                    subContractCount,
                    totalEmployeeCount = staffCount + driverCount + labourCount + subContractCount
                },
                trend
            };
        }
    }
}
