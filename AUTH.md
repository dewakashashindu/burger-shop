# Sign-in — a phone, a text, and nothing else

The restaurant's website has no passwords. A guest proves a number with a six-digit
code sent by SMS (Text.lk); that code is the whole of the sign-in.

## The two screens

| Route | What it does |
| --- | --- |
| `/auth/login` | phone number → six-digit code → signed in |
| `/auth/signup` | name, phone, address (one to four lines), optional email → **a texted code** → account written, guest signed in |

There is no forgot-password, no reset and no Google button. The old six-stage
auth UI, its password stage and its OTP-reset screens are deleted.

Sign-up is two beats on one screen: the details, then six boxes. The code is
asked for with `purpose: "signup"` **before** anything is written, and the
account row is created in the same call that verifies it — so no account exists
until the number is proved, and a wrong, expired or spent code leaves the book
untouched. That one code signs the guest in as well; there is no second text.

## The popup at confirm

`app/SignInDialog.tsx` is drawn over the page (a portal on `<body>`, so the
booking page's own button and input rules cannot reach into it) whenever a
guest who is not signed in confirms a table, a room or an order.

1. **Phone** — prefilled from the form, but the field is separate: the sign-in
   number may be the same as the booking's number or a different one.
2. **The book is read first.** `POST /api/auth/send-code` looks the number up in
   `Tbl_CustomerMaster` **before** it makes or sends anything. A number with no
   account is answered `404 { reason: "no-account" }` — no code is generated, no
   row is written, no SMS is sent — and the popup opens the "new to us" step.
3. **Code** — six boxes, valid 5 minutes, resend after 60 seconds (a resend is
   held to one a minute, and a failed send retires the code so the cooldown does
   not block a guest who never received anything).
4. **New number** — "This number is new to us … no code has been sent" → **Create an account** goes to
   `/auth/signup?next=…`, the booking is parked in the draft, and after signing
   in the browser returns to `/reserve?resume=1`, where the confirmation that was
   waiting runs by itself.
5. **Known number** — the account's own name, email and address appear; the
   guest may edit them. Edits are written back to `Tbl_CustomerMaster`
   (name, email, `CusAdd1..4`). **The phone number cannot be changed** — it is
   how the account is found.

## The phone-first form

`/order` checkout, `/reserve` table and the room form all ask for the **phone
number before the name**. As the number is typed, `GET /api/auth/lookup` is asked
once (a 420 ms pause after the last keystroke):

- the number is the one in this session's cookie → the name fills itself, and on a
  delivery order the saved addresses (`CusAdd1..4`) appear as one-tap picks, the
  first already in the field;
- the number has an account but isn't proved here → nothing is filled; the form
  offers **Bring my details**, which opens the sign-in popup and then fills them;
- anything the guest typed themselves is never overwritten.

A number's own name and address are never handed to a browser that hasn't proved
that number — "has an account" is public, the details are not.

## Data

- **`dbo.Tbl_CustomerMaster`** — the guests' book. A person is found by the last
  nine digits of `RegTel`. Rows are inserted with `LoCCode` from `WEB_LOC_CODE`
  (`01`), `CreatedBy 'WEB'`, `Enable 1`.
  **Every statement is built from the columns the table actually has**
  (`lib/customer-sql.ts` reads `INFORMATION_SCHEMA.COLUMNS` once and caches the
  shape; `lib/customer.ts` re-reads it if SQL Server ever answers
  "Invalid column name"). The live table has no `CusWeb`, so that column is
  simply not written there; on a wider install it is.
- **Customer code** — allocated from the POS counter **`dbo.Tbl_TxnNumbers`**
  (row `LoCCode 01 · TxnType CC · Prefix A`): the stored `TxnNo` + 1 is taken,
  written back in the same transaction as the INSERT, and worn as
  `Prefix + six digits` — `A000004`, `A000005`, … The read uses
  `UPDLOCK, HOLDLOCK`, so two sign-ups at the same instant never share a code.
  A missing or disabled row is reported plainly; no placeholder code is ever
  invented.
- **`dbo.Tbl_WebOtp`** — the codes, and **only live ones**. A row is written when
  a text goes out and **deleted the moment the process ends**: verified, expired,
  replaced by a newer code, or after the fifth wrong try. Nothing is kept "for
  the record" — the table holds sha256(salt + ':' + code), never the code itself,
  and `Purpose` keeps the `signup` and `signin` codes apart.
  Create the table with `npm run otp:setup` (which also reports the
  `Tbl_TxnNumbers` row, the book's column count and how many web accounts exist).

## API

| Route | Purpose |
| --- | --- |
| `POST /api/auth/send-code` | `{ phone, purpose }` → texts a code. `signin` refuses a number with no account (`404 no-account`); `signup` refuses a number that already has one (`409 has-account`). Nothing is sent in either case. |
| `POST /api/auth/verify-code` | `{ phone, code }` → sets the session cookie, returns the account |
| `POST /api/auth/signup` | `{ name, phone, adds[], email, code }` → verifies the code, writes one row in the book, signs the guest in |
| `GET /api/auth/me` | who this browser is signed in as (read from the book) |
| `GET /api/auth/lookup?phone=` | what a booking form may fill in: name + saved addresses **only for the number this session proved**; any other number answers just `hasAccount` |
| `PATCH /api/auth/profile` | name / email / address of the signed-in guest |
| `POST /api/auth/logout` | forgets the cookie |

The session is one httpOnly cookie (`mila_session`) holding the number, a name
and an expiry, signed with `AUTH_SECRET` (HMAC-SHA256). The browser cannot read
or change it, and every page reads the guest back from the book, so a stale
name in the cookie never wins.

## Environment

```
TEXTLK_API_TOKEN=        # never reaches the browser
TEXTLK_SENDER_ID=
AUTH_SECRET=             # any long random string; without it a value derived from the DB settings is used
OTP_TABLE=dbo.Tbl_WebOtp
WEB_LOC_CODE=01
# CUSTOMER_SEQ_TABLE=dbo.Tbl_TxnNumbers
# CUSTOMER_SEQ_TYPE=CC
# CUSTOMER_SEQ_PADDING=6
WEB_AUTH_DEV=            # 1 = in-memory book + code printed to the server log (never in production)
```

With `WEB_AUTH_DEV=1` and no database, accounts and codes live in memory, the
SMS is not sent, and `/api/auth/send-code` returns `devCode` so the local
walkthrough and the test suites can read the code.

## Limits

Text.lk credentials and a database are required for real sign-in. The codes are
5-minute, single-use and capped at 5 wrong tries; resends are held to one a
minute. Nothing here protects against a compromised phone — that is the nature
of SMS.
