-- New, web-only audit table. Completely independent of the legacy desktop adminUserAudit
-- table (which has the UserCode/FormCode data-quality bug described separately) - this one
-- is written exclusively by the web backend itself, which always has the real authenticated
-- user and the real action being performed, so every row here is guaranteed correct.
--
-- UserName and ModuleName are stored as plain snapshot text (not foreign-key codes looked up
-- later) so a later username change or module rename never breaks old history, and so there
-- is no FormCode-resolution step that can silently fail the way the desktop's did.
CREATE TABLE WebUserAudit (
    GenCode        INT IDENTITY(1,1) PRIMARY KEY,
    AuditDate      DATETIME NOT NULL DEFAULT GETDATE(),
    UserCode       INT NOT NULL,
    UserName       VARCHAR(100) NOT NULL,
    Action         VARCHAR(1) NOT NULL,   -- 'A' = Added, 'E' = Edited, 'D' = Deleted
    ModuleName     VARCHAR(100) NOT NULL, -- e.g. 'Store Indent', 'Daily Site', 'User Rights'
    Narration      VARCHAR(MAX) NULL,
    BranchCode     INT NULL
);

CREATE INDEX IX_WebUserAudit_AuditDate ON WebUserAudit (AuditDate DESC);
CREATE INDEX IX_WebUserAudit_BranchCode ON WebUserAudit (BranchCode);
