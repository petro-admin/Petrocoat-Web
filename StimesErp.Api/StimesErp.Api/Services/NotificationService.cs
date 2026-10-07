using System.Data;
using StimesErp.Api.Data;

namespace StimesErp.Api.Services
{
    // Delivery side of the notification system (see NotificationSettingsService for the admin
    // configuration side). Raise() is the one entry point any form's own Save()/Delete()/approval
    // flow calls after a real event happens - it looks up who (if anyone) is configured to be
    // notified for that FormClassName+event in NotificationSettingsHdr/User, and writes one
    // Notification row per recipient. A form with no settings row, or whose matching event
    // checkbox is off, raises nothing - silent no-op, not an error, since most forms will never
    // have notification settings configured.
    public class NotificationService
    {
        private readonly SqlHelper _db;

        public NotificationService(SqlHelper db)
        {
            _db = db;
        }

        // eventType: "CREATE" | "UPDATE" | "DELETE" | "APPROVE" | "DENY" - matches the On*
        // columns on NotificationSettingsHdr (OnCreate/OnUpdate/...).
        public void Raise(string formClassName, string eventType, string? refNo, string message, int actorUserCode)
        {
            var eventColumn = eventType.ToUpperInvariant() switch
            {
                "CREATE" => "OnCreate",
                "UPDATE" => "OnUpdate",
                "DELETE" => "OnDelete",
                "APPROVE" => "OnApprove",
                "DENY" => "OnDeny",
                _ => throw new ArgumentException($"Unknown notification event type '{eventType}'.", nameof(eventType))
            };

            var hdr = _db.GetDataTableFromQuery(
                $@"select H.Code, H.FormName
                   from NotificationSettingsHdr H
                   where H.FormClassName = @FormClassName and H.Active = 'Y' and H.{eventColumn} = 1",
                new[] { SqlHelper.Param("@FormClassName", SqlDbType.VarChar, formClassName, 500) });

            if (hdr.Rows.Count == 0) return;

            var hdrCode = Convert.ToInt32(hdr.Rows[0]["Code"]);
            var formName = hdr.Rows[0]["FormName"]?.ToString() ?? "";

            var actorName = "";
            if (actorUserCode > 0)
            {
                var actorDt = _db.GetDataTableFromQuery(
                    "select UserName from AdminUserMaster where UserCode = @UserCode",
                    new[] { SqlHelper.Param("@UserCode", SqlDbType.Int, actorUserCode) });
                if (actorDt.Rows.Count > 0) actorName = actorDt.Rows[0]["UserName"]?.ToString() ?? "";
            }

            // Recipients configured for this form, minus whoever just performed the action
            // themselves - notifying someone about their own Create/Update is just noise.
            var recipients = _db.GetDataTableFromQuery(
                "select UserCode from NotificationSettingsUser where HdrCode = @HdrCode and UserCode <> @ActorUserCode",
                new[]
                {
                    SqlHelper.Param("@HdrCode", SqlDbType.Int, hdrCode),
                    SqlHelper.Param("@ActorUserCode", SqlDbType.Int, actorUserCode)
                });

            foreach (DataRow row in recipients.Rows)
            {
                _db.ExecuteNonQuery(
                    @"insert into Notification
                        (FormClassName, FormName, EventType, RefNo, Message, RecipientUserCode, ActorUserCode, ActorName)
                      values
                        (@FormClassName, @FormName, @EventType, @RefNo, @Message, @RecipientUserCode, @ActorUserCode, @ActorName)",
                    new[]
                    {
                        SqlHelper.Param("@FormClassName", SqlDbType.VarChar, formClassName, 500),
                        SqlHelper.Param("@FormName", SqlDbType.VarChar, formName, 100),
                        SqlHelper.Param("@EventType", SqlDbType.VarChar, eventType.ToUpperInvariant(), 20),
                        SqlHelper.Param("@RefNo", SqlDbType.VarChar, refNo ?? "", 50),
                        SqlHelper.Param("@Message", SqlDbType.VarChar, message, 500),
                        SqlHelper.Param("@RecipientUserCode", SqlDbType.Int, Convert.ToInt32(row["UserCode"])),
                        SqlHelper.Param("@ActorUserCode", SqlDbType.Int, actorUserCode),
                        SqlHelper.Param("@ActorName", SqlDbType.VarChar, actorName, 100)
                    });
            }
        }

        public DataTable GetMine(int userCode, bool unreadOnly) => _db.GetDataTableFromQuery(
            $@"select top 100 Code, FormClassName, FormName, EventType, RefNo, Message, ActorName, IsRead, CreatedDate
               from Notification
               where RecipientUserCode = @UserCode {(unreadOnly ? "and IsRead = 0" : "")}
               order by CreatedDate desc",
            new[] { SqlHelper.Param("@UserCode", SqlDbType.Int, userCode) });

        public int GetUnreadCount(int userCode)
        {
            var dt = _db.GetDataTableFromQuery(
                "select count(*) as Cnt from Notification where RecipientUserCode = @UserCode and IsRead = 0",
                new[] { SqlHelper.Param("@UserCode", SqlDbType.Int, userCode) });
            return dt.Rows.Count > 0 ? Convert.ToInt32(dt.Rows[0]["Cnt"]) : 0;
        }

        public void MarkRead(int code, int userCode) => _db.ExecuteNonQuery(
            "update Notification set IsRead = 1, ReadDate = GETDATE() where Code = @Code and RecipientUserCode = @UserCode",
            new[] { SqlHelper.Param("@Code", SqlDbType.Int, code), SqlHelper.Param("@UserCode", SqlDbType.Int, userCode) });

        public void MarkAllRead(int userCode) => _db.ExecuteNonQuery(
            "update Notification set IsRead = 1, ReadDate = GETDATE() where RecipientUserCode = @UserCode and IsRead = 0",
            new[] { SqlHelper.Param("@UserCode", SqlDbType.Int, userCode) });
    }
}
