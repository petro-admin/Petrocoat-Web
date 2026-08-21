using System.Data;
using System.Security.Cryptography;
using Microsoft.Data.SqlClient;
using StimesErp.Api.Data;

namespace StimesErp.Api.Services
{
    public class AuthResult
    {
        public bool Success { get; set; }
        public string? ErrorMessage { get; set; }
        public bool MaintenanceMode { get; set; }
        public int UserCode { get; set; }
        public string UserName { get; set; } = string.Empty;
        public int UCatCode { get; set; }
    }

    public class AuthService
    {
        private readonly SqlHelper _db;

        public AuthService(SqlHelper db)
        {
            _db = db;
        }

        public AuthResult Login(string username, string plainPassword)
        {
            // --- 1. Maintenance-mode check (same query Login.xaml.cs runs) ---
            var dtControl = _db.GetDataTableFromQuery("SELECT IsMaintenance, Message FROM ERP_SystemControl WHERE Id=1");
            if (dtControl.Rows.Count > 0 && Convert.ToBoolean(dtControl.Rows[0]["IsMaintenance"]))
            {
                return new AuthResult
                {
                    Success = false,
                    MaintenanceMode = true,
                    ErrorMessage = dtControl.Rows[0]["Message"]?.ToString()
                };
            }

            // --- 2. Authenticate ---
            string encryptedPassword = ZCrypto.EncryptData(plainPassword);

            var parameters = new[]
            {
                 SqlHelper.Param("@tcUserID", SqlDbType.VarChar, username, 500),
                SqlHelper.Param("@tcPassword", SqlDbType.VarChar, encryptedPassword, 500)
            };

            // TODO: confirm the real SP name (likely usp_AuthenticateUser or similar) from Stimes.Erp.Library.
            DataTable dtAuth = _db.GetDataTableFromProcedure("usp_GetAuthenticatedUser", parameters);

            if (dtAuth.Rows.Count == 0)
            {
                return new AuthResult { Success = false, ErrorMessage = "Invalid Username or Password" };
            }

            int userCode = Convert.ToInt32(dtAuth.Rows[0]["UserCode"]);
            int uCatCode = dtAuth.Rows[0]["UCatCode"] != DBNull.Value ? Convert.ToInt32(dtAuth.Rows[0]["UCatCode"]) : 0;

            // --- 3. Track login session (same usp_TrackLoginUsers the desktop app calls) ---
            var trackParams = new[]
            {
                SqlHelper.Param("@UserCode", SqlDbType.Int, userCode),
                SqlHelper.Param("@UserName", SqlDbType.VarChar, username, 100),
                SqlHelper.Param("@PCName", SqlDbType.VarChar, "WEB", 100),
                SqlHelper.Param("@IP", SqlDbType.VarChar, "0.0.0.0", 50)
            };
            _db.DataTransactionsByProcedure("usp_TrackLoginUsers", trackParams);

            return new AuthResult { Success = true, UserCode = userCode, UserName = username, UCatCode = uCatCode };
        }
    }

    /// <summary>
    /// Ported from Stimes.Erp.Library.ClsZCrypto — same TripleDES(ECB)/MD5-derived-key scheme
    /// the desktop app uses, so passwords encrypted here match rows already in the DB.
    /// </summary>
    public static class ZCrypto
    {
        private const string EnKey = "@ARA";

        public static string EncryptData(string plainText)
        {
            var utf8 = new System.Text.UTF8Encoding();
            byte[] tdesKey = MD5.HashData(utf8.GetBytes(EnKey));

            using var tdes = TripleDES.Create();
            tdes.Key = tdesKey;
            tdes.Mode = CipherMode.ECB;
            tdes.Padding = PaddingMode.PKCS7;

            byte[] dataToEncrypt = utf8.GetBytes(plainText);
            using ICryptoTransform encryptor = tdes.CreateEncryptor();
            byte[] result = encryptor.TransformFinalBlock(dataToEncrypt, 0, dataToEncrypt.Length);

            return Convert.ToBase64String(result);
        }

        public static string DecryptData(string cipherText)
        {
            var utf8 = new System.Text.UTF8Encoding();
            byte[] tdesKey = MD5.HashData(utf8.GetBytes(EnKey));

            using var tdes = TripleDES.Create();
            tdes.Key = tdesKey;
            tdes.Mode = CipherMode.ECB;
            tdes.Padding = PaddingMode.PKCS7;

            byte[] dataToDecrypt = Convert.FromBase64String(cipherText);
            using ICryptoTransform decryptor = tdes.CreateDecryptor();
            byte[] result = decryptor.TransformFinalBlock(dataToDecrypt, 0, dataToDecrypt.Length);

            return utf8.GetString(result);
        }
    }
}