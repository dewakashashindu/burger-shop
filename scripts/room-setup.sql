-- The stay book. This is the only table a room booking needs.
--
-- Run once against the restaurant database (or use `npm run db:room`, which is
-- this file plus a report):
--   sqlcmd -S <server> -d <database> -i scripts/room-setup.sql
--
-- Nothing is deleted and no counter is touched: the table is only created when
-- it is missing, so the file can be run again safely.
--
-- Two things deliberately live in code, not here:
--   • how many of each room the house has — lib/room-inventory.ts (sample
--     figures for now; the desk can change them there, or read the same shape
--     from a table of their own later)
--   • the booking number — dbo.Tbl_TxnNumbers, row LoCCode 01 / TxnType RV,
--     the very row the table reservations draw from. Nothing to create.

IF OBJECT_ID(N'dbo.Tbl_RoomReservation', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.Tbl_RoomReservation
  (
      ResID           char(10)     NOT NULL,   -- booking number, from Tbl_TxnNumbers (RV)
      RoomCode        varchar(20)  NOT NULL,   -- garden / twin / courtyard / family
      RoomName        varchar(80)  NOT NULL,
      LocCode         char(10)     NOT NULL,

      CheckIn         date         NOT NULL,   -- first night
      CheckOut        date         NOT NULL,   -- the morning of leaving
      Nights          int          NOT NULL,
      Adults          int          NOT NULL CONSTRAINT DF_Tbl_RoomReservation_Adults DEFAULT (1),
      Children        int          NOT NULL CONSTRAINT DF_Tbl_RoomReservation_Children DEFAULT (0),
      Pax             int          NOT NULL,

      GuestName       varchar(120) NOT NULL,
      GuestPhone      varchar(20)  NOT NULL,
      GuestEmail      varchar(120) NULL,
      GuestIdNo       varchar(30)  NULL,       -- NIC or passport
      Country         varchar(60)  NULL,

      PackageCode     varchar(20)  NULL,       -- breakfast / half / full
      Currency        char(3)      NOT NULL,   -- LKR | USD
      NightlyRate     float        NOT NULL,   -- room + board, per night
      TotalAmount     float        NOT NULL,   -- NightlyRate * Nights

      ArrivalTime     varchar(5)   NULL,       -- 'HH:mm', the guest's own estimate
      DepartureTime   varchar(5)   NULL,
      ArrivalBy       varchar(40)  NULL,
      Requests        varchar(800) NULL,

      CusCode         char(10)     NULL,
      ReservedBy      varchar(20)  NOT NULL CONSTRAINT DF_Tbl_RoomReservation_By DEFAULT ('WEB'),
      ReservedDate    datetime     NOT NULL CONSTRAINT DF_Tbl_RoomReservation_Date DEFAULT (GETDATE()),

      Status          varchar(20)  NOT NULL CONSTRAINT DF_Tbl_RoomReservation_Status DEFAULT ('BOOKED'),
      Cancel          bit          NOT NULL CONSTRAINT DF_Tbl_RoomReservation_Cancel DEFAULT (0),
      CancelledRmks   varchar(300) NULL,
      CancelledUser   varchar(30)  NULL,
      CancelledDateTime datetime   NULL,

      CONSTRAINT PK_Tbl_RoomReservation PRIMARY KEY CLUSTERED (ResID, RoomCode)
  );

  -- The query availability runs on every date change: these nights, this room.
  CREATE INDEX IX_Tbl_RoomReservation_Stay
      ON dbo.Tbl_RoomReservation (RoomCode, CheckIn, CheckOut, Cancel)
      INCLUDE (ResID, Nights);

  -- "What has this guest booked before?" for the desk.
  CREATE INDEX IX_Tbl_RoomReservation_Guest
      ON dbo.Tbl_RoomReservation (GuestPhone, CheckIn DESC);
END
GO
