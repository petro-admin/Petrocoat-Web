namespace StimesErp.Api.Models
{
    // Web-only report (no desktop equivalent) - Requested/Issued/Balance qty per Sales Order + item,
    // aggregated across every Store Indent document that touched that job/item in the date range.
    public class ResourceReportRow
    {
        public int SOCode { get; set; }
        public string JobNo { get; set; } = "";
        public int ItemCode { get; set; }
        public string ItemName { get; set; } = "";
        public string UnitName { get; set; } = "";
        public decimal RequestedQty { get; set; }
        public decimal IssuedQty { get; set; }
        public decimal BalanceQty { get; set; }
    }
}
