-- New, web-only table storing registered fingerprint/Face ID (WebAuthn/FIDO2) credentials.
-- One row per device a user has enrolled. The private key never leaves that device - only
-- its public key and a credential ID are stored here, so this table being read even in a
-- full breach gives an attacker nothing usable to log in with.
-- UserName/UCatCode/EmpCode are snapshotted at enrollment time (from the user's live JWT
-- session) so fingerprint login can issue a session without a second lookup back to the
-- user master tables.
CREATE TABLE WebAuthnCredential (
    Id               INT IDENTITY(1,1) PRIMARY KEY,
    UserCode         INT NOT NULL,
    UserName         VARCHAR(100) NOT NULL,
    UCatCode         INT NOT NULL,
    EmpCode          INT NOT NULL,
    CredentialId     VARBINARY(MAX) NOT NULL,
    PublicKey        VARBINARY(MAX) NOT NULL,
    UserHandle       VARBINARY(MAX) NOT NULL,
    SignatureCounter BIGINT NOT NULL DEFAULT 0,
    DeviceLabel      NVARCHAR(200) NOT NULL,
    CreatedAt        DATETIME NOT NULL DEFAULT GETDATE(),
    LastUsedAt       DATETIME NULL
);

CREATE INDEX IX_WebAuthnCredential_UserCode ON WebAuthnCredential (UserCode);
