import type { Metadata } from "next";
import MicroEChef from "../../App";
export const metadata: Metadata = { title: "Sign up — MicroEChef", robots: { index: false, follow: false } };
export default function Page() { return <MicroEChef key="auth-signup" authPage="signup" />; }
