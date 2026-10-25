# `Tbl_holdUpsCloudTempOO` — Plan (v5) · **කේතයේ දාලා ඉවරයි**

> ✅ `lib/web-order.ts`, `scripts/db-order-setup.mjs`, `.env.example`, comments — හැම තැනකම අලුත් table එකට මාරු වෙලා.
> `tsc` + `eslint` clean · `next build` pass · fresh-order 7/7, entry-flow 28/28, motion 11/11, redirect 13/13.
> **ඉතුරු එකම දේ:** `npm run db:order` දාලා table එක verify කරලා, එක test order එකක් දාලා බලන එක (code එකෙන් ඒක automate කරන්න බෑ — DB එකට connect වෙන්න ඕන).

> **ඔයාගේ අලුත් table එක:** `dbo.Tbl_holdUpsCloudTempOO` (columns **30**, PK = `RowLine`).
> පරණ `dbo.Tbl_holdUpsCloudTempWeb` එක **අයින්** — දැන් order එක ලියන්නේ මේකට විතරයි.
> අංක 4ම (`INV` / `ODN` / `DL` / `PU`) වෙනස් වෙන්නේ නෑ — ඒවා එහෙමම `Tbl_Serials` එකෙන්.
> POS tables (`Tbl_HoldUpsCloud`, `Tbl_HoldUpsCloudTemp`, `Tbl_HoldUpsCloudTempQR`) වලට **මොනවත් ලියන්නේ නෑ**.

## 1. පරණ එකයි අලුත් එකයි — වෙනස

| | `Tbl_holdUpsCloudTempWeb` (පරණ) | `Tbl_holdUpsCloudTempOO` (අලුත්) |
|---|---|---|
| Columns | 31 (RowId + computed ScheduleDateTime ඇතුළුව) | **30** |
| `RowId` (identity) | තිබුණා · PK | **නෑ** |
| Primary key | `RowId` | **`RowLine`** (float) |
| `ScheduleDateTime` | computed persisted | **සැබෑ `datetime` column එකක්** (computed නම් ලියන්නේ නෑ — පහළ බලන්න) |
| `ScheduleTime` | `time(0)` | `time(7)` |
| අනිත් columns | එකම | එකම |

→ ඒ නිසා code එකේ වෙනස් වෙන්නේ **table නම + `ScheduleDateTime` එක column එකක් විදියට ලියන එක + string දිග limits** විතරයි. Business logic එක (prices, serials, transaction) එකම.

## 2. Column map — එකින් එක (30)

| # | Column | Type | අගය එන්නේ කොහෙන්ද | උදා. |
|---|---|---|---|---|
| 1 | `LocCode` | char(10) | `Tbl_LocationMaster.LocCode` (server එකේ resolve වෙනවා; pickup නම් guest තෝරන එක, delivery නම් පළවෙනි එක) | `001` |
| 2 | `TabelNo` | char(10) | `Tbl_Serials` → **`DL`** / **`PU`** | `DL-0001` · `PU-0001` |
| 3 | `OrderNo` | char(10) | `Tbl_Serials` → **`ODN`** (අකුරු නැති අංකය) | `1`, `2`, `3` |
| 4 | `UserID` | char(10) | ස්ථාවර | `WEB` |
| 5 | `UserName` | varchar(50) | ස්ථාවර | `WEB` |
| 6 | `AOR` | char(1) | ස්ථාවර (POS එකේ එකම අගය) | `A` |
| 7 | `ItemCode` | char(10) | menu view එකේ item code | `F0012` |
| 8 | `QTY` | float | cart එකේ quantity | `2` |
| 9 | `ItemRemarks` | varchar(500) | cart line remark → **500ට කපනවා** | `No chilli` |
| 10 | `TabelGrpID` | char(10) | web order එකට table group නෑ → `''` | `` |
| 11 | `TxnDateTime` | datetime | **ලංකා වේලාව**: `DATEADD(MINUTE,330,GETUTCDATE())` | `2026-10-25 04:12` |
| 12 | `LPax` | float | `0` (web order එකේ pax නෑ) | `0` |
| 13 | `FPax` | float | `0` | `0` |
| 14 | `MgrID` | char(10) | `''` | `` |
| 15 | `OrderType` | varchar(5) | UI එකේ delivery/pickup | `DL` · `PU` |
| 16 | `SalesPrice` | float | **`Vw_MenuAssignment.SalesPrice` — browser එකෙන් ගන්නේ නෑ** | `1450` |
| 17 | `VoidRemark` | varchar(200) | `''` | `` |
| 18 | `InvoiceNo` | varchar(50) | `INV-YYYYMMDD-NNN` (ලංකා දවස, `SeriDate` තියෙනවා නම් දවසට reset) | `INV-20261025-001` |
| 19 | `IsPaid` | bit | `0` (POS එකේදි ගෙවනවා) | `0` |
| 20 | `CusName` | varchar(200) | checkout එකේ නම → **200ට කපනවා** | `Nimal Perera` |
| 21 | `CusCode` | char(10) | `''` (customer master match එකක් නෑ) | `` |
| 22 | `RowLine` | float **PK** | `MAX(RowLine)+1` — `TABLOCKX, HOLDLOCK` (QR එකේ විදිහම) | `1, 2, 3…` |
| 23 | `ScheduleDate` | date | cart එකේ තෝරපු දවස | `2026-10-25` |
| 24 | `ScheduleTime` | time(7) | cart එකේ තෝරපු වෙලාව | `19:30` |
| 25 | `ScheduleDateTime` | datetime | **`ScheduleDate` + `ScheduleTime`** (`DATEADD(minute, DATEDIFF(minute,0,@time), CAST(@date AS datetime))`) — column එක **computed** නම් INSERT එකෙන් අයින් වෙනවා | `2026-10-25 19:30` |
| 26 | `CusPhone` | varchar(20) | phone → **20ට කපනවා** | `0771234567` |
| 27 | `CusAddress` | varchar(300) | delivery address → **300ට කපනවා** | `12 Galle Rd, Mirissa` |
| 28 | `CusLoc` | varchar(100) | location එකේ නම (`LocDes`) → **100ට කපනවා** | `Mirissa — Beach Road` |
| 29 | `DeliveryFee` | float | Delivery `350` · Pickup `0` | `350` |
| 30 | `OrderNote` | varchar(500) | checkout note → **500ට කපනවා** | `Ring the bell` |

## 3. Code එකේ වෙනස් වෙන තැන් (files)

| File | වෙනස |
|---|---|
| `lib/web-order.ts` | `WEB_ORDER_TABLE` → `dbo.Tbl_holdUpsCloudTempOO` (`.env` එකෙන් `WEB_ORDER_TABLE` දාලා override කරන්නත් පුළුවන්). INSERT එකට **`ScheduleDateTime`** එකතු. හැම text එකක්ම column දිගට කපනවා (200/500/300/100/20/50). `readOrderShape()` — table එකේ columns + `is_computed` කියවලා, `ScheduleDateTime` computed නම් ඒක ලියන්නේ නෑ |
| `scripts/db-order-setup.mjs` | `npm run db:order` දැන් හදන්නේ `Tbl_holdUpsCloudTempOO` — columns 30, `RowLine` PK, `ScheduleDateTime` සාමාන්‍ය `datetime` (computed නෙවෙයි), index නම් `IX_HoldUpsCloudTempOO_*`. Table එක දැනටමත් තියෙනවා නම් **හදන්නේ නෑ, verify කරනවා විතරයි** |
| `.env.example` | comment එක අලුත් table නමට + `WEB_ORDER_TABLE=` (optional) |
| `app/api/order/confirm/route.ts`, `app/reserve/BookingFlow.tsx` | comments විතරයි (table නම) |
| `AGENTS.md` / `MOTION.md` | “එකම ලියන table එක” කියන තැන් |
| `Tbl_holdUpsCloudTempWeb-PLAN.md` | මේක **superseded** — උඩින් note එකක් දාලා තියාගන්නවා (history) |

**වෙනස් නොවෙන දේ:** cart UI, checkout form, success screen (invoice අංකය පෙන්නනවා), reservation flow, menu, prices server-side, serial rules, transaction + rollback, POS tables.

## 4. Safety — code එකේ තියෙන guards

1. **Transaction එකක්** — rows 2ක් වුණත් එකට commit/rollback. එකක් fail වුණොත් කිසිම row එකක් ඉතුරු වෙන්නේ නෑ.
2. **`TABLOCKX, HOLDLOCK`** — `RowLine = MAX+1` එකට. `RowLine` දැන් PK නිසා duplicate එකක් වුණොත් order එක fail වෙනවා; lock එකේ ඒක වෙන්නේ නෑ.
3. **Prices server-side** — browser එකෙන් එන මිලක් කවදාවත් ලියන්නේ නෑ; `Vw_MenuAssignment` එකෙන්.
4. **String caps** — column දිගට වඩා ලියලා “String or binary data would be truncated” error එක එන්නේ නෑ.
5. **`ScheduleDateTime` detection** — ඒක computed column එකක් වුණත් plain එකක් වුණත් දෙකේම වැඩ කරනවා (`sys.columns.is_computed`).
6. **Table නැත්නම්** — site එකේ පැහැදිලි error එකක් (`Run: npm run db:order`), fake success එකක් නෑ.

## 5. Live කරන්න පියවර

```bash
1) npm run db:order          # table එක තියෙනවා ද කියලා බලනවා (හදන්නේ නෑ), columns 30 කියලා verify
2) npm run dev               # හෝ ඔයාගේ server එක restart
3) /order → item එකක් → cart → date/time → checkout → Place order
4) DB එකේ බලන්න:
   SELECT TOP 5 LocCode, TabelNo, OrderNo, InvoiceNo, RowLine, OrderType,
                SalesPrice, ScheduleDate, ScheduleTime, ScheduleDateTime,
                CusName, CusPhone, DeliveryFee, TxnDateTime
     FROM dbo.Tbl_holdUpsCloudTempOO ORDER BY RowLine DESC;
```

Success screen එකේ පෙන්නන්නේ **invoice අංකය** (`INV-20261025-001`) — නිකන් `order 36` නෙවෙයි.

## 6. මට තහවුරු කරන්න ඕන 3ක් (ඉක්මනට උත්තර දෙන්න)

1. **`ScheduleDateTime`** — computed column එකක්ද, නැත්නම් ඔයා ලියන සාමාන්‍ය column එකක්ද? (code එක දෙකටම වැඩ කරනවා, ඒත් දැනගන්න ඕන)
2. **`RowLine` = PK, float** — POS එකේ insert එකට ප්‍රශ්නයක් නම් `int` / `decimal(18,0)` කරන්න පුළුවන්; දැනට ඒක එහෙමම තියලා `MAX+1` දානවා. වෙනස් කරන්නද?
3. පරණ `Tbl_holdUpsCloudTempWeb` එකට **දිගටම ලියන්න ඕනද** (parallel, දෙකටම) නැත්නම් අලුත් එකට විතරද? (default: **අලුත් එකට විතරයි**)
