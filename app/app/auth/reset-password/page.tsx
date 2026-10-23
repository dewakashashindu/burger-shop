import type { Metadata } from "next";
import MicroEChef from "../../App";
export const metadata: Metadata = { title: "Reset password — MicroEChef", robots: { index: false, follow: false } };
export default function Page() { return <MicroEChef key="auth-reset-password" authPage="reset-password" />; }
