import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { getPool, isDbConfigured } from "./db";
import { lastNine } from "./phone";

/** The request shape the rest of the project uses (two-argument `input`). */
type SqlReq = {
  input(name: string, value: unknown): SqlReq;
  query<T>(statement: string): Promise<{ recordset?: T[]; rowsAffected?: number[] }>;
};
type SqlPool = { request(): SqlReq };
const poolOf = async () => (await getPool()) as unknown as SqlPool;

/**
 * The six-digit codes, in dbo.Tbl_WebOtp.
 *
 * A code lives for five minutes and is **deleted the moment it is spent** —
 * verified, expired, tried five times, or replaced by a newer one. Nothing is
 * kept once the process is over: the table holds only the codes that are still
 * waiting to be used, each as a salted sha256, never in readable form.
 *
 * Two purposes share the table: `signup` (proving a number before an account
 * exists) and `signin` (the usual phone → code). A code made for one is not
 * accepted by the other.
 */

export const OTP_TABLE = process.env.OTP_TABLE?.trim() || "dbo.Tbl_WebOtp";
export const OTP_TTL_SECONDS = Number(process.env.OTP_TTL_SECONDS || 300);
export const OTP_RESEND_SECONDS = Number(process.env.OTP_RESEND_SECONDS || 60);
export const OTP_MAX_ATTEMPTS = Number(process.env.OTP_MAX_ATTEMPTS || 5);

export type Purpose = "signin" | "signup";
export const purposeOf = (value: unknown): Purpose => (value === "signup" ? "signup" : "signin");

const NOW = () => new Date();
const hash = (salt: string, code: string) => createHash("sha256").update(`${salt}:${code}`).digest("hex");

export function newCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export function newSalt(): string {
  return randomBytes(12).toString("hex");
}

export function codeMatches(stored: string, salt: string, code: string): boolean {
  const a = Buffer.from(stored, "utf8");
  const b = Buffer.from(hash(salt, code), "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export const usesDevStore = () => process.env.WEB_AUTH_DEV === "1" && !isDbConfigured();

type MemoryRow = {
  Id: number;
  Phone: string;
  Purpose: Purpose;
  CodeHash: string;
  Salt: string;
  Attempts: number;
  created: number;
  expires: number;
};

const memory = globalThis as typeof globalThis & { __milaOtpRows?: MemoryRow[]; __milaOtpId?: number };
const rows = () => (memory.__milaOtpRows ??= []);
const nextId = () => (memory.__milaOtpId = (memory.__milaOtpId ?? 0) + 1);

/** Drops every code — used by the suites, and after a walkthrough. */
export function resetDevOtps() {
  rows().length = 0;
}

/** How many codes are waiting for this number (dev store only, for tests). */
export function devCodesFor(phone: unknown) {
  const nine = lastNine(phone);
  return rows().filter((row) => row.Phone === nine);
}

const dropExpired = () => {
  const now = NOW().getTime();
  const keep = rows().filter((row) => row.expires > now);
  rows().length = 0;
  rows().push(...keep);
};

/**
 * Removes every code for a number — the whole record of the attempt.
 *
 * Used when a text could not be sent, and after an account is made: no row is
 * left behind for a number that has finished its business.
 */
export async function clearOtps(phone: unknown): Promise<void> {
  const nine = lastNine(phone);
  if (!nine) return;

  if (usesDevStore()) {
    const rest = rows().filter((row) => row.Phone !== nine);
    rows().length = 0;
    rows().push(...rest);
    return;
  }

  try {
    const pool = await poolOf();
    await pool.request().input("phone", nine).query(`DELETE FROM ${OTP_TABLE} WHERE Phone = @phone`);
  } catch (error) {
    console.error("[otp] could not clear the codes:", error instanceof Error ? error.message : error);
  }
}

export type StartResult =
  | { ok: true; code: string; expiresIn: number }
  | { ok: false; reason: "cooldown"; retryIn: number }
  | { ok: false; reason: "database"; message: string };

/** A fresh code for this number; whatever was there before is deleted. */
export async function startOtp(phone: unknown, purpose: Purpose = "signin"): Promise<StartResult> {
  const nine = lastNine(phone);
  const code = newCode();
  const salt = newSalt();
  const expiresAt = new Date(NOW().getTime() + OTP_TTL_SECONDS * 1000);

  if (usesDevStore()) {
    dropExpired();
    const recent = rows()
      .filter((row) => row.Phone === nine)
      .sort((a, b) => b.created - a.created)[0];
    if (recent && NOW().getTime() - recent.created < OTP_RESEND_SECONDS * 1000) {
      return {
        ok: false,
        reason: "cooldown",
        retryIn: Math.ceil((OTP_RESEND_SECONDS * 1000 - (NOW().getTime() - recent.created)) / 1000),
      };
    }
    // One live code per number: the older one is deleted, not retired.
    const rest = rows().filter((row) => row.Phone !== nine);
    rows().length = 0;
    rows().push(...rest, {
      Id: nextId(),
      Phone: nine,
      Purpose: purpose,
      CodeHash: hash(salt, code),
      Salt: salt,
      Attempts: 0,
      created: NOW().getTime(),
      expires: expiresAt.getTime(),
    });
    return { ok: true, code, expiresIn: OTP_TTL_SECONDS };
  }

  try {
    const pool = await poolOf();

    const recent = await pool
      .request()
      .input("phone", nine)
      .query<{ seconds: number }>(
        `SELECT TOP 1 DATEDIFF(SECOND, CreatedAt, sysutcdatetime()) AS seconds
           FROM ${OTP_TABLE}
          WHERE Phone = @phone
          ORDER BY Id DESC`,
      );
    const seconds = Number(recent.recordset?.[0]?.seconds ?? OTP_RESEND_SECONDS + 1);
    if (Number.isFinite(seconds) && seconds >= 0 && seconds < OTP_RESEND_SECONDS) {
      return { ok: false, reason: "cooldown", retryIn: OTP_RESEND_SECONDS - seconds };
    }

    const request = pool.request();
    request.input("phone", nine);
    request.input("purpose", purpose);
    request.input("hash", hash(salt, code));
    request.input("salt", salt);
    await request.query(
      // Sweep anything finished, drop this number's older code, then write the new one.
      `DELETE FROM ${OTP_TABLE} WHERE ExpiresAt < sysutcdatetime() OR Phone = @phone;

       INSERT INTO ${OTP_TABLE} (Phone, Purpose, CodeHash, Salt, Attempts, ExpiresAt, CreatedAt)
       VALUES (@phone, @purpose, @hash, @salt, 0, DATEADD(SECOND, ${OTP_TTL_SECONDS}, sysutcdatetime()), sysutcdatetime());`,
    );
    return { ok: true, code, expiresIn: OTP_TTL_SECONDS };
  } catch (error) {
    console.error("[otp] could not start:", (error as Error)?.message);
    return { ok: false, reason: "database", message: "We couldn’t send a code just now. Please try again." };
  }
}

export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: "expired" | "used" | "wrong" | "none" | "database"; message: string };

/**
 * Checks the live code for this number and deletes it as it is spent.
 *
 * Every exit removes the row: a correct code, an expired one, and the fifth
 * wrong try. So "process finished" always means "nothing is left in the table".
 */
export async function verifyOtp(phone: unknown, code: string, purpose: Purpose = "signin"): Promise<VerifyResult> {
  const nine = lastNine(phone);
  const typed = String(code ?? "").replace(/\D/g, "");
  if (typed.length !== 6) return { ok: false, reason: "wrong", message: "Enter all six digits." };

  if (usesDevStore()) {
    const row = rows()
      .filter((item) => item.Phone === nine && item.Purpose === purpose)
      .sort((a, b) => b.Id - a.Id)[0];
    if (!row) return { ok: false, reason: "none", message: "Ask for a code first." };

    const drop = () => {
      const at = rows().indexOf(row);
      if (at !== -1) rows().splice(at, 1);
    };

    if (row.expires < NOW().getTime()) {
      drop();
      return { ok: false, reason: "expired", message: "That code has expired. Ask for a new one." };
    }
    if (row.Attempts >= OTP_MAX_ATTEMPTS) {
      drop();
      return { ok: false, reason: "used", message: "Too many tries. Ask for a new code." };
    }
    if (!codeMatches(row.CodeHash, row.Salt, typed)) {
      row.Attempts += 1;
      if (row.Attempts >= OTP_MAX_ATTEMPTS) drop();
      return { ok: false, reason: "wrong", message: "That code doesn’t match. Please check the message." };
    }
    drop();
    return { ok: true };
  }

  try {
    const pool = await poolOf();
    const found = await pool
      .request()
      .input("phone", nine)
      .input("purpose", purpose)
      .query<{ Id: number; CodeHash: string; Salt: string; Attempts: number; Expires: number }>(
        `SELECT TOP 1 Id, CodeHash, Salt, Attempts,
                DATEDIFF(SECOND, sysutcdatetime(), ExpiresAt) AS Expires
           FROM ${OTP_TABLE}
          WHERE Phone = @phone AND Purpose = @purpose
          ORDER BY Id DESC`,
      );
    const row = found.recordset?.[0];
    if (!row) return { ok: false, reason: "none", message: "Ask for a code first." };

    const remove = () =>
      pool.request().input("id", row.Id).query(`DELETE FROM ${OTP_TABLE} WHERE Id = @id`);

    if (Number(row.Expires) < 0) {
      await remove();
      return { ok: false, reason: "expired", message: "That code has expired. Ask for a new one." };
    }
    if (Number(row.Attempts) >= OTP_MAX_ATTEMPTS) {
      await remove();
      return { ok: false, reason: "used", message: "Too many tries. Ask for a new code." };
    }
    if (!codeMatches(String(row.CodeHash), String(row.Salt), typed)) {
      const left = Number(row.Attempts) + 1;
      if (left >= OTP_MAX_ATTEMPTS) {
        await remove();
      } else {
        await pool
          .request()
          .input("id", row.Id)
          .input("attempts", left)
          .query(`UPDATE ${OTP_TABLE} SET Attempts = @attempts WHERE Id = @id`);
      }
      return { ok: false, reason: "wrong", message: "That code doesn’t match. Please check the message." };
    }

    // Spent: the row goes, not just its state.
    await remove();
    return { ok: true };
  } catch (error) {
    console.error("[otp] could not verify:", (error as Error)?.message);
    return { ok: false, reason: "database", message: "We couldn’t check that code just now. Please try again." };
  }
}

/**
 * The table, as `npm run otp:setup` creates it.
 *
 * No `ConsumedAt`: a code that has been used is gone. (An install that ran an
 * earlier version keeps the column; nothing reads it.)
 */
export const OTP_CREATE_SQL = (table: string) => `IF OBJECT_ID('${table}') IS NULL
BEGIN
  CREATE TABLE ${table} (
    Id          bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_Tbl_WebOtp PRIMARY KEY,
    Phone       varchar(20)  NOT NULL,
    Purpose     varchar(16)  NOT NULL CONSTRAINT DF_Tbl_WebOtp_Purpose DEFAULT ('signin'),
    CodeHash    varchar(64)  NOT NULL,
    Salt        varchar(32)  NOT NULL,
    Attempts    int          NOT NULL CONSTRAINT DF_Tbl_WebOtp_Attempts DEFAULT (0),
    ExpiresAt   datetime2(0) NOT NULL,
    CreatedAt   datetime2(0) NOT NULL CONSTRAINT DF_Tbl_WebOtp_Created DEFAULT (sysutcdatetime())
  );
  CREATE INDEX IX_Tbl_WebOtp_Phone ON ${table} (Phone, Purpose, CreatedAt DESC);
END;`;
