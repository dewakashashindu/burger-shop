-- The table behind the six-digit codes (Tbl_WebOtp, "option B").
-- Run once against the restaurant database before the first sign-in:
--   sqlcmd -S <server> -d <database> -i scripts/otp-setup.sql
-- Nothing here is reversible: the code is stored as a salted hash, and a row is
-- DELETED the moment it is used (or expires, or is replaced by a newer code).

IF OBJECT_ID(N'dbo.Tbl_WebOtp', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.Tbl_WebOtp (
    Id         bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_Tbl_WebOtp PRIMARY KEY,
    Phone      varchar(20)   NOT NULL,           -- last nine digits, e.g. 772336233
    Purpose    varchar(16)   NOT NULL CONSTRAINT DF_Tbl_WebOtp_Purpose DEFAULT ('signin'),
    CodeHash   varchar(64)   NOT NULL,           -- sha256(salt + ':' + code), hex
    Salt       varchar(32)   NOT NULL,
    Attempts   int           NOT NULL CONSTRAINT DF_Tbl_WebOtp_Attempts DEFAULT (0),
    ExpiresAt  datetime2(0)  NOT NULL,           -- five minutes after sending
    CreatedAt  datetime2(0)  NOT NULL CONSTRAINT DF_Tbl_WebOtp_CreatedAt DEFAULT (sysutcdatetime())
  );

  CREATE INDEX IX_Tbl_WebOtp_Phone ON dbo.Tbl_WebOtp (Phone, Purpose, CreatedAt DESC);
END
GO

-- Rows written by an earlier build carried a ConsumedAt flag; sweep them.
IF COL_LENGTH('dbo.Tbl_WebOtp', 'ConsumedAt') IS NOT NULL
  DELETE FROM dbo.Tbl_WebOtp WHERE ConsumedAt IS NOT NULL OR ExpiresAt < GETDATE();
GO
