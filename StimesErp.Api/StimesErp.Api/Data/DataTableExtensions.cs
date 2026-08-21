using System.Data;

namespace StimesErp.Api.Data
{
    /// <summary>
    /// System.Text.Json cannot serialize a raw DataTable — each DataRow holds a back-reference
    /// to its parent DataTable, which triggers a circular-reference exception (500 error, empty
    /// body) as soon as you `return Ok(dataTable)`. Convert to plain dictionaries first instead.
    /// </summary>
    public static class DataTableExtensions
    {
        public static List<Dictionary<string, object?>> ToJsonRows(this DataTable table)
        {
            var rows = new List<Dictionary<string, object?>>(table.Rows.Count);

            foreach (DataRow row in table.Rows)
            {
                var dict = new Dictionary<string, object?>(table.Columns.Count);
                foreach (DataColumn col in table.Columns)
                {
                    object value = row[col];
                    dict[col.ColumnName] = value == DBNull.Value ? null : value;
                }
                rows.Add(dict);
            }

            return rows;
        }
    }
}
