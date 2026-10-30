import AdminReservations from "./AdminReservations";
import "./admin.css";

export const metadata = {
  title: "Reservations | Mila Mirissa",
  robots: { index: false, follow: false },
};

export default function AdminPage() {
  return <AdminReservations />;
}
