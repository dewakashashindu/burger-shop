"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";

type Kind = "table" | "room";
type Reservation = {
  id: string; locCode: string; kind: Kind; date?: string; timeFrom?: string; timeTo?: string;
  customerCode?: string; guestName?: string; guestPhone?: string; tableNo?: string; pax?: number;
  remarks?: string; cancelled: boolean; cancelledRemarks?: string; cancelledUser?: string; cancelledDateTime?: string;
  reservedBy?: string; reservedDate?: string; roomCode?: string; roomName?: string; checkIn?: string; checkOut?: string;
  nights?: number; adults?: number; children?: number; guestEmail?: string; guestIdNo?: string; country?: string;
  packageCode?: string; currency?: string; nightlyRate?: number; totalAmount?: number; arrivalTime?: string;
  departureTime?: string; arrivalBy?: string; requests?: string; status?: string;
};
type Column = { key: keyof Reservation; label: string };
type ApiResponse = { ok?: boolean; reservations?: Reservation[]; message?: string };

const ADMIN_EMAIL = "admin@microechef.lk";
const ADMIN_PASSWORD = "Admin123!";
const TABLE_COLUMNS: Column[] = [
  { key: "id", label: "Reservation ID" }, { key: "date", label: "Date" }, { key: "timeFrom", label: "Time from" },
  { key: "timeTo", label: "Time to" }, { key: "guestName", label: "Guest name" }, { key: "customerCode", label: "Customer code" },
  { key: "guestPhone", label: "Phone" }, { key: "tableNo", label: "Table no." }, { key: "pax", label: "Pax" },
  { key: "remarks", label: "Remarks" }, { key: "locCode", label: "Location" }, { key: "reservedBy", label: "Reserved by" },
  { key: "reservedDate", label: "Reserved date" }, { key: "cancelled", label: "Cancelled" },
  { key: "cancelledRemarks", label: "Cancel remarks" }, { key: "cancelledUser", label: "Cancelled user" },
  { key: "cancelledDateTime", label: "Cancelled date/time" },
];
const ROOM_COLUMNS: Column[] = [
  { key: "id", label: "Reservation ID" }, { key: "roomCode", label: "Room code" }, { key: "roomName", label: "Room name" },
  { key: "locCode", label: "Location" }, { key: "checkIn", label: "Check-in" }, { key: "checkOut", label: "Check-out" },
  { key: "nights", label: "Nights" }, { key: "adults", label: "Adults" }, { key: "children", label: "Children" },
  { key: "pax", label: "Pax" }, { key: "guestName", label: "Guest name" }, { key: "guestPhone", label: "Phone" },
  { key: "guestEmail", label: "Email" }, { key: "guestIdNo", label: "NIC / Passport" }, { key: "country", label: "Country" },
  { key: "packageCode", label: "Package" }, { key: "currency", label: "Currency" }, { key: "nightlyRate", label: "Nightly rate" },
  { key: "totalAmount", label: "Total amount" }, { key: "arrivalTime", label: "Arrival time" }, { key: "departureTime", label: "Departure time" },
  { key: "arrivalBy", label: "Arrival by" }, { key: "requests", label: "Requests" }, { key: "reservedBy", label: "Reserved by" },
  { key: "reservedDate", label: "Reserved date" }, { key: "status", label: "Status" }, { key: "cancelled", label: "Cancelled" },
  { key: "cancelledRemarks", label: "Cancel remarks" }, { key: "cancelledUser", label: "Cancelled user" },
  { key: "cancelledDateTime", label: "Cancelled date/time" },
];
const ALL_COLUMNS: Record<Kind, string[]> = {
  table: TABLE_COLUMNS.map((column) => String(column.key)),
  room: ROOM_COLUMNS.map((column) => String(column.key)),
};
function dateLabel(value?: string) {
  if (!value) return "—";
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en-LK", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}
function displayValue(item: Reservation, key: keyof Reservation) {
  const value = item[key];
  if (key === "date" || key === "checkIn" || key === "checkOut") return dateLabel(typeof value === "string" ? value : "");
  if (key === "reservedDate" || key === "cancelledDateTime") return typeof value === "string" && value.startsWith("1900-") ? "—" : String(value || "—");
  if (key === "cancelled") return item.cancelled ? "Yes" : "No";
  if (key === "status") return item.cancelled ? "Cancelled" : String(item.status || "Booked");
  if (key === "nightlyRate" || key === "totalAmount") return `${item.currency || ""} ${Number(value || 0).toLocaleString()}`.trim();
  if (typeof value === "number") return String(value);
  return String(value || "—");
}

export default function AdminReservations() {
  const [signedIn, setSignedIn] = useState(false);
  const [email, setEmail] = useState(ADMIN_EMAIL);
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [active, setActive] = useState<Kind>("table");
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All reservations");
  const [selected, setSelected] = useState<Reservation | null>(null);
  const [notice, setNotice] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState<Record<Kind, string[]>>(ALL_COLUMNS);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!signedIn) return;
    const controller = new AbortController();
    fetch(`/api/admin/reservations?kind=${active}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const data = await response.json() as ApiResponse;
        if (!response.ok || !data.ok) throw new Error(data.message || "Could not load reservations.");
        setReservations(Array.isArray(data.reservations) ? data.reservations : []);
        setError("");
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setReservations([]);
        setError(reason instanceof Error ? reason.message : "Could not load reservations.");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [signedIn, active, refreshKey]);

  const items = useMemo(() => reservations.filter((item) => {
    const query = search.trim().toLowerCase();
    const blob = Object.values(item).join(" ").toLowerCase();
    const searchMatch = !query || blob.includes(query);
    const statusMatch = statusFilter === "All reservations" || (statusFilter === "Cancelled" ? item.cancelled : !item.cancelled);
    return searchMatch && statusMatch;
  }), [reservations, search, statusFilter]);
  const columns = active === "table" ? TABLE_COLUMNS : ROOM_COLUMNS;
  const shownColumns = columns.filter((column) => visibleColumns[active].includes(String(column.key)));
  const activeCount = reservations.filter((item) => !item.cancelled).length;
  const cancelledCount = reservations.length - activeCount;

  function flash(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2800);
  }
  function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (email.trim().toLowerCase() === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
      setLoginError(""); setLoading(true); setSignedIn(true); return;
    }
    setLoginError("Incorrect email address or password.");
  }
  function selectKind(kind: Kind) {
    setActive(kind); setLoading(true); setError(""); setSearch(""); setStatusFilter("All reservations"); setColumnsOpen(false);
  }
  function refresh() { setLoading(true); setError(""); setRefreshKey((key) => key + 1); }
  function toggleColumn(key: string) {
    setVisibleColumns((previous) => ({ ...previous, [active]: previous[active].includes(key) ? previous[active].filter((item) => item !== key) : [...previous[active], key] }));
  }
  async function cancelReservation(item: Reservation) {
    if (!window.confirm(`Cancel reservation ${item.id}? This updates the SQL Server record.`)) return;
    setSaving(true);
    try {
      const response = await fetch("/api/admin/reservations", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: item.kind, locCode: item.locCode, resId: item.id, action: "cancel", reason: "Cancelled by restaurant admin" }) });
      const data = await response.json() as ApiResponse;
      if (!response.ok || !data.ok) throw new Error(data.message || "Could not cancel this reservation.");
      setSelected(null); flash(`Reservation ${item.id} cancelled.`); refresh();
    } catch (reason) { flash(reason instanceof Error ? reason.message : "Could not cancel this reservation."); }
    finally { setSaving(false); }
  }

  if (!signedIn) return (
    <main className="mm-admin-login"><div className="mm-admin-login-photo" aria-hidden="true"><div className="mm-admin-photo-caption"><span>Mila Mirissa</span><small>kitchen &amp; good company</small></div></div><div className="mm-admin-login-side"><form className="mm-login-card" onSubmit={login}>
      <div className="mm-admin-brand"><Image src="/images/mila-mirissa-admin-mark.png" alt="" width={50} height={50} /><span>Mila Mirissa<small>Reservations</small></span></div><p className="mm-eyebrow">RESTAURANT ADMIN</p><h1>Welcome back.</h1><p className="mm-login-sub">Sign in to manage table and room reservations.</p>
      <label>Email address<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" required /></label><label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required /></label>{loginError && <p className="mm-login-error" role="alert">{loginError}</p>}<button className="mm-primary mm-login-submit" type="submit">Sign in</button><p className="mm-admin-note">Internal development access only. Configure secure administrator authentication before public deployment.</p>
    </form></div></main>
  );

  return <main className="mm-admin-app">
    <aside className="mm-admin-sidebar"><Link className="mm-sidebar-brand" href="/" aria-label="Mila Mirissa home"><Image src="/images/mila-mirissa-admin-mark.png" alt="" width={42} height={42} /><span>Mila Mirissa<small>kitchen &amp; good company</small></span></Link>
      <nav className="mm-sidebar-nav" aria-label="Admin navigation"><button className="mm-nav-item mm-nav-selected" type="button" onClick={() => setSettingsOpen(false)}><span className="mm-nav-icon">▤</span>Reservations</button><div className="mm-subnav"><button className={active === "table" && !settingsOpen ? "mm-subnav-item active" : "mm-subnav-item"} type="button" onClick={() => { selectKind("table"); setSettingsOpen(false); }}>› &nbsp; Table Reservations</button><button className={active === "room" && !settingsOpen ? "mm-subnav-item active" : "mm-subnav-item"} type="button" onClick={() => { selectKind("room"); setSettingsOpen(false); }}>› &nbsp; Room Reservations</button></div><button className={settingsOpen ? "mm-nav-item mm-nav-selected" : "mm-nav-item"} type="button" onClick={() => setSettingsOpen(true)}><span className="mm-nav-icon">⚙</span>Settings</button></nav>
      <div className="mm-sidebar-bottom"><button className="mm-nav-item" type="button" onClick={() => { setSignedIn(false); setPassword(""); setSettingsOpen(false); setReservations([]); }}><span className="mm-nav-icon">↪</span>Sign out</button><div className="mm-admin-user"><span className="mm-user-avatar">MM</span><span><b>Restaurant Admin</b><small>Administrator</small></span></div></div>
    </aside>
    <section className="mm-admin-main"><header className="mm-admin-topbar"><div className="mm-top-title">Mila Mirissa <span>/</span> {settingsOpen ? "Settings" : "Reservations"}</div><div className="mm-top-right"><span className="mm-online-dot" /> Reservation management <span className="mm-user-avatar small">MM</span></div></header>
      <div className="mm-admin-content">{settingsOpen ? <><div className="mm-page-heading"><div><p className="mm-eyebrow">ADMINISTRATION</p><h1>Settings</h1><p>Account and reservation access.</p></div></div><section className="mm-panel mm-settings-panel"><h2>Administrator account</h2><div className="mm-setting-row"><span>Email</span><b>{ADMIN_EMAIL}</b></div><div className="mm-setting-row"><span>Authentication</span><b>Internal development access</b></div><p className="mm-admin-note">Reservation API is available only in development until server-side admin authentication is added.</p></section></> : <>
        <div className="mm-page-heading"><div><p className="mm-eyebrow">MILA MIRISSA · RESERVATIONS</p><h1>{active === "table" ? "Table reservations" : "Room reservations"}</h1><p>Live records from the restaurant reservation database.</p></div><button className="mm-secondary" type="button" onClick={refresh} disabled={loading}>{loading ? "Loading…" : "↻ Refresh"}</button></div>
        <div className="mm-summary-row"><div className="mm-summary-card"><span>{active === "table" ? "TABLE RESERVATION ROWS" : "ROOM RESERVATION ROWS"}</span><b>{String(reservations.length).padStart(2, "0")}</b><small>loaded from SQL Server</small></div><div className="mm-summary-card"><span>ACTIVE</span><b>{String(activeCount).padStart(2, "0")}</b><small>not cancelled</small></div><div className="mm-summary-card"><span>CANCELLED</span><b>{String(cancelledCount).padStart(2, "0")}</b><small>cancelled rows</small></div></div>
        <section className="mm-panel mm-reservation-panel"><div className="mm-panel-title"><div><h2>{active === "table" ? "Table bookings" : "Room stays"}</h2><p>Fields from {active === "table" ? "dbo.Tbl_TabelReservation" : "dbo.Tbl_RoomReservation"}</p></div><div className="mm-mode-switch"><button className={active === "table" ? "selected" : ""} onClick={() => selectKind("table")} type="button">Tables</button><button className={active === "room" ? "selected" : ""} onClick={() => selectKind("room")} type="button">Rooms</button></div></div>
          <div className="mm-filters"><label className="mm-search"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search reservation, guest, phone…" /></label><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filter reservations"><option>All reservations</option><option>Active</option><option>Cancelled</option></select><div className="mm-column-wrap"><button className="mm-secondary mm-columns-button" type="button" onClick={() => setColumnsOpen((open) => !open)}>☷ &nbsp; Columns</button>{columnsOpen && <div className="mm-column-menu">{columns.map((column) => <label key={String(column.key)}><input type="checkbox" checked={visibleColumns[active].includes(String(column.key))} onChange={() => toggleColumn(String(column.key))} /> {column.label}</label>)}</div>}</div><span className="mm-result-count">{items.length} record{items.length === 1 ? "" : "s"}</span></div>
          {error ? <div className="mm-db-error"><b>Unable to load reservation data</b><p>{error}</p><small>Set DB_SERVER, DB_DATABASE, DB_USER, and DB_PASSWORD in .env.local, then restart the application. The API is disabled in production until administrator authentication is configured.</small><button className="mm-secondary" type="button" onClick={refresh}>Try again</button></div> : loading ? <div className="mm-empty">Loading reservations from SQL Server…</div> : <div className="mm-table-wrap"><table className="mm-booking-table mm-wide-table"><thead><tr>{shownColumns.map((column) => <th key={String(column.key)}>{column.label.toUpperCase()}</th>)}<th>ACTION</th></tr></thead><tbody>{items.map((item, index) => <tr key={`${item.locCode}-${item.id}-${item.roomCode || item.tableNo || ""}-${index}`}>{shownColumns.map((column) => { const key = column.key; const value = displayValue(item, key); return <td key={String(key)}>{key === "id" ? <b className="mm-ref-cell">{value}</b> : key === "guestName" ? <strong>{value === "—" ? "Guest not linked" : value}</strong> : key === "cancelled" || key === "status" ? <span className={`mm-status ${item.cancelled ? "cancelled" : "confirmed"}`}>{value}</span> : <span className={key === "remarks" || key === "requests" ? "mm-wrap-cell" : ""}>{value}</span>}</td>; })}<td><button className="mm-view-button" type="button" onClick={() => setSelected(item)}>Details</button></td></tr>)}</tbody></table>{items.length === 0 && <div className="mm-empty">No reservation records match these filters.</div>}</div>}
        </section><p className="mm-admin-footnote">SQL Server records · Guest details are visible in development only · secure access is required before production</p>
      </>}</div>
    </section>
    {selected && <div className="mm-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null); }}><section className="mm-detail-modal" role="dialog" aria-modal="true" aria-label="Reservation details"><div className="mm-modal-heading"><div><p className="mm-eyebrow">{selected.kind === "table" ? "TABLE RESERVATION DETAILS" : "ROOM RESERVATION DETAILS"}</p><h2>{selected.guestName || "Guest not linked"}</h2><small>{selected.id} · {selected.locCode}</small></div><button type="button" className="mm-close" onClick={() => setSelected(null)} aria-label="Close">×</button></div><div className="mm-detail-list">{(selected.kind === "table" ? TABLE_COLUMNS : ROOM_COLUMNS).map((column) => <div key={String(column.key)}><span>{column.label}</span><b>{displayValue(selected, column.key)}</b></div>)}</div><div className="mm-detail-actions"><button type="button" className="mm-secondary" onClick={() => setSelected(null)}>Close</button>{!selected.cancelled && <button type="button" className="mm-danger" disabled={saving} onClick={() => void cancelReservation(selected)}>{saving ? "Cancelling…" : "Cancel reservation"}</button>}</div><p className="mm-admin-note">Cancellation updates the Cancel, CancelledRmks, CancelledUser, and CancelledDateTime fields in SQL Server.</p></section></div>}
    {notice && <div className="mm-toast" role="status">{notice}</div>}
  </main>;
}
