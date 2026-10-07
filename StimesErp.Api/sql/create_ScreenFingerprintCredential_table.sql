-- Software-only "screen touch" login for tablets with no real fingerprint/Face ID sensor.
-- There is no biometric data here at all - DeviceTokenHash is a hashed random secret the
-- browser stores locally on one specific device; tapping the on-screen fingerprint icon sends
-- it back, and a match logs that device in as whichever user it was attached to. This is
-- intentionally admin-driven (see AttachedByUserCode) rather than self-service: an admin picks
-- a user from a list and attaches THIS device to THEM, mirroring how the existing Attendance
-- face-enrollment screen works (an admin/supervisor enrolls an employee, not self-service).
-- Security note (communicated to the user): unlike real WebAuthn, this table's rows intentionally
-- have no cryptographic hardware binding behind them - physical possession of the enrolled
-- device is the only thing standing between anyone and logging in as that user. Only appropriate
-- for a dedicated, physically-controlled device.
CREATE TABLE ScreenFingerprintCredential (
    Id                 INT IDENTITY(1,1) PRIMARY KEY,
    UserCode           INT NOT NULL,
    UserName           VARCHAR(100) NOT NULL,
    UCatCode           INT NOT NULL,
    EmpCode            INT NOT NULL,
    DeviceTokenHash    VARBINARY(32) NOT NULL,
    DeviceLabel        NVARCHAR(200) NOT NULL,
    AttachedByUserCode INT NOT NULL,
    CreatedAt          DATETIME NOT NULL DEFAULT GETDATE(),
    LastUsedAt         DATETIME NULL
);

CREATE UNIQUE INDEX IX_ScreenFingerprintCredential_TokenHash ON ScreenFingerprintCredential (DeviceTokenHash);
CREATE INDEX IX_ScreenFingerprintCredential_UserCode ON ScreenFingerprintCredential (UserCode);
