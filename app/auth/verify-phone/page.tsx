import type { Metadata } from "next";
import MicroEChef from "../../App";
export const metadata: Metadata = { title: "Verify your phone — Mila Mirissa", robots: { index: false, follow: false } };
export default function Page() { return <MicroEChef key="auth-verify-phone" authPage="verify-phone" />; }
