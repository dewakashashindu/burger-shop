# Round 21 — sign-in by text, wired end to end

Everything here is already in `burger-shop/`. This note is for applying the ZIP by hand.

## Files to delete

Round 20's six-stage auth UI is gone. Delete these folders if they are still present:

```
burger-shop/app/auth/forgot-password/
burger-shop/app/auth/otp/
burger-shop/app/auth/reset-password/
burger-shop/app/auth/verify-phone/
burger-shop/app/auth/auth-draft.ts
```

`app/auth/login/page.tsx` and `app/auth/signup/page.tsx` stay — they now render the
two-screen version in `app/auth/AuthScreen.tsx`.

## Before the first real sign-in

1. `npm install`
2. Put the values in `.env` (see `.env.example`):
   `TEXTLK_API_TOKEN`, `TEXTLK_SENDER_ID`, `AUTH_SECRET`, `WEB_LOC_CODE=01` and the DB values.
3. `npm run otp:setup` — creates `dbo.Tbl_WebOtp` and prints the `Tbl_TxnNumbers`
   row it will read (placeholder `LoCCode 01 · TxnType CC · Prefix A · TxnNo 3`,
   i.e. next code `A000004`). It never changes the counter.
4. `npm run db:order` if `Tbl_holdUpsCloudTempOO` or the `INV`/`ODN`/`DL`/`PU`
   counters are not in place yet.
5. Leave `WEB_AUTH_DEV` empty in production. `1` keeps accounts and codes in memory
   and prints the code to the server log instead of texting it.

## Where the numbers come from

| Value | Source |
| --- | --- |
| `CusCode` | `dbo.Tbl_TxnNumbers` → `Prefix` + `TxnNo + 1` padded to six (`A000004`), taken under `UPDLOCK, HOLDLOCK` in the same transaction as the INSERT |
| `LoCCode` | `WEB_LOC_CODE`, `01` |
| Invoice | `INV-YYYYMMDD-NNN` from `Tbl_Serials` (`SeriNo '5'`) |
| Reservation | `TR-0001` from `Tbl_Serials` |

## Codes are deleted, not marked

`dbo.Tbl_WebOtp` holds only codes that are still waiting. A row goes the moment the
process ends — verified, expired, replaced by a newer code, or after the fifth wrong
try — and a failed send removes it too. There is no `ConsumedAt` column in the new
table; if an earlier build made one, `npm run otp:setup` sweeps the spent rows out.

## Sign-up sends its own code

`/auth/signup` is details → six boxes. The code is requested with
`purpose: "signup"` (a number that already has an account is refused), and
`POST /api/auth/signup` verifies it before it writes anything. One code, one account,
and the guest is signed in as it lands.

## One thing to know about `Tbl_CustomerMaster`

The statements are built from the table's own columns (`INFORMATION_SCHEMA.COLUMNS`,
read once and cached). If the live book has no `CusWeb` — it doesn't — that column is
skipped, and every column it does have still gets its value. If the POS adds or drops a
column later, the first failed write drops the cache and retries with the new shape.

## Tests

```
cd tests
NODE_PATH=/path/to/playwright/node_modules node signin-popup-test.cjs
NODE_PATH=... node customer-code-test.cjs      # needs (cd ../burger-shop && npm run bundle:order)
NODE_PATH=... node entry-flow-test.cjs
NODE_PATH=... node redirect-test.cjs
NODE_PATH=... node fresh-order-test.cjs
NODE_PATH=... node tables-test.cjs
```

The browser suites need a server started with `WEB_AUTH_DEV=1` and no database, so
`/api/auth/send-code` hands the code back to the page. `hero-video-test.cjs` launches
Chrome for Testing because Playwright's Chromium has no H.264.
