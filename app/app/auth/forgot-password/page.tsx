import type { Metadata } from "next";
import MicroEChef from "../../App";
export const metadata: Metadata = { title: "Forgot password — MicroEChef", robots: { index: false, follow: false } };
export default function Page() { return <MicroEChef key="auth-forgot-password" authPage="forgot-password" />; }
