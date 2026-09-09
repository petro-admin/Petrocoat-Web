using System.Data;
using Microsoft.Data.SqlClient;

namespace StimesErp.Api.Data
{
    /// <summary>
    /// Thin wrapper around ADO.NET that mirrors the desktop app's
    /// DBAccessHelper (GetDataTableFromProcedure / DataTransactionsByProcedure).
    /// Every existing stored procedure works unchanged through this class.
    /// </summary>
    public class SqlHelper
    {
        private readonly string _connectionString;

        public SqlHelper(IConfiguration config)
        {
            _connectionString = config.GetConnectionString("ErpDb")
                ?? throw new InvalidOperationException("ConnectionStrings:ErpDb is missing in appsettings.json");
        }

        /// <summary>Executes a stored procedure that returns a result set (SELECT) and returns it as a DataTable.</summary>
        public DataTable GetDataTableFromProcedure(string spName, SqlParameter[]? parameters = null)
        {
            using var conn = new SqlConnection(_connectionString);
            using var cmd = new SqlCommand(spName, conn) { CommandType = CommandType.StoredProcedure, CommandTimeout = 120 };
            if (parameters != null) cmd.Parameters.AddRange(parameters);

            var dt = new DataTable();
            conn.Open();
            using var reader = cmd.ExecuteReader();
            dt.Load(reader);
            return dt;
        }

        /// <summary>Executes a stored procedure that returns multiple result sets and returns a DataSet.</summary>
        public DataSet GetDataSetFromProcedure(string spName, SqlParameter[]? parameters = null)
        {
            using var conn = new SqlConnection(_connectionString);
            using var cmd = new SqlCommand(spName, conn) { CommandType = CommandType.StoredProcedure, CommandTimeout = 120 };
            if (parameters != null) cmd.Parameters.AddRange(parameters);

            using var adapter = new SqlDataAdapter(cmd);
            var ds = new DataSet();
            adapter.Fill(ds);
            return ds;
        }

        /// <summary>
        /// Executes a stored procedure that performs an INSERT/UPDATE/DELETE (save, lock, approve, etc.)
        /// and returns whatever it outputs (many of your SPs SELECT back a result code / new DocNo).
        /// </summary>
        public string DataTransactionsByProcedure(string spName, SqlParameter[]? parameters = null)
        {
            using var conn = new SqlConnection(_connectionString);
            using var cmd = new SqlCommand(spName, conn) { CommandType = CommandType.StoredProcedure, CommandTimeout = 120 };
            if (parameters != null) cmd.Parameters.AddRange(parameters);

            conn.Open();
            var result = cmd.ExecuteScalar();
            return result?.ToString() ?? string.Empty;
        }

        /// <summary>Equivalent of DBAccessHelper.GetDataTableFromQuery - used only for the couple of
        /// places the desktop app runs a plain SELECT instead of a stored procedure (e.g. system-control flag).</summary>
        public DataTable GetDataTableFromQuery(string sql, SqlParameter[]? parameters = null)
        {
            using var conn = new SqlConnection(_connectionString);
            using var cmd = new SqlCommand(sql, conn) { CommandType = CommandType.Text };
            if (parameters != null) cmd.Parameters.AddRange(parameters);
            var dt = new DataTable();
            conn.Open();
            using var reader = cmd.ExecuteReader();
            dt.Load(reader);
            return dt;
        }

        public static SqlParameter Param(string name, SqlDbType type, object? value, int size = 0)
        {
            var p = new SqlParameter(name, type);
            if (size > 0) p.Size = size;
            p.Value = value ?? DBNull.Value;
            return p;
        }

        /// <summary>Table-valued parameter, equivalent to DBAccessHelper.SetTableValuedParameter used for
        /// dtScopeOfWork / dtMaterial / dtConsumablesAndMachineries etc.
        /// `table` must be a real DataTable (possibly zero rows) whose columns match the target UDT's
        /// actual schema exactly - unlike the desktop app's older System.Data.SqlClient, this driver
        /// (Microsoft.Data.SqlClient) throws "Table-valued parameters cannot be DBNull" if null/DBNull
        /// is passed, and separately validates column count/order against the UDT even for zero rows.
        /// So where desktop passes a literal `null` for an unused table param, pass an empty DataTable
        /// built with that UDT's real columns instead (check via sys.table_types if unsure).</summary>
        public static SqlParameter TableParam(string name, string udtTypeName, DataTable table)
        {
            return new SqlParameter(name, SqlDbType.Structured)
            {
                TypeName = udtTypeName,
                Value = table
            };
        }
    }
}
