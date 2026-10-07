using System.Data;
using Microsoft.Data.SqlClient;
using StimesErp.Api.Data;

namespace StimesErp.Api.Services
{
    // Web-only report (no desktop equivalent) - Requested vs Issued vs Balance qty, per Sales
    // Order + item, aggregated across every Resource Requisition / Material Issue that touched
    // that job/item in a date range.
    //
    // Requested comes from purchaseResourceReqnDtlMaterial/Consumable/TAE (the desktop "Resource
    // Requisition" screen's own data - confirmed against its XAML: the grid column labelled
    // "Est Qty" binds to EstQty).
    //
    // Issued comes from a SEPARATE table family - productionMaterialIssueHdr/Dtl* (the desktop
    // "Material Issue" transaction screen) - NOT from the requisition's own IssuedQty column,
    // which is just a cached/summary field. productionMaterialIssueHdr links to the Sales Order
    // via its SOCode column specifically (its JobCode column is always 0 in real data - confirmed
    // directly: 933/933 non-zero SOCode rows match a real SalesOrderNew.SOCode, 0 rows have a
    // non-zero JobCode) and optionally back to the originating requisition via MatRqnCode.
    //
    // Requested and Issued are aggregated independently (each by latest-revision SOCode + item,
    // same CommonSOCode resolution both sides) and then combined with a full outer join, since an
    // item can be requested with nothing issued yet, or - less commonly - show an issue with no
    // matching request inside the same date window.
    public class ResourceReportService
    {
        private readonly SqlHelper _db;

        public ResourceReportService(SqlHelper db)
        {
            _db = db;
        }

        public DataTable GetMaterialReport(DateTime fromDate, DateTime toDate, int soCode, string branchCodes, int itemCode) =>
            _db.GetDataTableFromQuery(
                @"select isnull(Req.SOCode, Iss.SOCode) as SOCode,
                         S.SONo + ' - ' + isnull(C.CustomerName,'') as JobNo,
                         isnull(Req.ItemCode, Iss.ItemCode) as ItemCode,
                         isnull(IM.Description,'') + '-' + convert(varchar, isnull(IM.ItemItemCode,'')) as ItemName,
                         isnull(U.UnitDesc,'') as UnitName,
                         isnull(Req.RequestedQty, 0) as RequestedQty,
                         isnull(Iss.IssuedQty, 0) as IssuedQty,
                         isnull(Req.RequestedQty, 0) - isnull(Iss.IssuedQty, 0) as BalanceQty
                  from (
                      select Latest.SOCode, D.ItemCode, D.UnitCode, sum(D.EstQty) as RequestedQty
                      from purchaseResourceReqnDtlMaterial D
                      inner join purchaseResourceReqnHdr H on H.RReqnCode = D.RReqnCode
                      inner join SalesOrderNew Orig on Orig.SOCode = H.JobCode
                      inner join (select max(SOCode) as SOCode, CommonSOCode from SalesOrderNew group by CommonSOCode) Latest
                          on Latest.CommonSOCode = Orig.CommonSOCode
                      where H.JobCode > 0
                        and D.ItemCode > 0
                        and H.PReqnDate >= @FromDate and H.PReqnDate < @ToDatePlusOne
                        and (@BranchCodes = '' or H.BranchCode in (select data from StimesTech_Split(@BranchCodes, ',')))
                        and (@SOCode = 0 or Latest.SOCode = @SOCode)
                        and (@ItemCode = 0 or D.ItemCode = @ItemCode)
                      group by Latest.SOCode, D.ItemCode, D.UnitCode
                  ) Req
                  full outer join (
                      select Latest.SOCode, U.ItemCode, U.UnitCode, sum(U.Qty) as IssuedQty
                      from (
                          select H.SOCode, Orig.CommonSOCode, D.ItemCode, D.UnitCode, D.IssuedQty as Qty, H.BranchCode, H.MatIssueDate
                          from productionMaterialIssueDtlMaterial D
                          inner join productionMaterialIssueHdr H on H.MatIssueCode = D.MatIssueCode
                          inner join SalesOrderNew Orig on Orig.SOCode = H.SOCode
                          where H.SOCode > 0 and D.ItemCode > 0 and D.IssuedQty > 0

                          union all

                          -- Same 'Material Issue' header, but items issued through the General/ad-hoc
                          -- issue grid (purchaseResourceIssueDtlGeneral, TypeCode=1) rather than the
                          -- requisition-backed Material grid - usp_ResourceIssueReportList unions both.
                          select H.SOCode, Orig.CommonSOCode, D.ItemCode, D.UnitCode, D.Qty, H.BranchCode, H.MatIssueDate
                          from purchaseResourceIssueDtlGeneral D
                          inner join productionMaterialIssueHdr H on H.MatIssueCode = D.MatIssueCode
                          inner join SalesOrderNew Orig on Orig.SOCode = H.SOCode
                          where D.TypeCode = 1 and H.SOCode > 0 and D.ItemCode > 0 and D.Qty > 0
                      ) U
                      inner join (select max(SOCode) as SOCode, CommonSOCode from SalesOrderNew group by CommonSOCode) Latest
                          on Latest.CommonSOCode = U.CommonSOCode
                      where U.MatIssueDate >= @FromDate and U.MatIssueDate < @ToDatePlusOne
                        and (@BranchCodes = '' or U.BranchCode in (select data from StimesTech_Split(@BranchCodes, ',')))
                        and (@SOCode = 0 or Latest.SOCode = @SOCode)
                        and (@ItemCode = 0 or U.ItemCode = @ItemCode)
                      group by Latest.SOCode, U.ItemCode, U.UnitCode
                  ) Iss on Iss.SOCode = Req.SOCode and Iss.ItemCode = Req.ItemCode
                  left join SalesOrderNew S on S.SOCode = isnull(Req.SOCode, Iss.SOCode)
                  left join sopCustomerInfo C on C.CustomerCode = S.CustomerCode
                  left join AdminItemInfo IM on IM.ItemCode = isnull(Req.ItemCode, Iss.ItemCode)
                  left join ADMINUNITINFO U on U.UnitCode = isnull(Req.UnitCode, Iss.UnitCode)
                  where isnull(Req.RequestedQty, 0) > 0 or isnull(Iss.IssuedQty, 0) > 0
                  order by S.SONo, ItemName",
                Params(fromDate, toDate, soCode, branchCodes, itemCode));

        public DataTable GetConsumableReport(DateTime fromDate, DateTime toDate, int soCode, string branchCodes, int itemCode) =>
            _db.GetDataTableFromQuery(
                @"select isnull(Req.SOCode, Iss.SOCode) as SOCode,
                         S.SONo + ' - ' + isnull(C.CustomerName,'') as JobNo,
                         isnull(Req.ItemCode, Iss.ItemCode) as ItemCode,
                         isnull(IM.Description,'') + '-' + convert(varchar, isnull(IM.ConsumableItemCode,'')) as ItemName,
                         isnull(U.UnitDesc,'') as UnitName,
                         isnull(Req.RequestedQty, 0) as RequestedQty,
                         isnull(Iss.IssuedQty, 0) as IssuedQty,
                         isnull(Req.RequestedQty, 0) - isnull(Iss.IssuedQty, 0) as BalanceQty
                  from (
                      select Latest.SOCode, D.ConsumableCode as ItemCode, D.UnitCode, sum(D.EstQty) as RequestedQty
                      from purchaseResourceReqnDtlConsumable D
                      inner join purchaseResourceReqnHdr H on H.RReqnCode = D.RReqnCode
                      inner join SalesOrderNew Orig on Orig.SOCode = H.JobCode
                      inner join (select max(SOCode) as SOCode, CommonSOCode from SalesOrderNew group by CommonSOCode) Latest
                          on Latest.CommonSOCode = Orig.CommonSOCode
                      where H.JobCode > 0
                        and D.ConsumableCode > 0
                        and H.PReqnDate >= @FromDate and H.PReqnDate < @ToDatePlusOne
                        and (@BranchCodes = '' or H.BranchCode in (select data from StimesTech_Split(@BranchCodes, ',')))
                        and (@SOCode = 0 or Latest.SOCode = @SOCode)
                        and (@ItemCode = 0 or D.ConsumableCode = @ItemCode)
                      group by Latest.SOCode, D.ConsumableCode, D.UnitCode
                  ) Req
                  full outer join (
                      select Latest.SOCode, U.ItemCode, U.UnitCode, sum(U.Qty) as IssuedQty
                      from (
                          select H.SOCode, Orig.CommonSOCode, D.ConsumableCode as ItemCode, D.UnitCode, D.IssuedQty as Qty, H.BranchCode, H.MatIssueDate
                          from productionMaterialIssueDtlConsumable D
                          inner join productionMaterialIssueHdr H on H.MatIssueCode = D.MatIssueCode
                          inner join SalesOrderNew Orig on Orig.SOCode = H.SOCode
                          where H.SOCode > 0 and D.ConsumableCode > 0 and D.IssuedQty > 0

                          union all

                          -- Same 'Material Issue' header, but items issued through the General/ad-hoc
                          -- issue grid (purchaseResourceIssueDtlGeneral, TypeCode=2) rather than the
                          -- requisition-backed Consumable grid - usp_ResourceIssueReportList unions both.
                          select H.SOCode, Orig.CommonSOCode, D.ItemCode, D.UnitCode, D.Qty, H.BranchCode, H.MatIssueDate
                          from purchaseResourceIssueDtlGeneral D
                          inner join productionMaterialIssueHdr H on H.MatIssueCode = D.MatIssueCode
                          inner join SalesOrderNew Orig on Orig.SOCode = H.SOCode
                          where D.TypeCode = 2 and H.SOCode > 0 and D.ItemCode > 0 and D.Qty > 0
                      ) U
                      inner join (select max(SOCode) as SOCode, CommonSOCode from SalesOrderNew group by CommonSOCode) Latest
                          on Latest.CommonSOCode = U.CommonSOCode
                      where U.MatIssueDate >= @FromDate and U.MatIssueDate < @ToDatePlusOne
                        and (@BranchCodes = '' or U.BranchCode in (select data from StimesTech_Split(@BranchCodes, ',')))
                        and (@SOCode = 0 or Latest.SOCode = @SOCode)
                        and (@ItemCode = 0 or U.ItemCode = @ItemCode)
                      group by Latest.SOCode, U.ItemCode, U.UnitCode
                  ) Iss on Iss.SOCode = Req.SOCode and Iss.ItemCode = Req.ItemCode
                  left join SalesOrderNew S on S.SOCode = isnull(Req.SOCode, Iss.SOCode)
                  left join sopCustomerInfo C on C.CustomerCode = S.CustomerCode
                  left join SalesConsumableInfo IM on IM.ConsumableCode = isnull(Req.ItemCode, Iss.ItemCode)
                  left join ADMINUNITINFO U on U.UnitCode = isnull(Req.UnitCode, Iss.UnitCode)
                  where isnull(Req.RequestedQty, 0) > 0 or isnull(Iss.IssuedQty, 0) > 0
                  order by S.SONo, ItemName",
                Params(fromDate, toDate, soCode, branchCodes, itemCode));

        // TAE has no IssuedQty column - confirmed against usp_ResourceIssueReportList (desktop's
        // real "Resource Issue Report"): it just takes D.Qty directly wherever Qty > 0, with no
        // IssuedDate check at all (IssuedDate is set on almost no real rows, so gating on it was
        // the bug - it made Issued Qty read as ~0 for Tools & Equipment). It also unions in two
        // more sources besides productionMaterialIssueDtlTAE: productionMaterialIssueDtlTAEHire
        // (hired-in equipment) and purchaseResourceIssueDtlGeneral (TypeCode=3, the General/ad-hoc
        // issue grid) - same pattern applied to Material/Consumable above.
        public DataTable GetTAEReport(DateTime fromDate, DateTime toDate, int soCode, string branchCodes, int itemCode) =>
            _db.GetDataTableFromQuery(
                @"select isnull(Req.SOCode, Iss.SOCode) as SOCode,
                         S.SONo + ' - ' + isnull(C.CustomerName,'') as JobNo,
                         isnull(Req.ItemCode, Iss.ItemCode) as ItemCode,
                         isnull(IM.Description,'') + ' - ' + isnull(IM.AssetCode,'') as ItemName,
                         isnull(U.UnitDesc,'') as UnitName,
                         isnull(Req.RequestedQty, 0) as RequestedQty,
                         isnull(Iss.IssuedQty, 0) as IssuedQty,
                         isnull(Req.RequestedQty, 0) - isnull(Iss.IssuedQty, 0) as BalanceQty
                  from (
                      select Latest.SOCode, D.ToolsAndEquipmentCode as ItemCode, D.UnitCode, sum(D.Qty) as RequestedQty
                      from purchaseResourceReqnDtlTAE D
                      inner join purchaseResourceReqnHdr H on H.RReqnCode = D.RReqnCode
                      inner join SalesOrderNew Orig on Orig.SOCode = H.JobCode
                      inner join (select max(SOCode) as SOCode, CommonSOCode from SalesOrderNew group by CommonSOCode) Latest
                          on Latest.CommonSOCode = Orig.CommonSOCode
                      where H.JobCode > 0
                        and D.ToolsAndEquipmentCode > 0
                        and H.PReqnDate >= @FromDate and H.PReqnDate < @ToDatePlusOne
                        and (@BranchCodes = '' or H.BranchCode in (select data from StimesTech_Split(@BranchCodes, ',')))
                        and (@SOCode = 0 or Latest.SOCode = @SOCode)
                        and (@ItemCode = 0 or D.ToolsAndEquipmentCode = @ItemCode)
                      group by Latest.SOCode, D.ToolsAndEquipmentCode, D.UnitCode
                  ) Req
                  full outer join (
                      select Latest.SOCode, U.ItemCode, U.UnitCode, sum(U.Qty) as IssuedQty
                      from (
                          select H.SOCode, Orig.CommonSOCode, D.ToolsAndEquipmentCode as ItemCode, D.UnitCode, D.Qty, H.BranchCode, H.MatIssueDate
                          from productionMaterialIssueDtlTAE D
                          inner join productionMaterialIssueHdr H on H.MatIssueCode = D.MatIssueCode
                          inner join SalesOrderNew Orig on Orig.SOCode = H.SOCode
                          where H.SOCode > 0 and D.ToolsAndEquipmentCode > 0 and D.Qty > 0

                          union all

                          -- Hired-in equipment, tracked on its own detail table.
                          select H.SOCode, Orig.CommonSOCode, D.ToolsAndEquipmentCode as ItemCode, D.UnitCode, D.Qty, H.BranchCode, H.MatIssueDate
                          from productionMaterialIssueDtlTAEHire D
                          inner join productionMaterialIssueHdr H on H.MatIssueCode = D.MatIssueCode
                          inner join SalesOrderNew Orig on Orig.SOCode = H.SOCode
                          where H.SOCode > 0 and D.ToolsAndEquipmentCode > 0 and D.Qty > 0

                          union all

                          -- Same 'Material Issue' header, but issued through the General/ad-hoc
                          -- issue grid (purchaseResourceIssueDtlGeneral, TypeCode=3) rather than the
                          -- requisition-backed TAE grid - usp_ResourceIssueReportList unions all three.
                          select H.SOCode, Orig.CommonSOCode, D.ItemCode, D.UnitCode, D.Qty, H.BranchCode, H.MatIssueDate
                          from purchaseResourceIssueDtlGeneral D
                          inner join productionMaterialIssueHdr H on H.MatIssueCode = D.MatIssueCode
                          inner join SalesOrderNew Orig on Orig.SOCode = H.SOCode
                          where D.TypeCode = 3 and H.SOCode > 0 and D.ItemCode > 0 and D.Qty > 0
                      ) U
                      inner join (select max(SOCode) as SOCode, CommonSOCode from SalesOrderNew group by CommonSOCode) Latest
                          on Latest.CommonSOCode = U.CommonSOCode
                      where U.MatIssueDate >= @FromDate and U.MatIssueDate < @ToDatePlusOne
                        and (@BranchCodes = '' or U.BranchCode in (select data from StimesTech_Split(@BranchCodes, ',')))
                        and (@SOCode = 0 or Latest.SOCode = @SOCode)
                        and (@ItemCode = 0 or U.ItemCode = @ItemCode)
                      group by Latest.SOCode, U.ItemCode, U.UnitCode
                  ) Iss on Iss.SOCode = Req.SOCode and Iss.ItemCode = Req.ItemCode
                  left join SalesOrderNew S on S.SOCode = isnull(Req.SOCode, Iss.SOCode)
                  left join sopCustomerInfo C on C.CustomerCode = S.CustomerCode
                  left join SalesToolsAndEquipmentinfo IM on IM.ToolsAndEquipmentCode = isnull(Req.ItemCode, Iss.ItemCode)
                  left join ADMINUNITINFO U on U.UnitCode = isnull(Req.UnitCode, Iss.UnitCode)
                  where isnull(Req.RequestedQty, 0) > 0 or isnull(Iss.IssuedQty, 0) > 0
                  order by S.SONo, ItemName",
                Params(fromDate, toDate, soCode, branchCodes, itemCode));

        // Unrestricted by branch on purpose - this report's own Branch filter is a separate,
        // independent multi-select, not something the Sales Order picker should be pre-narrowed by
        // (a job can easily have requisitions/issues raised from a different branch than the job).
        public DataTable GetSalesOrdersForFilter() => _db.GetDataTableFromQuery(
            @"select S.SOCode, S.SONo + isnull(' - ' + C.CustomerName, '') as SONo
              from SalesOrderNew S
              inner join (select max(SOCode) as SOCode, CommonSOCode from SalesOrderNew group by CommonSOCode) Latest
                  on Latest.SOCode = S.SOCode
              left join sopCustomerInfo C on C.CustomerCode = S.CustomerCode
              order by S.SONo");

        // ---------- Item pickers (scoped per type, same source tables Store Indent's own
        // General-grid item lookup uses) ----------
        public DataTable GetMaterialItems() => _db.GetDataTableFromQuery(
            "select ItemCode, isnull(Description,'')+'-'+Convert(varchar,isnull(ItemItemCode,'')) as Description from AdminItemInfo order by Description");

        public DataTable GetConsumableItems() => _db.GetDataTableFromQuery(
            "select ConsumableCode as ItemCode, Description+'-'+Convert(varchar,isnull(ConsumableItemCode,'')) as Description from SalesConsumableInfo order by Description");

        public DataTable GetTAEItems() => _db.GetDataTableFromQuery(
            "select ToolsAndEquipmentCode as ItemCode, Description+' - '+isnull(AssetCode,'') as Description from SalesToolsAndEquipmentinfo order by Description");

        private static SqlParameter[] Params(DateTime fromDate, DateTime toDate, int soCode, string branchCodes, int itemCode) => new[]
        {
            SqlHelper.Param("@FromDate", SqlDbType.Date, fromDate.Date),
            SqlHelper.Param("@ToDatePlusOne", SqlDbType.Date, toDate.Date.AddDays(1)),
            SqlHelper.Param("@SOCode", SqlDbType.Int, soCode),
            SqlHelper.Param("@BranchCodes", SqlDbType.VarChar, branchCodes ?? "", 4000),
            SqlHelper.Param("@ItemCode", SqlDbType.Int, itemCode)
        };
    }
}
