-- Fixes usp_dashboard_GetKPIs so @ToDate is treated as a fully inclusive calendar day.
-- The SP takes @FromDate/@ToDate as DATE, but every date column it filters against
-- (SalesInvoiceDate, PInvDate, OrderExpectedDate, AttendanceDate, EnqDate, DocDate) is
-- DATETIME. "BETWEEN @FromDate AND @ToDate" implicitly widens @ToDate to midnight, so any
-- row timestamped later that day on @ToDate was silently excluded - the KPIs quietly
-- undercounted "today" every time @ToDate = today (the default). Also fixes an exact-equality
-- bug at Result 5 (AD.AttendanceDate = @LatestDate) that could never match a timestamped row.
-- Web-only SP (confirmed not referenced anywhere in the desktop WPF source) - safe to alter
-- directly; no desktop-side coordination needed since the signature/result shape is unchanged.
ALTER PROCEDURE usp_dashboard_GetKPIs
    @FromDate DATE,
    @ToDate DATE,
    @BranchCode VARCHAR(200) = NULL,
    @DepartmentCode INT = NULL
AS
BEGIN
    SET NOCOUNT ON;

    -- Result 1: Sales Invoice total for the period
    SELECT ISNULL(SUM(s.FinalAmount), 0) AS TotalSalesInvoiceValue,
           COUNT(*) AS InvoiceCount
    FROM SalesInvoiceNew s
    WHERE s.SalesInvoiceDate >= @FromDate AND s.SalesInvoiceDate < DATEADD(day, 1, @ToDate)
      AND ISNULL(s.PostedYesNo, 'Y') <> 'N'
      AND (@BranchCode IS NULL OR CHARINDEX(',' + CAST(s.BranchCode AS VARCHAR(10)) + ',', ',' + @BranchCode + ',') > 0);

    -- Result 2: Purchase Invoice total for the period
    SELECT ISNULL(SUM(p.FinalAmount), 0) AS TotalPurchaseInvoiceValue,
           COUNT(*) AS InvoiceCount
    FROM purchasePurchaseInvoiceHdr p
    WHERE p.PInvDate >= @FromDate AND p.PInvDate < DATEADD(day, 1, @ToDate)
      AND p.ActiveYesNo = 'Y'
      AND (@BranchCode IS NULL OR CHARINDEX(',' + CAST(p.BranchCode AS VARCHAR(10)) + ',', ',' + @BranchCode + ',') > 0);

    -- Result 3: Stock Value as of @ToDate
    DECLARE @PeriodId INT;
    SELECT @PeriodId = ISNULL(PeriodId, 0)
    FROM AdminFinancialPeriodInfo
    WHERE @ToDate BETWEEN CONVERT(DATE, FromDate) AND CONVERT(DATE, ToDate);

    ;WITH ItemBalance AS (
        SELECT IM.ItemCode,
               SUM(IMS.StockQty) AS StockQty,
               CASE WHEN SUM(IMS.StockQty) > 0 THEN ABS(SUM(IMS.StockAmount)) ELSE SUM(IMS.StockAmount) END AS StockAmount
        FROM InvoiceMaterialStock IMS
        INNER JOIN AdminItemInfo IM ON IM.ItemCode = IMS.ItemCode
        WHERE CONVERT(DATE, IMS.StockDate) <= @ToDate
          AND IMS.PeriodID = @PeriodId
          AND (@BranchCode IS NULL OR CHARINDEX(',' + CAST(IMS.BranchCode AS VARCHAR(10)) + ',', ',' + @BranchCode + ',') > 0)
        GROUP BY IM.ItemCode
    )
    SELECT ISNULL(SUM(StockAmount), 0) AS TotalStockValue, COUNT(*) AS ItemCount
    FROM ItemBalance
    WHERE StockQty > 0;

    -- Result 4: Sales Followup booked in the period
    SELECT COUNT(*) AS BookedFollowupCount,
           ISNULL(SUM(f.FinalQtnAmount), 0) AS BookedFollowupAmount
    FROM SalesFollowUpHdr f
    INNER JOIN SalesFollowUpDtls D ON D.SalesFollowUpCode = f.SalesFollowUpCode
    WHERE D.OrderExpectedDate >= @FromDate AND D.OrderExpectedDate < DATEADD(day, 1, @ToDate)
      AND D.SalesFollowUpStatusCode = 8
      AND f.ActiveYesNo = 'Y'
      AND (@BranchCode IS NULL OR CHARINDEX(',' + CAST(f.BranchCode AS VARCHAR(10)) + ',', ',' + @BranchCode + ',') > 0);

    -- Result 5: Attendance for the most recent marked date up to @ToDate
    DECLARE @LatestDate DATE = (SELECT MAX(CONVERT(date, AttendanceDate)) FROM AttendanceDetails WHERE AttendanceDate < DATEADD(day, 1, @ToDate));

    SELECT @LatestDate AS AttendanceAsOfDate,
           SUM(CASE WHEN AD.AttendanceStatus = 'P' THEN 1 ELSE 0 END)  AS PresentCount,
           SUM(CASE WHEN AD.AttendanceStatus = 'A' THEN 1 ELSE 0 END)  AS AbsentCount,
           SUM(CASE WHEN AD.AttendanceStatus = 'VL' THEN 1 ELSE 0 END) AS OnLeaveCount,
           COUNT(*) AS TotalMarked
    FROM AttendanceDetails AD
    LEFT JOIN PayRollEmployeeInfo Em ON Em.EmployeeCode = AD.EmployeeCode
    WHERE CONVERT(date, AD.AttendanceDate) = @LatestDate
      AND (@DepartmentCode IS NULL OR Em.DepartmentCode = @DepartmentCode)
      AND (@BranchCode IS NULL OR CHARINDEX(',' + CAST(Em.BranchCode AS VARCHAR(10)) + ',', ',' + @BranchCode + ',') > 0);

    -- Result 6: Attendance percentage for the period
    SELECT
        SUM(CASE WHEN AD.AttendanceStatus = 'P' THEN 1 ELSE 0 END) AS PresentDays,
        SUM(CASE WHEN AD.AttendanceStatus IN ('P','A') THEN 1 ELSE 0 END) AS EligibleDays,
        CASE WHEN SUM(CASE WHEN AD.AttendanceStatus IN ('P','A') THEN 1 ELSE 0 END) = 0 THEN 0
             ELSE ROUND(100.0 * SUM(CASE WHEN AD.AttendanceStatus = 'P' THEN 1 ELSE 0 END)
                  / SUM(CASE WHEN AD.AttendanceStatus IN ('P','A') THEN 1 ELSE 0 END), 1)
        END AS AttendancePercent
    FROM AttendanceDetails AD
    LEFT JOIN PayRollEmployeeInfo Em ON Em.EmployeeCode = AD.EmployeeCode
    WHERE AD.AttendanceDate >= @FromDate AND AD.AttendanceDate < DATEADD(day, 1, @ToDate)
      AND (@DepartmentCode IS NULL OR Em.DepartmentCode = @DepartmentCode)
      AND (@BranchCode IS NULL OR CHARINDEX(',' + CAST(Em.BranchCode AS VARCHAR(10)) + ',', ',' + @BranchCode + ',') > 0);

    -- Result 7: Sales vs Purchase trend - covers the selected date range,
    -- minimum 6 months (ending at @ToDate's month); expands if a longer range is picked, capped at 36 months.
    DECLARE @MonthsSpan INT = DATEDIFF(MONTH, @FromDate, @ToDate) + 1;
    IF @MonthsSpan < 6 SET @MonthsSpan = 6;
    IF @MonthsSpan > 36 SET @MonthsSpan = 36;

    ;WITH Months AS (
        SELECT 0 AS n, DATEFROMPARTS(YEAR(@ToDate), MONTH(@ToDate), 1) AS MonthStart
        UNION ALL
        SELECT n + 1, DATEADD(MONTH, -1, MonthStart) FROM Months WHERE n < @MonthsSpan - 1
    )
    SELECT FORMAT(M.MonthStart, 'MMM yyyy') AS MonthLabel,
           ISNULL((SELECT SUM(s.FinalAmount) FROM SalesInvoiceNew s
                   WHERE s.SalesInvoiceDate >= M.MonthStart AND s.SalesInvoiceDate < DATEADD(MONTH, 1, M.MonthStart)
                     AND ISNULL(s.PostedYesNo, 'Y') <> 'N'
                     AND (@BranchCode IS NULL OR CHARINDEX(',' + CAST(s.BranchCode AS VARCHAR(10)) + ',', ',' + @BranchCode + ',') > 0)), 0) AS SalesValue,
           ISNULL((SELECT SUM(p.FinalAmount) FROM purchasePurchaseInvoiceHdr p
                   WHERE p.PInvDate >= M.MonthStart AND p.PInvDate < DATEADD(MONTH, 1, M.MonthStart)
                     AND p.ActiveYesNo = 'Y'
                     AND (@BranchCode IS NULL OR CHARINDEX(',' + CAST(p.BranchCode AS VARCHAR(10)) + ',', ',' + @BranchCode + ',') > 0)), 0) AS PurchaseValue
    FROM Months M
    ORDER BY M.MonthStart
    OPTION (MAXRECURSION 40);

    -- Result 8: Sales activity - enquiries & site visits in the period
    SELECT
        (SELECT COUNT(*) FROM salesEnquiryHdr e
            WHERE e.EnqDate >= @FromDate AND e.EnqDate < DATEADD(day, 1, @ToDate)
              AND (@BranchCode IS NULL OR CHARINDEX(',' + CAST(e.BranchCode AS VARCHAR(10)) + ',', ',' + @BranchCode + ',') > 0)
        ) AS EnquiryCount,
        (SELECT COUNT(*) FROM Sales_SiteVisitDetails sv
            WHERE sv.DocDate >= @FromDate AND sv.DocDate < DATEADD(day, 1, @ToDate)
              AND (@BranchCode IS NULL OR CHARINDEX(',' + CAST(sv.BranchCode AS VARCHAR(10)) + ',', ',' + @BranchCode + ',') > 0)
        ) AS SiteVisitCount;

    -- Result 9: Workforce by category (Staff / Driver / Labour / SubContract), active employees only
    SELECT
        CASE
            WHEN Em.SupplierCode > 0 THEN 'SubContract'
            WHEN Em.CurrentDesigCode IN (63, 159) THEN 'Driver'
            WHEN Em.CurrentDesigCode NOT IN (63, 159) AND ISNULL(Em.CategoryCode, 0) IN (12, 13, 14) THEN 'Labour'
            ELSE 'Staff'
        END AS Category,
        COUNT(*) AS EmployeeCount
    FROM PayRollEmployeeInfo Em
    WHERE Em.ActiveYesNo = 'Y'
      AND (@BranchCode IS NULL OR CHARINDEX(',' + CAST(Em.BranchCode AS VARCHAR(10)) + ',', ',' + @BranchCode + ',') > 0)
      AND (@DepartmentCode IS NULL OR Em.DepartmentCode = @DepartmentCode)
    GROUP BY
        CASE
            WHEN Em.SupplierCode > 0 THEN 'SubContract'
            WHEN Em.CurrentDesigCode IN (63, 159) THEN 'Driver'
            WHEN Em.CurrentDesigCode NOT IN (63, 159) AND ISNULL(Em.CategoryCode, 0) IN (12, 13, 14) THEN 'Labour'
            ELSE 'Staff'
        END;
END
